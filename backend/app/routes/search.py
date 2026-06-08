from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import resolve_user_person_id, rows_to_dicts
from ..deps import Db, User


router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def global_search(
    conn: Db,
    user: User,
    q: str = Query(min_length=2, max_length=120),
    limit: int = Query(default=25, ge=1, le=50),
):
    if not getattr(conn, "is_postgres", False):
        raise HTTPException(status_code=400, detail="Global search requires PostgreSQL")

    person_filter = ""
    params: tuple = (q, limit)
    if user["role"] != "admin":
        person_id = resolve_user_person_id(conn, user)
        if not person_id:
            return []
        person_filter = "AND asset_assignments.person_id = ?"
        params = (person_id, q, limit)

    rows = conn.execute(
        f"""
        WITH search_rows AS (
            SELECT assets.id,
                   assets.asset_tag,
                   assets.name,
                   assets.serial_number,
                   assets.condition,
                   assets.notes,
                   asset_categories.name AS category_name,
                   asset_statuses.name AS status_name,
                   asset_statuses.kind AS status_kind,
                   locations.name AS location_name,
                   people.full_name AS assigned_to,
                   departments.name AS department_name,
                   to_tsvector(
                       'english',
                       concat_ws(
                           ' ',
                           assets.asset_tag,
                           assets.name,
                           assets.serial_number,
                           assets.condition,
                           assets.notes,
                           asset_categories.name,
                           asset_statuses.name,
                           asset_statuses.kind,
                           locations.name,
                           people.full_name,
                           departments.name
                       )
                   ) AS document
            FROM assets
            LEFT JOIN asset_categories ON asset_categories.id = assets.category_id
            LEFT JOIN asset_statuses ON asset_statuses.id = assets.status_id
            LEFT JOIN locations ON locations.id = assets.location_id
            LEFT JOIN asset_assignments ON asset_assignments.asset_id = assets.id
                 AND asset_assignments.status = 'active'
            LEFT JOIN people ON people.id = asset_assignments.person_id
            LEFT JOIN departments ON departments.id = people.department_id
            WHERE 1 = 1
              {person_filter}
        ),
        ranked AS (
            SELECT *,
                   websearch_to_tsquery('english', ?) AS query
            FROM search_rows
        )
        SELECT id,
               asset_tag,
               name,
               serial_number,
               condition,
               notes,
               category_name,
               status_name,
               status_kind,
               location_name,
               assigned_to,
               department_name,
               ts_rank_cd(document, query) AS rank
        FROM ranked
        WHERE document @@ query
        ORDER BY rank DESC, asset_tag
        LIMIT ?
        """,
        params,
    ).fetchall()
    return rows_to_dicts(rows)
