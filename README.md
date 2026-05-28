# Inventory System

A small self-hosted inventory management system with:

- React frontend in `frontend/`
- FastAPI backend in `backend/`
- SQLite database in `inventory.db`
- Admin-created users only
- Master tables for categories, statuses, and locations
- Bulk asset upload by CSV

## Run The App

Terminal 1:

```bash
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
cd frontend
env PATH=/Users/bwnayak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/bwnayak/.nvm/versions/node/v18.18.2/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /Users/bwnayak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

Default admin:

```text
Username: admin
Password: admin1234
```

## Project Structure

```text
backend/
  app/
    db.py              SQLite schema, migrations, seed data
    deps.py            FastAPI auth and DB dependencies
    security.py        Password hashing and session token helpers
    schemas.py         Pydantic request models
    main.py            FastAPI application
    routes/
      auth.py
      organization.py
      masters.py
      assets.py
      assignments.py
      reports.py

frontend/
  src/
    main.jsx           React application
    api.js             API client
    styles.css         UI styling
```

## Master Tables

The left navigation has a `Master Tables` section:

- `Categories`
- `Statuses`
- `Locations`

Statuses have a display name and a workflow type:

- `available`
- `assigned`
- `maintenance`
- `retired`

This lets you rename or add status labels while the assignment and return workflow still knows how each status should behave.

## Bulk Asset Upload

Go to `Assets`, then use `Download Upload Template`.

CSV columns:

```text
asset_tag,name,category,status,location,serial_number,purchase_date,warranty_end,condition,notes
```

Rules:

- `asset_tag` and `name` are required.
- Existing assets are updated by `asset_tag`.
- New categories and locations are created automatically.
- Status must already exist in `Master Tables > Statuses`.
- Blank status defaults to the active `available` status.

## Database

The database remains SQLite:

```text
inventory.db
```

The FastAPI backend migrates the existing database in place on startup. It preserves old data and adds:

- `asset_statuses`
- `locations`
- `assets.status_id`
- `assets.location_id`

Back up `inventory.db` regularly.
