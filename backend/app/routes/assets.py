from __future__ import annotations

import csv
import io
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response

from ..db import (
    CONDITIONS,
    audit,
    find_status,
    get_or_create_category,
    get_or_create_location,
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
    rows = conn.execute(f"{ASSET_SELECT} ORDER BY assets.asset_tag").fetchall()
    return rows_to_dicts(rows)


@router.get("/template.csv")
def asset_template(user: User):
    content = (
        "asset_tag,name,category,status,location,serial_number,purchase_date,warranty_end,condition,notes\n"
        "LAP-001,Dell Latitude 5450,Laptop,Available,IT Closet,SN123,2026-01-15,2029-01-15,Good,Assigned pool laptop\n"
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
    cur = conn.execute(
        """
        INSERT INTO assets(asset_tag, name, category_id, status_id, location_id,
                           serial_number, purchase_date, warranty_end, condition,
                           status, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.asset_tag.strip(),
            payload.name.strip(),
            payload.category_id,
            payload.status_id,
            payload.location_id,
            payload.serial_number or None,
            payload.purchase_date or None,
            payload.warranty_end or None,
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
            serial_number = ?, purchase_date = ?, warranty_end = ?, condition = ?,
            status = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            payload.asset_tag.strip(),
            payload.name.strip(),
            payload.category_id,
            payload.status_id,
            payload.location_id,
            payload.serial_number or None,
            payload.purchase_date or None,
            payload.warranty_end or None,
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
            status = find_status(conn, normalized.get("status"))
            category_id = get_or_create_category(conn, normalized.get("category"))
            location_id = get_or_create_location(conn, normalized.get("location"))
            location_name = get_location_name(conn, location_id)
            condition = normalized.get("condition") or "Good"
            validate_condition(condition)
            existing = conn.execute("SELECT id FROM assets WHERE asset_tag = ?", (asset_tag,)).fetchone()
            values = (
                name,
                category_id,
                status["id"],
                location_id,
                normalized.get("serial_number") or None,
                normalized.get("purchase_date") or None,
                normalized.get("warranty_end") or None,
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
                        serial_number = ?, purchase_date = ?, warranty_end = ?,
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
                                       serial_number, purchase_date, warranty_end, condition,
                                       status, location, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
