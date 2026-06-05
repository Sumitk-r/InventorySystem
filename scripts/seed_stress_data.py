from __future__ import annotations

from itertools import cycle
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.db import connect, get_status_by_kind, init_db, insert_ignore


DEPARTMENTS = [
    ("Information Technology", "IT"),
    ("Finance", "FIN"),
    ("Human Resources", "HR"),
    ("Operations", "OPS"),
    ("Sales", "SAL"),
    ("Research", "RND"),
]

CATEGORIES = [
    "Laptop",
    "Desktop",
    "Monitor",
    "Mobile",
    "Tablet",
    "Printer",
    "Router",
    "Switch",
    "Keyboard",
    "Mouse",
    "Pen Drive",
    "Raspberry Pi",
    "Projector",
    "Software License",
    "Furniture",
]

LOCATIONS = [
    "IT Store",
    "Head Office",
    "Finance Bay",
    "HR Cabin",
    "Operations Floor",
    "Sales Floor",
    "Research Lab",
    "Conference Room",
    "Training Room",
    "Warehouse",
]


def row_id(conn, table: str, name: str, code: str | None = None) -> int:
    if code:
        row = conn.execute(f"SELECT id FROM {table} WHERE LOWER(code) = LOWER(?)", (code,)).fetchone()
        if row:
            return row["id"]
    row = conn.execute(f"SELECT id FROM {table} WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if not row:
        raise RuntimeError(f"Missing seed row in {table}: {name}")
    return row["id"]


def main() -> None:
    init_db()
    with connect() as conn:
        for name, code in DEPARTMENTS:
            existing = conn.execute(
                "SELECT id FROM departments WHERE LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?)",
                (code, name),
            ).fetchone()
            if not existing:
                insert_ignore(conn, "departments", "name, code", (name, code))
        for name in CATEGORIES:
            insert_ignore(conn, "asset_categories", "name", (name,))
        for index, name in enumerate(LOCATIONS, start=10):
            insert_ignore(conn, "locations", "name, sort_order", (name, index))

        department_ids = [row_id(conn, "departments", name, code) for name, code in DEPARTMENTS]
        category_ids = [row_id(conn, "asset_categories", name) for name in CATEGORIES]
        location_ids = [row_id(conn, "locations", name) for name in LOCATIONS]
        available_status = get_status_by_kind(conn, "available")

        departments = cycle(department_ids)
        for index in range(1, 51):
            department_id = next(departments)
            full_name = f"Test Employee {index:02d}"
            email = f"employee{index:02d}@example.com"
            existing = conn.execute("SELECT id FROM people WHERE email = ?", (email,)).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO people(full_name, person_type, email, phone, department_id, external_company)
                    VALUES (?, 'employee', ?, ?, ?, NULL)
                    """,
                    (full_name, email, f"90000{index:05d}", department_id),
                )

        categories = cycle(category_ids)
        locations = cycle(location_ids)
        category_names = cycle(CATEGORIES)
        for index in range(1, 3001):
            asset_tag = f"STRESS-{index:04d}"
            existing = conn.execute("SELECT id FROM assets WHERE asset_tag = ?", (asset_tag,)).fetchone()
            purchase_cost = 5000 + ((index % 20) * 2500)
            if existing:
                conn.execute(
                    """
                    UPDATE assets
                    SET purchase_cost = COALESCE(purchase_cost, ?),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (purchase_cost, existing["id"]),
                )
                continue
            category_id = next(categories)
            location_id = next(locations)
            category_name = next(category_names)
            conn.execute(
                """
                INSERT INTO assets(asset_tag, name, category_id, status_id, location_id,
                                   serial_number, purchase_date, warranty_end, purchase_cost,
                                   condition, status, location, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Good', 'available', ?, ?)
                """,
                (
                    asset_tag,
                    f"{category_name} {index:04d}",
                    category_id,
                    available_status["id"],
                    location_id,
                    f"SN-STRESS-{index:04d}",
                    "2026-01-01",
                    "2028-01-01",
                    purchase_cost,
                    LOCATIONS[(index - 1) % len(LOCATIONS)],
                    "Generated stress-test asset",
                ),
            )

        conn.commit()

    print("Stress data ready: 6 departments, 50 people, 15 categories, 3000 assets.")


if __name__ == "__main__":
    main()
