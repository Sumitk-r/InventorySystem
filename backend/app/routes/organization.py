from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import audit, rows_to_dicts
from ..deps import AdminUser, Db, User
from ..schemas import DepartmentPayload, PersonPayload, UserPayload
from ..security import hash_password


router = APIRouter(tags=["organization"])


@router.get("/departments")
def list_departments(conn: Db, user: User):
    rows = conn.execute("SELECT * FROM departments ORDER BY active DESC, name").fetchall()
    return rows_to_dicts(rows)


@router.post("/departments")
def create_department(payload: DepartmentPayload, conn: Db, user: AdminUser):
    cur = conn.execute(
        """
        INSERT INTO departments(name, code, contact_email)
        VALUES (?, ?, ?)
        """,
        (payload.name.strip(), payload.code or None, payload.contact_email or None),
    )
    audit(conn, user["id"], "create", "department", cur.lastrowid, payload.name)
    conn.commit()
    return {"id": cur.lastrowid}


@router.put("/departments/{department_id}")
def update_department(department_id: int, payload: DepartmentPayload, conn: Db, user: AdminUser):
    cur = conn.execute(
        """
        UPDATE departments
        SET name = ?, code = ?, contact_email = ?
        WHERE id = ?
        """,
        (payload.name.strip(), payload.code or None, payload.contact_email or None, department_id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    audit(conn, user["id"], "update", "department", department_id, payload.name)
    conn.commit()
    return {"ok": True}


@router.patch("/departments/{department_id}/toggle")
def toggle_department(department_id: int, conn: Db, user: AdminUser):
    return toggle_active(conn, user, "departments", "department", department_id)


@router.get("/people")
def list_people(conn: Db, user: User):
    rows = conn.execute(
        """
        SELECT people.*, departments.name AS department_name
        FROM people
        LEFT JOIN departments ON departments.id = people.department_id
        ORDER BY people.active DESC, people.full_name
        """
    ).fetchall()
    return rows_to_dicts(rows)


@router.post("/people")
def create_person(payload: PersonPayload, conn: Db, user: AdminUser):
    cur = conn.execute(
        """
        INSERT INTO people(full_name, person_type, email, phone, department_id, external_company)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload.full_name.strip(),
            payload.person_type,
            payload.email or None,
            payload.phone or None,
            payload.department_id,
            payload.external_company or None,
        ),
    )
    audit(conn, user["id"], "create", "person", cur.lastrowid, payload.full_name)
    conn.commit()
    return {"id": cur.lastrowid}


@router.put("/people/{person_id}")
def update_person(person_id: int, payload: PersonPayload, conn: Db, user: AdminUser):
    cur = conn.execute(
        """
        UPDATE people
        SET full_name = ?, person_type = ?, email = ?, phone = ?,
            department_id = ?, external_company = ?
        WHERE id = ?
        """,
        (
            payload.full_name.strip(),
            payload.person_type,
            payload.email or None,
            payload.phone or None,
            payload.department_id,
            payload.external_company or None,
            person_id,
        ),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Person not found")
    audit(conn, user["id"], "update", "person", person_id, payload.full_name)
    conn.commit()
    return {"ok": True}


@router.patch("/people/{person_id}/toggle")
def toggle_person(person_id: int, conn: Db, user: AdminUser):
    return toggle_active(conn, user, "people", "person", person_id)


@router.get("/users")
def list_users(conn: Db, user: AdminUser):
    rows = conn.execute(
        """
        SELECT users.id, users.username, users.full_name, users.role, users.department_id,
               users.person_id, users.active, users.created_at,
               departments.name AS department_name,
               people.full_name AS person_name
        FROM users
        LEFT JOIN departments ON departments.id = users.department_id
        LEFT JOIN people ON people.id = users.person_id
        ORDER BY users.active DESC, users.role, users.full_name
        """
    ).fetchall()
    return rows_to_dicts(rows)


@router.post("/users")
def create_user(payload: UserPayload, conn: Db, user: AdminUser):
    if not payload.password:
        raise HTTPException(status_code=400, detail="Password is required for new users")
    validate_person_id(conn, payload.person_id)
    cur = conn.execute(
        """
        INSERT INTO users(username, password_hash, full_name, role, department_id, person_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload.username.strip(),
            hash_password(payload.password),
            payload.full_name.strip(),
            payload.role,
            payload.department_id,
            payload.person_id,
        ),
    )
    audit(conn, user["id"], "create", "user", cur.lastrowid, payload.username)
    conn.commit()
    return {"id": cur.lastrowid}


@router.put("/users/{target_user_id}")
def update_user(target_user_id: int, payload: UserPayload, conn: Db, user: AdminUser):
    validate_person_id(conn, payload.person_id)
    if payload.password:
        params = (
            payload.username.strip(),
            hash_password(payload.password),
            payload.full_name.strip(),
            payload.role,
            payload.department_id,
            payload.person_id,
            target_user_id,
        )
        sql = """
            UPDATE users
            SET username = ?, password_hash = ?, full_name = ?, role = ?,
                department_id = ?, person_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """
    else:
        params = (
            payload.username.strip(),
            payload.full_name.strip(),
            payload.role,
            payload.department_id,
            payload.person_id,
            target_user_id,
        )
        sql = """
            UPDATE users
            SET username = ?, full_name = ?, role = ?,
                department_id = ?, person_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """
    cur = conn.execute(sql, params)
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")
    audit(conn, user["id"], "update", "user", target_user_id, payload.username)
    conn.commit()
    return {"ok": True}


@router.patch("/users/{target_user_id}/toggle")
def toggle_user(target_user_id: int, conn: Db, user: AdminUser):
    if target_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    result = toggle_active(conn, user, "users", "user", target_user_id, commit=False)
    if result["active"] == 0:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (target_user_id,))
    conn.commit()
    return result


def toggle_active(conn, user, table: str, entity_type: str, entity_id: int, commit: bool = True):
    row = conn.execute(f"SELECT active FROM {table} WHERE id = ?", (entity_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"{entity_type.title()} not found")
    new_active = 0 if row["active"] else 1
    conn.execute(f"UPDATE {table} SET active = ? WHERE id = ?", (new_active, entity_id))
    audit(conn, user["id"], "activate" if new_active else "deactivate", entity_type, entity_id)
    if commit:
        conn.commit()
    return {"id": entity_id, "active": new_active}


def validate_person_id(conn: Db, person_id: int | None) -> None:
    if not person_id:
        return
    row = conn.execute("SELECT id FROM people WHERE id = ? AND active = 1", (person_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Linked person must be an active person record")
