from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.db import PG_SCHEMA, split_sql


SQLITE_PATH = Path(os.environ.get("SQLITE_DB", ROOT / "inventory.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

TABLES = [
    "departments",
    "people",
    "users",
    "sessions",
    "asset_categories",
    "asset_statuses",
    "locations",
    "assets",
    "asset_assignments",
    "audit_log",
]


def placeholders(count: int) -> str:
    return ", ".join(["%s"] * count)


def main() -> None:
    if not DATABASE_URL:
        raise SystemExit("Set DATABASE_URL to your Postgres connection string.")
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite database not found: {SQLITE_PATH}")

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    with psycopg.connect(DATABASE_URL) as pg_conn:
        with pg_conn.cursor() as cursor:
            for statement in split_sql(PG_SCHEMA):
                cursor.execute(statement)

            for table in TABLES:
                rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
                if not rows:
                    continue
                columns = rows[0].keys()
                sql = (
                    f"INSERT INTO {table}({', '.join(columns)}) "
                    f"VALUES ({placeholders(len(columns))}) "
                    "ON CONFLICT DO NOTHING"
                )
                cursor.executemany(sql, [tuple(row[column] for column in columns) for row in rows])

            for table in TABLES:
                cursor.execute(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table}', 'id'),
                        COALESCE((SELECT MAX(id) FROM {table}), 1),
                        true
                    )
                    """
                )

        pg_conn.commit()

    sqlite_conn.close()
    print(f"Migrated {SQLITE_PATH} to Postgres.")


if __name__ == "__main__":
    main()
