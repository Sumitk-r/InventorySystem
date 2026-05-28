from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import audit, row_to_dict
from ..deps import Db, User, session_expiry
from ..schemas import LoginRequest
from ..security import new_token, token_hash, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])


def public_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
        "department_id": row["department_id"],
    }


@router.post("/login")
def login(payload: LoginRequest, conn: Db):
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND active = 1",
        (payload.username,),
    ).fetchone()
    user = row_to_dict(row)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = new_token()
    conn.execute(
        """
        INSERT INTO sessions(token_hash, csrf_token, user_id, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        (token_hash(token), "", user["id"], session_expiry()),
    )
    audit(conn, user["id"], "login", "user", user["id"], "User signed in")
    conn.commit()
    return {"token": token, "user": public_user(user)}


@router.get("/me")
def me(user: User):
    return public_user(user)
