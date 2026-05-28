from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import connect, row_to_dict
from .security import token_hash


SESSION_HOURS = 12
bearer = HTTPBearer(auto_error=False)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


Db = Annotated[sqlite3.Connection, Depends(get_db)]


def current_user(
    conn: Db,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now().isoformat(),))
    row = conn.execute(
        """
        SELECT users.*
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
          AND sessions.expires_at > ?
          AND users.active = 1
        """,
        (token_hash(credentials.credentials), utc_now().isoformat()),
    ).fetchone()
    conn.commit()
    user = row_to_dict(row)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


User = Annotated[dict, Depends(current_user)]


def admin_user(user: User) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


AdminUser = Annotated[dict, Depends(admin_user)]


def session_expiry() -> str:
    return (utc_now() + timedelta(hours=SESSION_HOURS)).isoformat()
