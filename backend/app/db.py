from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

from .security import hash_password


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("INVENTORY_DB", PROJECT_ROOT / "inventory.db"))

CATEGORY_SEED = ("Laptop", "Desktop", "Monitor", "Mobile", "Accessory", "Software License", "Other")
STATUS_SEED = (
    ("Available", "available", 10),
    ("Assigned", "assigned", 20),
    ("Maintenance", "maintenance", 30),
    ("Retired", "retired", 40),
)
STATUS_KINDS = {"available", "assigned", "maintenance", "retired"}
CONDITIONS = ("New", "Good", "Fair", "Damaged", "Lost")


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    contact_email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    person_type TEXT NOT NULL CHECK (person_type IN ('employee', 'consultant')),
    email TEXT,
    phone TEXT,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    external_company TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL DEFAULT '',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS asset_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('available', 'assigned', 'maintenance', 'retired')),
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES asset_categories(id) ON DELETE SET NULL,
    status_id INTEGER REFERENCES asset_statuses(id) ON DELETE SET NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    serial_number TEXT,
    purchase_date TEXT,
    warranty_end TEXT,
    condition TEXT NOT NULL DEFAULT 'Good',
    status TEXT NOT NULL CHECK (status IN ('available', 'assigned', 'maintenance', 'retired')) DEFAULT 'available',
    location TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
    assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_on TEXT NOT NULL,
    expected_return_on TEXT,
    returned_on TEXT,
    return_condition TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'returned', 'lost')) DEFAULT 'active',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_asset
ON asset_assignments(asset_id)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row["name"] == column for row in conn.execute(f"PRAGMA table_info({table})"))


def add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    if not has_column(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def seed_master_data(conn: sqlite3.Connection) -> None:
    for category in CATEGORY_SEED:
        conn.execute("INSERT OR IGNORE INTO asset_categories(name) VALUES (?)", (category,))
    for name, kind, sort_order in STATUS_SEED:
        conn.execute(
            """
            INSERT OR IGNORE INTO asset_statuses(name, kind, sort_order)
            VALUES (?, ?, ?)
            """,
            (name, kind, sort_order),
        )
    user_count = conn.execute("SELECT COUNT(*) AS total FROM users").fetchone()["total"]
    if user_count == 0:
        conn.execute(
            """
            INSERT INTO users(username, password_hash, full_name, role)
            VALUES (?, ?, ?, 'admin')
            """,
            ("admin", hash_password("admin1234"), "System Administrator"),
        )


def migrate_existing_assets(conn: sqlite3.Connection) -> None:
    add_column_if_missing(conn, "assets", "status_id", "INTEGER REFERENCES asset_statuses(id) ON DELETE SET NULL")
    add_column_if_missing(conn, "assets", "location_id", "INTEGER REFERENCES locations(id) ON DELETE SET NULL")

    legacy_locations = conn.execute(
        """
        SELECT DISTINCT TRIM(location) AS name
        FROM assets
        WHERE location IS NOT NULL
          AND TRIM(location) != ''
        """
    ).fetchall()
    for row in legacy_locations:
        conn.execute("INSERT OR IGNORE INTO locations(name) VALUES (?)", (row["name"],))

    conn.execute(
        """
        UPDATE assets
        SET status_id = (
            SELECT id
            FROM asset_statuses
            WHERE asset_statuses.kind = assets.status
            ORDER BY sort_order, id
            LIMIT 1
        )
        WHERE status_id IS NULL
        """
    )
    conn.execute(
        """
        UPDATE assets
        SET location_id = (
            SELECT id
            FROM locations
            WHERE LOWER(locations.name) = LOWER(TRIM(assets.location))
            LIMIT 1
        )
        WHERE location_id IS NULL
          AND location IS NOT NULL
          AND TRIM(location) != ''
        """
    )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        seed_master_data(conn)
        migrate_existing_assets(conn)
        conn.commit()


def audit(conn: sqlite3.Connection, user_id: int | None, action: str, entity_type: str, entity_id: int | None, details: str = "") -> None:
    conn.execute(
        """
        INSERT INTO audit_log(actor_user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, action, entity_type, entity_id, details),
    )


def get_status_by_kind(conn: sqlite3.Connection, kind: str) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT *
        FROM asset_statuses
        WHERE kind = ?
          AND active = 1
        ORDER BY sort_order, id
        LIMIT 1
        """,
        (kind,),
    ).fetchone()
    if not row:
        raise ValueError(f"No active asset status is configured for {kind}.")
    return row


def get_or_create_category(conn: sqlite3.Connection, name: str | None) -> int | None:
    clean = (name or "").strip()
    if not clean:
        return None
    row = conn.execute("SELECT id FROM asset_categories WHERE LOWER(name) = LOWER(?)", (clean,)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO asset_categories(name) VALUES (?)", (clean,)).lastrowid


def get_or_create_location(conn: sqlite3.Connection, name: str | None) -> int | None:
    clean = (name or "").strip()
    if not clean:
        return None
    row = conn.execute("SELECT id FROM locations WHERE LOWER(name) = LOWER(?)", (clean,)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO locations(name) VALUES (?)", (clean,)).lastrowid


def find_status(conn: sqlite3.Connection, name: str | None) -> sqlite3.Row:
    clean = (name or "").strip()
    if not clean:
        return get_status_by_kind(conn, "available")
    row = conn.execute(
        "SELECT * FROM asset_statuses WHERE LOWER(name) = LOWER(?)",
        (clean,),
    ).fetchone()
    if not row:
        raise ValueError(f"Status '{clean}' does not exist. Add it in Master Tables first.")
    return row
