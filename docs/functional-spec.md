# Inventory Management System Functional Specification

## Purpose

This application is a small, self-hosted inventory system for a department or small organization. It tracks assets, the people who receive them, return expectations, overdue items, and downloadable weekly reports.

The design intentionally avoids complex procurement, finance, approval, or multi-location warehouse features.

## Architecture

- Frontend: React single-page app in `frontend/`.
- Backend: FastAPI JSON API in `backend/`.
- Database: SQLite.
- Authentication: bearer session token stored by the frontend.

## Users And Roles

### Admin

- Sign in with username and password.
- Add, edit, activate, and deactivate users.
- Add and maintain departments.
- Add employees and external consultants.
- Add and maintain assets.
- Assign assets to people.
- Record asset returns.
- Download CSV exports for Excel.
- View weekly reports.

### Staff

- Sign in with username and password.
- View dashboards, assets, people, assignments, and reports.
- Download CSV exports.
- Cannot create or edit records.

## Functional Requirements

### Authentication

- The app has no public signup page.
- Admins create user accounts from the admin panel.
- Passwords are stored as PBKDF2 hashes.
- Login sessions expire after 12 hours.

### Departments

- Admins can create a department with name, optional short code, and optional contact email.
- Departments can be activated or deactivated.
- Departments are linked to employees, consultants, and optional user accounts.

### People

- Admins can create people as either employees or consultants.
- Each person can have name, email, phone, department, and external company.
- Consultants can be linked to an external company.
- People can be deactivated when they leave.

### Assets

- Admins can create, edit, activate, and deactivate master categories.
- Admins can create, edit, activate, and deactivate master statuses.
- Admins can create, edit, activate, and deactivate master locations.
- Admins can create assets with asset tag, name, category, serial number, purchase date, warranty end date, condition, status, location, and notes.
- Asset status labels are configurable, but each status has a workflow type: available, assigned, maintenance, or retired.
- Asset condition is one of: New, Good, Fair, Damaged, Lost.
- Asset tags must be unique.

### Bulk Upload

- Admins can download an asset upload CSV template from the Assets page.
- Admins can upload a CSV file to create or update assets in bulk.
- Bulk upload updates existing assets by asset tag.
- Missing categories and locations are created automatically.
- Status values must already exist in the status master table.

### Assignments And Returns

- Admins can assign only available assets.
- Assets can be assigned to active employees or consultants.
- Each assignment records assigned date, optional expected return date, assigned-by user, and notes.
- Each asset can have only one active assignment at a time.
- On assignment, asset status changes to assigned.
- On return:
  - Good, New, or Fair assets become available.
  - Damaged assets move to maintenance.
  - Lost assets move to retired and the assignment is marked lost.

### Reports

- Dashboard shows total active assets, available assets, checked-out assets, overdue assets, and assets due in the next 7 days.
- Weekly report page shows:
  - Overdue assets as of today.
  - Assets due during the selected report range.
  - Assets assigned during the selected report range.
  - Assets returned during the selected report range.
- Reports can be downloaded as CSV files that open in Excel.

### Exports

- Assets CSV.
- People CSV.
- Assignments CSV.
- Weekly report CSV.

## Data Tables

### departments

Stores internal departments.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| name | TEXT | Required, unique |
| code | TEXT | Optional, unique |
| contact_email | TEXT | Optional |
| active | INTEGER | 1 active, 0 inactive |
| created_at | TEXT | Timestamp |

### people

Stores employees and external consultants.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| full_name | TEXT | Required |
| person_type | TEXT | employee or consultant |
| email | TEXT | Optional |
| phone | TEXT | Optional |
| department_id | INTEGER FK | Optional link to departments |
| external_company | TEXT | Optional, useful for consultants |
| active | INTEGER | 1 active, 0 inactive |
| created_at | TEXT | Timestamp |

### users

Stores login accounts. This is separate from people because not every employee or consultant needs an app login.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| username | TEXT | Required, unique |
| password_hash | TEXT | PBKDF2 password hash |
| full_name | TEXT | Required |
| role | TEXT | admin or staff |
| department_id | INTEGER FK | Optional link to departments |
| active | INTEGER | 1 active, 0 inactive |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

### sessions

Stores active login sessions.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| token_hash | TEXT | SHA-256 hash of browser session token |
| csrf_token | TEXT | Form protection token |
| user_id | INTEGER FK | Linked login user |
| expires_at | TEXT | Session expiry timestamp |
| created_at | TEXT | Timestamp |

### asset_categories

Stores simple asset categories.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| name | TEXT | Required, unique |
| active | INTEGER | 1 active, 0 inactive |

Admins can add new categories from the Categories page. Inactive categories remain linked to old assets, but are hidden from new asset selection.

### asset_statuses

Stores configurable asset status labels.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| name | TEXT | Required, unique display name |
| kind | TEXT | available, assigned, maintenance, retired |
| active | INTEGER | 1 active, 0 inactive |
| sort_order | INTEGER | UI ordering |

The `kind` field controls workflow behavior. For example, assets with an available-kind status can be assigned, and returned damaged assets move to a maintenance-kind status.

### locations

Stores configurable asset locations.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| name | TEXT | Required, unique |
| active | INTEGER | 1 active, 0 inactive |
| sort_order | INTEGER | UI ordering |

### assets

Stores the asset register.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| asset_tag | TEXT | Required, unique |
| name | TEXT | Required |
| category_id | INTEGER FK | Optional link to asset_categories |
| status_id | INTEGER FK | Optional link to asset_statuses |
| location_id | INTEGER FK | Optional link to locations |
| serial_number | TEXT | Optional |
| purchase_date | TEXT | Optional ISO date |
| warranty_end | TEXT | Optional ISO date |
| condition | TEXT | New, Good, Fair, Damaged, Lost |
| status | TEXT | Legacy workflow status, retained for compatibility |
| location | TEXT | Legacy location text, retained for compatibility |
| notes | TEXT | Optional |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

### asset_assignments

Stores asset checkout and return history.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| asset_id | INTEGER FK | Required link to assets |
| person_id | INTEGER FK | Required link to people |
| assigned_by_user_id | INTEGER FK | Admin/staff user who assigned it |
| assigned_on | TEXT | Required ISO date |
| expected_return_on | TEXT | Optional ISO date |
| returned_on | TEXT | Optional ISO date |
| return_condition | TEXT | Optional return condition |
| status | TEXT | active, returned, lost |
| notes | TEXT | Optional |
| created_at | TEXT | Timestamp |

Important constraint: one asset can have only one active assignment at a time.

### audit_log

Stores simple administrative activity.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment primary key |
| actor_user_id | INTEGER FK | User who performed the action |
| action | TEXT | login, create, update, assign, return, etc. |
| entity_type | TEXT | department, person, asset, assignment, user |
| entity_id | INTEGER | Related record id |
| details | TEXT | Short human-readable detail |
| created_at | TEXT | Timestamp |

## Suggested Weekly Operating Process

1. Admin adds departments, people, and assets.
2. Admin assigns assets when equipment is handed out.
3. Admin records return when equipment comes back.
4. Once a week, open Reports and download the weekly CSV.
5. Share or archive the CSV as the department inventory report.
