from __future__ import annotations

import csv
import io
import re
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response

from ..db import (
    CONDITIONS,
    audit,
    get_status_by_kind,
    resolve_user_person_id,
    row_to_dict,
    rows_to_dicts,
)
from ..deps import AdminUser, Db, User
from ..schemas import AssetPayload, BulkAssetUploadPayload


router = APIRouter(prefix="/assets", tags=["assets"])


ASSET_SELECT = """
SELECT assets.*,
       asset_categories.name AS category_name,
       asset_statuses.name AS status_name,
       asset_statuses.kind AS status_kind,
       locations.name AS location_name,
       people.full_name AS assigned_to,
       asset_assignments.person_id AS assigned_person_id,
       asset_assignments.expected_return_on
FROM assets
LEFT JOIN asset_categories ON asset_categories.id = assets.category_id
LEFT JOIN asset_statuses ON asset_statuses.id = assets.status_id
LEFT JOIN locations ON locations.id = assets.location_id
LEFT JOIN asset_assignments ON asset_assignments.asset_id = assets.id
     AND asset_assignments.status = 'active'
LEFT JOIN people ON people.id = asset_assignments.person_id
"""


@router.get("")
def list_assets(conn: Db, user: User):
    if user["role"] == "admin":
        rows = conn.execute(f"{ASSET_SELECT} ORDER BY assets.asset_tag").fetchall()
    else:
        person_id = resolve_user_person_id(conn, user)
        if not person_id:
            return []
        rows = conn.execute(
            f"""
            {ASSET_SELECT}
            WHERE asset_assignments.person_id = ?
            ORDER BY assets.asset_tag
            """,
            (person_id,),
        ).fetchall()
    return rows_to_dicts(rows)


@router.get("/template.csv")
def asset_template(user: User):
    content = (
        "asset_tag,name,category,status,location,serial_number,purchase_date,warranty_end,purchase_cost,condition,notes\n"
        "LAP-001,Dell Latitude 5450,Laptop,Available,IT Closet,SN123,2026-01-15,2029-01-15,65000,Good,Assigned pool laptop\n"
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="asset-upload-template.csv"'},
    )


@router.post("")
def create_asset(payload: AssetPayload, conn: Db, user: AdminUser):
    status = get_status(conn, payload.status_id)
    validate_condition(payload.condition)
    location_name = get_location_name(conn, payload.location_id)
    try:
        purchase_date = validate_iso_date(payload.purchase_date, "Purchase Date")
        warranty_end = validate_iso_date(payload.warranty_end, "Warranty End")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    cur = conn.execute(
        """
        INSERT INTO assets(asset_tag, name, category_id, status_id, location_id,
                           serial_number, purchase_date, warranty_end, purchase_cost,
                           condition, status, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.asset_tag.strip(),
            payload.name.strip(),
            payload.category_id,
            payload.status_id,
            payload.location_id,
            payload.serial_number or None,
            purchase_date,
            warranty_end,
            payload.purchase_cost,
            payload.condition,
            status["kind"],
            location_name,
            payload.notes or None,
        ),
    )
    audit(conn, user["id"], "create", "asset", cur.lastrowid, payload.asset_tag)
    conn.commit()
    return get_asset(conn, cur.lastrowid)


@router.put("/{asset_id}")
def update_asset(asset_id: int, payload: AssetPayload, conn: Db, user: AdminUser):
    status = get_status(conn, payload.status_id)
    validate_condition(payload.condition)
    try:
        purchase_date = validate_iso_date(payload.purchase_date, "Purchase Date")
        warranty_end = validate_iso_date(payload.warranty_end, "Warranty End")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    active_assignment = conn.execute(
        "SELECT id FROM asset_assignments WHERE asset_id = ? AND status = 'active'",
        (asset_id,),
    ).fetchone()
    if active_assignment and status["kind"] != "assigned":
        raise HTTPException(status_code=400, detail="Return this asset before changing it away from an assigned status")
    location_name = get_location_name(conn, payload.location_id)
    cur = conn.execute(
        """
        UPDATE assets
        SET asset_tag = ?, name = ?, category_id = ?, status_id = ?, location_id = ?,
            serial_number = ?, purchase_date = ?, warranty_end = ?, purchase_cost = ?,
            condition = ?, status = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            payload.asset_tag.strip(),
            payload.name.strip(),
            payload.category_id,
            payload.status_id,
            payload.location_id,
            payload.serial_number or None,
            purchase_date,
            warranty_end,
            payload.purchase_cost,
            payload.condition,
            status["kind"],
            location_name,
            payload.notes or None,
            asset_id,
        ),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    audit(conn, user["id"], "update", "asset", asset_id, payload.asset_tag)
    conn.commit()
    return get_asset(conn, asset_id)


@router.post("/bulk-upload")
def bulk_upload_assets(payload: BulkAssetUploadPayload, conn: Db, user: AdminUser):
    reader = csv.DictReader(io.StringIO(payload.csv_text))
    required = {"asset_tag", "name"}
    if not reader.fieldnames or not required.issubset({field.strip() for field in reader.fieldnames}):
        raise HTTPException(status_code=400, detail="CSV must include asset_tag and name columns")

    created = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    for index, row in enumerate(reader, start=2):
        try:
            if None in row:
                raise ValueError("Row has more values than headers")
            normalized = {str(key or "").strip().lower(): str(value or "").strip() for key, value in row.items()}
            asset_tag = normalized.get("asset_tag", "")
            name = normalized.get("name", "")
            if not asset_tag or not name:
                raise ValueError("asset_tag and name are required")
            status = find_active_status(conn, normalized.get("status"))
            category_id = find_active_master_id(conn, "asset_categories", normalized.get("category"), "Category")
            location_id = find_active_master_id(conn, "locations", normalized.get("location"), "Location")
            location_name = get_location_name(conn, location_id)
            condition = normalized.get("condition") or "Good"
            validate_condition(condition)
            purchase_date = normalize_csv_date(normalized.get("purchase_date"), "purchase_date")
            warranty_end = normalize_csv_date(normalized.get("warranty_end"), "warranty_end")
            purchase_cost = normalize_csv_number(normalized.get("purchase_cost") or normalized.get("asset_value"), "purchase_cost")
            existing = conn.execute("SELECT id FROM assets WHERE asset_tag = ?", (asset_tag,)).fetchone()
            values = (
                name,
                category_id,
                status["id"],
                location_id,
                normalized.get("serial_number") or None,
                purchase_date,
                warranty_end,
                purchase_cost,
                condition,
                status["kind"],
                location_name,
                normalized.get("notes") or None,
            )
            if existing:
                conn.execute(
                    """
                    UPDATE assets
                    SET name = ?, category_id = ?, status_id = ?, location_id = ?,
                        serial_number = ?, purchase_date = ?, warranty_end = ?, purchase_cost = ?,
                        condition = ?, status = ?, location = ?, notes = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    values + (existing["id"],),
                )
                updated += 1
                audit(conn, user["id"], "bulk_update", "asset", existing["id"], asset_tag)
            else:
                cur = conn.execute(
                    """
                    INSERT INTO assets(asset_tag, name, category_id, status_id, location_id,
                                       serial_number, purchase_date, warranty_end, purchase_cost,
                                       condition, status, location, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (asset_tag,) + values,
                )
                created += 1
                audit(conn, user["id"], "bulk_create", "asset", cur.lastrowid, asset_tag)
        except Exception as exc:
            errors.append({"row": index, "error": str(exc)})
    conn.commit()
    return {"created": created, "updated": updated, "errors": errors}


def get_asset(conn, asset_id: int) -> dict:
    row = conn.execute(f"{ASSET_SELECT} WHERE assets.id = ?", (asset_id,)).fetchone()
    asset = row_to_dict(row)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


def get_status(conn, status_id: int) -> dict:
    row = conn.execute("SELECT * FROM asset_statuses WHERE id = ?", (status_id,)).fetchone()
    status = row_to_dict(row)
    if not status:
        raise HTTPException(status_code=400, detail="Status not found")
    return status


def get_location_name(conn, location_id: Optional[int]) -> Optional[str]:
    if not location_id:
        return None
    row = conn.execute("SELECT name FROM locations WHERE id = ?", (location_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Location not found")
    return row["name"]


def validate_condition(condition: str) -> None:
    if condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Condition must be one of: {', '.join(CONDITIONS)}")


def validate_iso_date(value: Optional[str], label: str) -> Optional[str]:
    clean = (value or "").strip()
    if not clean:
        return None
    try:
        parsed = date.fromisoformat(clean)
    except ValueError as exc:
        raise ValueError(f"{label} must use YYYY-MM-DD, for example 2026-06-04") from exc
    if parsed.isoformat() != clean:
        raise ValueError(f"{label} must use YYYY-MM-DD, for example 2026-06-04")
    return clean


def normalize_csv_date(value: Optional[str], label: str) -> Optional[str]:
    clean = (value or "").strip()
    if not clean:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", clean):
        return validate_iso_date(clean, label)

    match = re.fullmatch(r"(\d{1,2})([/-])(\d{1,2})\2(\d{2}|\d{4})", clean)
    if not match:
        raise ValueError(f"{label} must use YYYY-MM-DD, or an unambiguous Excel date like 14-06-2026")

    first = int(match.group(1))
    separator = match.group(2)
    second = int(match.group(3))
    year = int(match.group(4))
    if year < 100:
        year += 2000

    if separator == "-":
        day, month = first, second
    elif second > 12:
        month, day = first, second
    elif first > 12:
        day, month = first, second
    else:
        raise ValueError(f"{label} is ambiguous. Use YYYY-MM-DD, for example 2026-06-04")

    try:
        return date(year, month, day).isoformat()
    except ValueError as exc:
        raise ValueError(f"{label} must be a real calendar date") from exc


def normalize_csv_number(value: Optional[str], label: str) -> Optional[float]:
    clean = (value or "").strip().replace(",", "")
    if not clean:
        return None
    try:
        amount = float(clean)
    except ValueError as exc:
        raise ValueError(f"{label} must be a valid number") from exc
    if amount < 0:
        raise ValueError(f"{label} cannot be negative")
    return amount


def find_active_status(conn: Db, name: str | None):
    clean = (name or "").strip()
    if not clean:
        return get_status_by_kind(conn, "available")
    row = conn.execute(
        """
        SELECT *
        FROM asset_statuses
        WHERE LOWER(name) = LOWER(?)
          AND active = 1
        """,
        (clean,),
    ).fetchone()
    if not row:
        raise ValueError(f"Status '{clean}' does not exist or is inactive. Add/activate it in Master Tables first.")
    return row


def find_active_master_id(conn: Db, table: str, name: str | None, label: str) -> Optional[int]:
    clean = (name or "").strip()
    if not clean:
        return None
    if table not in {"asset_categories", "locations"}:
        raise ValueError("Invalid master table")
    row = conn.execute(
        f"""
        SELECT id
        FROM {table}
        WHERE LOWER(name) = LOWER(?)
          AND active = 1
        """,
        (clean,),
    ).fetchone()
    if not row:
        raise ValueError(f"{label} '{clean}' does not exist or is inactive. Add/activate it in Master Tables first.")
    return row["id"]
