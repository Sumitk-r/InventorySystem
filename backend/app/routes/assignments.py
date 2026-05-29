from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import CONDITIONS, audit, get_status_by_kind, rows_to_dicts
from ..deps import AdminUser, Db, User
from ..emailer import send_assignment_email, send_return_email
from ..schemas import AssignmentPayload, ReturnPayload


router = APIRouter(prefix="/assignments", tags=["assignments"])


ASSIGNMENT_SELECT = """
SELECT aa.*,
       assets.asset_tag,
       assets.name AS asset_name,
       people.full_name AS person_name,
       people.person_type,
       departments.name AS department_name
FROM asset_assignments aa
JOIN assets ON assets.id = aa.asset_id
JOIN people ON people.id = aa.person_id
LEFT JOIN departments ON departments.id = people.department_id
"""


@router.get("")
def list_assignments(conn: Db, user: User):
    active = conn.execute(
        f"""
        {ASSIGNMENT_SELECT}
        WHERE aa.status = 'active'
        ORDER BY COALESCE(aa.expected_return_on, '9999-12-31'), aa.assigned_on DESC
        """
    ).fetchall()
    history = conn.execute(
        f"""
        {ASSIGNMENT_SELECT}
        WHERE aa.status != 'active'
        ORDER BY aa.returned_on DESC, aa.created_at DESC
        LIMIT 100
        """
    ).fetchall()
    return {"active": rows_to_dicts(active), "history": rows_to_dicts(history)}


@router.post("")
def create_assignment(payload: AssignmentPayload, conn: Db, user: AdminUser):
    asset = conn.execute(
        """
        SELECT assets.*, asset_statuses.kind AS status_kind
        FROM assets
        LEFT JOIN asset_statuses ON asset_statuses.id = assets.status_id
        WHERE assets.id = ?
        """,
        (payload.asset_id,),
    ).fetchone()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset["status_kind"] != "available":
        raise HTTPException(status_code=400, detail="Only available assets can be assigned")
    person = conn.execute("SELECT * FROM people WHERE id = ? AND active = 1", (payload.person_id,)).fetchone()
    if not person:
        raise HTTPException(status_code=400, detail="Selected person is not active")
    assigned_status = get_status_by_kind(conn, "assigned")
    cur = conn.execute(
        """
        INSERT INTO asset_assignments(asset_id, person_id, assigned_by_user_id,
                                      assigned_on, expected_return_on, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload.asset_id,
            payload.person_id,
            user["id"],
            payload.assigned_on,
            payload.expected_return_on or None,
            payload.notes or None,
        ),
    )
    conn.execute(
        """
        UPDATE assets
        SET status_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (assigned_status["id"], payload.asset_id),
    )
    audit(conn, user["id"], "assign", "assignment", cur.lastrowid, f"{asset['asset_tag']} to {person['full_name']}")
    conn.commit()
    send_assignment_email(person, asset, payload.assigned_on, payload.expected_return_on)
    return {"id": cur.lastrowid}


@router.post("/{assignment_id}/return")
def return_assignment(assignment_id: int, payload: ReturnPayload, conn: Db, user: AdminUser):
    if payload.return_condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Condition must be one of: {', '.join(CONDITIONS)}")
    assignment = conn.execute(
        """
        SELECT aa.*, assets.asset_tag, assets.name,
               people.full_name, people.email
        FROM asset_assignments aa
        JOIN assets ON assets.id = aa.asset_id
        JOIN people ON people.id = aa.person_id
        WHERE aa.id = ? AND aa.status = 'active'
        """,
        (assignment_id,),
    ).fetchone()
    if not assignment:
        raise HTTPException(status_code=404, detail="Active assignment not found")
    if payload.return_condition == "Lost":
        assignment_status = "lost"
        target_status = get_status_by_kind(conn, "retired")
    elif payload.return_condition == "Damaged":
        assignment_status = "returned"
        target_status = get_status_by_kind(conn, "maintenance")
    else:
        assignment_status = "returned"
        target_status = get_status_by_kind(conn, "available")
    conn.execute(
        """
        UPDATE asset_assignments
        SET returned_on = ?, return_condition = ?, status = ?, notes = ?
        WHERE id = ?
        """,
        (payload.returned_on, payload.return_condition, assignment_status, payload.notes or None, assignment_id),
    )
    conn.execute(
        """
        UPDATE assets
        SET status_id = ?, status = ?, condition = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (target_status["id"], target_status["kind"], payload.return_condition, assignment["asset_id"]),
    )
    audit(conn, user["id"], "return", "assignment", assignment_id, assignment["asset_tag"])
    conn.commit()
    send_return_email(assignment, assignment, payload.returned_on, payload.return_condition)
    return {"ok": True}
