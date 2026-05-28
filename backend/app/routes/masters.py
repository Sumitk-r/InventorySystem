from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import STATUS_KINDS, audit, rows_to_dicts
from ..deps import AdminUser, Db, User
from ..schemas import MasterPayload, StatusPayload


router = APIRouter(prefix="/masters", tags=["masters"])


def clean_name(name: str) -> str:
    value = name.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Name is required")
    return value


@router.get("/categories")
def list_categories(conn: Db, user: User):
    rows = conn.execute(
        """
        SELECT asset_categories.*,
               COUNT(assets.id) AS asset_count
        FROM asset_categories
        LEFT JOIN assets ON assets.category_id = asset_categories.id
        GROUP BY asset_categories.id
        ORDER BY asset_categories.active DESC, asset_categories.name
        """
    ).fetchall()
    return rows_to_dicts(rows)


@router.post("/categories")
def create_category(payload: MasterPayload, conn: Db, user: AdminUser):
    name = clean_name(payload.name)
    cur = conn.execute("INSERT INTO asset_categories(name) VALUES (?)", (name,))
    audit(conn, user["id"], "create", "category", cur.lastrowid, name)
    conn.commit()
    return {"id": cur.lastrowid, "name": name, "active": 1}


@router.put("/categories/{category_id}")
def update_category(category_id: int, payload: MasterPayload, conn: Db, user: AdminUser):
    name = clean_name(payload.name)
    cur = conn.execute("UPDATE asset_categories SET name = ? WHERE id = ?", (name, category_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    audit(conn, user["id"], "update", "category", category_id, name)
    conn.commit()
    return {"ok": True}


@router.patch("/categories/{category_id}/toggle")
def toggle_category(category_id: int, conn: Db, user: AdminUser):
    return toggle_master(conn, user, "asset_categories", "category", category_id)


@router.get("/statuses")
def list_statuses(conn: Db, user: User):
    rows = conn.execute(
        """
        SELECT asset_statuses.*,
               COUNT(assets.id) AS asset_count
        FROM asset_statuses
        LEFT JOIN assets ON assets.status_id = asset_statuses.id
        GROUP BY asset_statuses.id
        ORDER BY asset_statuses.active DESC, asset_statuses.sort_order, asset_statuses.name
        """
    ).fetchall()
    return rows_to_dicts(rows)


@router.post("/statuses")
def create_status(payload: StatusPayload, conn: Db, user: AdminUser):
    if payload.kind not in STATUS_KINDS:
        raise HTTPException(status_code=400, detail="Invalid status kind")
    name = clean_name(payload.name)
    cur = conn.execute(
        """
        INSERT INTO asset_statuses(name, kind, sort_order)
        VALUES (?, ?, ?)
        """,
        (name, payload.kind, payload.sort_order),
    )
    audit(conn, user["id"], "create", "status", cur.lastrowid, name)
    conn.commit()
    return {"id": cur.lastrowid, "name": name, "kind": payload.kind, "active": 1}


@router.put("/statuses/{status_id}")
def update_status(status_id: int, payload: StatusPayload, conn: Db, user: AdminUser):
    if payload.kind not in STATUS_KINDS:
        raise HTTPException(status_code=400, detail="Invalid status kind")
    name = clean_name(payload.name)
    cur = conn.execute(
        """
        UPDATE asset_statuses
        SET name = ?, kind = ?, sort_order = ?
        WHERE id = ?
        """,
        (name, payload.kind, payload.sort_order, status_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Status not found")
    conn.execute(
        """
        UPDATE assets
        SET status = ?
        WHERE status_id = ?
        """,
        (payload.kind, status_id),
    )
    audit(conn, user["id"], "update", "status", status_id, name)
    conn.commit()
    return {"ok": True}


@router.patch("/statuses/{status_id}/toggle")
def toggle_status(status_id: int, conn: Db, user: AdminUser):
    return toggle_master(conn, user, "asset_statuses", "status", status_id)


@router.get("/locations")
def list_locations(conn: Db, user: User):
    rows = conn.execute(
        """
        SELECT locations.*,
               COUNT(assets.id) AS asset_count
        FROM locations
        LEFT JOIN assets ON assets.location_id = locations.id
        GROUP BY locations.id
        ORDER BY locations.active DESC, locations.sort_order, locations.name
        """
    ).fetchall()
    return rows_to_dicts(rows)


@router.post("/locations")
def create_location(payload: MasterPayload, conn: Db, user: AdminUser):
    name = clean_name(payload.name)
    cur = conn.execute("INSERT INTO locations(name) VALUES (?)", (name,))
    audit(conn, user["id"], "create", "location", cur.lastrowid, name)
    conn.commit()
    return {"id": cur.lastrowid, "name": name, "active": 1}


@router.put("/locations/{location_id}")
def update_location(location_id: int, payload: MasterPayload, conn: Db, user: AdminUser):
    name = clean_name(payload.name)
    cur = conn.execute("UPDATE locations SET name = ? WHERE id = ?", (name, location_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    conn.execute("UPDATE assets SET location = ? WHERE location_id = ?", (name, location_id))
    audit(conn, user["id"], "update", "location", location_id, name)
    conn.commit()
    return {"ok": True}


@router.patch("/locations/{location_id}/toggle")
def toggle_location(location_id: int, conn: Db, user: AdminUser):
    return toggle_master(conn, user, "locations", "location", location_id)


def toggle_master(conn, user, table: str, entity_type: str, entity_id: int):
    row = conn.execute(f"SELECT active FROM {table} WHERE id = ?", (entity_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"{entity_type.title()} not found")
    new_active = 0 if row["active"] else 1
    conn.execute(f"UPDATE {table} SET active = ? WHERE id = ?", (new_active, entity_id))
    audit(conn, user["id"], "activate" if new_active else "deactivate", entity_type, entity_id)
    conn.commit()
    return {"id": entity_id, "active": new_active}
