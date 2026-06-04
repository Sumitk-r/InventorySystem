from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from typing import Optional, Tuple

from fastapi import APIRouter, Response

from ..db import resolve_user_person_id, rows_to_dicts
from ..deps import Db, User


router = APIRouter(tags=["reports"])


@router.get("/dashboard")
def dashboard(conn: Db, user: User):
    today = date.today().isoformat()
    week_out = (date.today() + timedelta(days=7)).isoformat()
    person_id = resolve_user_person_id(conn, user) if user["role"] != "admin" else None
    if user["role"] != "admin" and not person_id:
        return {"stats": empty_stats(), "overdue": []}

    if user["role"] == "admin":
        stats = {
            "total_assets": scalar(conn, "SELECT COUNT(*) FROM assets WHERE status != 'retired'"),
            "available_assets": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM assets
                LEFT JOIN asset_statuses ON asset_statuses.id = assets.status_id
                WHERE asset_statuses.kind = 'available'
                """,
            ),
            "active_assignments": scalar(conn, "SELECT COUNT(*) FROM asset_assignments WHERE status = 'active'"),
            "overdue": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM asset_assignments
                WHERE status = 'active'
                  AND expected_return_on IS NOT NULL
                  AND expected_return_on < ?
                """,
                (today,),
            ),
            "due_soon": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM asset_assignments
                WHERE status = 'active'
                  AND expected_return_on BETWEEN ? AND ?
                """,
                (today, week_out),
            ),
        }
        overdue_params = (today,)
        overdue_filter = ""
    else:
        stats = {
            "total_assets": scalar(
                conn,
                """
                SELECT COUNT(DISTINCT asset_id)
                FROM asset_assignments
                WHERE status = 'active'
                  AND person_id = ?
                """,
                (person_id,),
            ),
            "available_assets": 0,
            "active_assignments": scalar(
                conn,
                "SELECT COUNT(*) FROM asset_assignments WHERE status = 'active' AND person_id = ?",
                (person_id,),
            ),
            "overdue": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM asset_assignments
                WHERE status = 'active'
                  AND person_id = ?
                  AND expected_return_on IS NOT NULL
                  AND expected_return_on < ?
                """,
                (person_id, today),
            ),
            "due_soon": scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM asset_assignments
                WHERE status = 'active'
                  AND person_id = ?
                  AND expected_return_on BETWEEN ? AND ?
                """,
                (person_id, today, week_out),
            ),
        }
        overdue_params = (today, person_id)
        overdue_filter = "AND aa.person_id = ?"
    overdue = conn.execute(
        f"""
        SELECT aa.id, aa.expected_return_on, assets.asset_tag, assets.name AS asset_name,
               people.full_name AS person_name, departments.name AS department_name
        FROM asset_assignments aa
        JOIN assets ON assets.id = aa.asset_id
        JOIN people ON people.id = aa.person_id
        LEFT JOIN departments ON departments.id = people.department_id
        WHERE aa.status = 'active'
          AND aa.expected_return_on IS NOT NULL
          AND aa.expected_return_on < ?
          {overdue_filter}
        ORDER BY aa.expected_return_on ASC
        LIMIT 10
        """,
        overdue_params,
    ).fetchall()
    return {"stats": stats, "overdue": rows_to_dicts(overdue)}


@router.get("/reports/weekly")
def weekly_report(conn: Db, user: User, from_date: Optional[str] = None, to_date: Optional[str] = None):
    start, end = report_range(from_date, to_date)
    return {"from": start, "to": end, "sections": build_weekly_report(conn, start, end, user)}


@router.get("/reports/weekly.csv")
def weekly_report_csv(conn: Db, user: User, from_date: Optional[str] = None, to_date: Optional[str] = None):
    start, end = report_range(from_date, to_date)
    report = build_weekly_report(conn, start, end, user)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Section",
            "Asset Tag",
            "Asset",
            "Person",
            "Department",
            "Assigned On",
            "Expected Return",
            "Returned On",
            "Return Condition",
            "Status",
            "Notes",
        ]
    )
    for section, rows in report.items():
        for row in rows:
            writer.writerow(
                [
                    section,
                    row.get("asset_tag", ""),
                    row.get("asset_name") or row.get("name", ""),
                    row.get("person_name", ""),
                    row.get("department_name") or "",
                    row.get("assigned_on", ""),
                    row.get("expected_return_on") or "",
                    row.get("returned_on") or "",
                    row.get("return_condition") or "",
                    row.get("status_name") or row.get("status", ""),
                    row.get("notes") or "",
                ]
            )
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="weekly-report-{start}-to-{end}.csv"'},
    )


def scalar(conn, sql: str, params: tuple = ()) -> int:
    return int(conn.execute(sql, params).fetchone()[0])


def empty_stats() -> dict:
    return {
        "total_assets": 0,
        "available_assets": 0,
        "active_assignments": 0,
        "overdue": 0,
        "due_soon": 0,
    }


def report_range(from_date: Optional[str], to_date: Optional[str]) -> Tuple[str, str]:
    end = to_date or date.today().isoformat()
    start = from_date or (date.today() - timedelta(days=6)).isoformat()
    return start, end


def build_weekly_report(conn, start: str, end: str, user: User) -> dict:
    today = date.today().isoformat()
    person_id = resolve_user_person_id(conn, user) if user["role"] != "admin" else None
    if user["role"] != "admin" and not person_id:
        return empty_report()
    assignment_filter = "AND aa.person_id = ?" if user["role"] != "admin" else ""
    asset_filter = (
        "AND assets.id IN (SELECT asset_id FROM asset_assignments WHERE person_id = ?)"
        if user["role"] != "admin"
        else ""
    )
    person_params = (person_id,) if user["role"] != "admin" else ()
    asset_select = """
        SELECT assets.*, asset_categories.name AS category_name,
               asset_statuses.name AS status_name,
               asset_statuses.kind AS status_kind,
               locations.name AS location_name
        FROM assets
        LEFT JOIN asset_categories ON asset_categories.id = assets.category_id
        LEFT JOIN asset_statuses ON asset_statuses.id = assets.status_id
        LEFT JOIN locations ON locations.id = assets.location_id
    """
    base_select = """
        SELECT aa.*, assets.asset_tag, assets.name AS asset_name,
               people.full_name AS person_name, people.person_type,
               departments.name AS department_name
        FROM asset_assignments aa
        JOIN assets ON assets.id = aa.asset_id
        JOIN people ON people.id = aa.person_id
        LEFT JOIN departments ON departments.id = people.department_id
    """
    if getattr(conn, "is_postgres", False):
        overdue = conn.execute(
            f"""
            SELECT *, (?::date - expected_return_on::date) AS days_late
            FROM ({base_select}) AS report_rows
            WHERE status = 'active'
              AND expected_return_on IS NOT NULL
              AND expected_return_on < ?
              {"AND person_id = ?" if user["role"] != "admin" else ""}
            ORDER BY expected_return_on ASC
            """,
            (today, today) + person_params,
        ).fetchall()
    else:
        overdue = conn.execute(
            f"""
            SELECT *, CAST(julianday(?) - julianday(expected_return_on) AS INTEGER) AS days_late
            FROM ({base_select})
            WHERE status = 'active'
              AND expected_return_on IS NOT NULL
              AND expected_return_on < ?
              {"AND person_id = ?" if user["role"] != "admin" else ""}
            ORDER BY expected_return_on ASC
            """,
            (today, today) + person_params,
        ).fetchall()
    due_soon = conn.execute(
        f"""
        {base_select}
        WHERE aa.status = 'active'
          AND aa.expected_return_on BETWEEN ? AND ?
          {assignment_filter}
        ORDER BY aa.expected_return_on ASC
        """,
        (start, end) + person_params,
    ).fetchall()
    assigned = conn.execute(
        f"""
        {base_select}
        WHERE aa.assigned_on BETWEEN ? AND ?
          {assignment_filter}
        ORDER BY aa.assigned_on DESC
        """,
        (start, end) + person_params,
    ).fetchall()
    returned = conn.execute(
        f"""
        {base_select}
        WHERE aa.returned_on BETWEEN ? AND ?
          {assignment_filter}
        ORDER BY aa.returned_on DESC
        """,
        (start, end) + person_params,
    ).fetchall()
    available_assets = conn.execute(
        f"""
        {asset_select}
        WHERE asset_statuses.kind = 'available'
          {asset_filter}
        ORDER BY assets.asset_tag
        """,
        person_params,
    ).fetchall()
    assigned_assets = conn.execute(
        f"""
        {base_select}
        WHERE aa.status = 'active'
          {assignment_filter}
        ORDER BY COALESCE(aa.expected_return_on, '9999-12-31'), aa.assigned_on DESC
        """,
        person_params,
    ).fetchall()
    maintenance_assets = conn.execute(
        f"""
        {asset_select}
        WHERE asset_statuses.kind = 'maintenance'
          {asset_filter}
        ORDER BY assets.asset_tag
        """,
        person_params,
    ).fetchall()
    returned_assets = conn.execute(
        f"""
        {base_select}
        WHERE aa.status IN ('returned', 'lost')
          {assignment_filter}
        ORDER BY aa.returned_on DESC, aa.created_at DESC
        """,
        person_params,
    ).fetchall()
    return {
        "overdue": rows_to_dicts(overdue),
        "due_soon": rows_to_dicts(due_soon),
        "assigned_in_range": rows_to_dicts(assigned),
        "returned_in_range": rows_to_dicts(returned),
        "available_assets": rows_to_dicts(available_assets),
        "assigned_assets": rows_to_dicts(assigned_assets),
        "maintenance_assets": rows_to_dicts(maintenance_assets),
        "returned_assets": rows_to_dicts(returned_assets),
    }


def empty_report() -> dict:
    return {
        "overdue": [],
        "due_soon": [],
        "assigned_in_range": [],
        "returned_in_range": [],
        "available_assets": [],
        "assigned_assets": [],
        "maintenance_assets": [],
        "returned_assets": [],
    }
