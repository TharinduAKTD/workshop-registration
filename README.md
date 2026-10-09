# Workshop Desk — Full Stack Challenge

Connected React + TypeScript frontend, Express + TypeScript API and PostgreSQL database.

## Requirements

- Node.js 22 LTS (or Node.js 20.19+) and npm.
- PostgreSQL 14+ installed and running locally. Know the `postgres` user's password and port.
- VS Code. DBeaver/pgAdmin are optional; no manual SQL copy/paste is required.

## 1. Install and configure backend (Windows PowerShell)

Extract this folder and open **workshop-registration** in VS Code. In its terminal:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Open `backend/.env`. Replace `PGPASSWORD` with your real local PostgreSQL password. Check `PGUSER`, `PGPORT`, and `PGHOST`. For the supplied dev login, keep `ADMIN_EMAIL` and `ADMIN_PASSWORD` unchanged. The supplied JWT secret is for local development only.

The `.env` file configures this application. It does not configure a DBeaver connection.

## 2. Create database, tables and sample data from VS Code

In the same backend terminal:

```powershell
npm run db:setup
```

This Node script connects to PostgreSQL's maintenance database, creates `workshop_registration` if missing, executes `schema.sql`, and seeds one Admin plus three sample workshops. Existing records are preserved. It creates tables in PostgreSQL directly; there is no separate migration to DBeaver. Refresh DBeaver's database list if you want to inspect the result.

The configured database user must have permission to create a database on the first run. Using your local `postgres` account normally provides it. Re-running setup does not reset the existing Admin password or replace existing workshops.

## 3. Start the backend

```powershell
npm run dev
```

Expected: `API running at http://localhost:3000`.

Open <http://localhost:3000/api/health>. Expect `{"status":"ok"}`.

Keep this terminal running. The entrypoint is `src/server.ts`, so use the npm command rather than `tsx watch server.ts`.

## 4. Start the frontend in a second terminal

From the project root:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend on port 3000. No frontend `.env` is needed for local development.

## 5. First login and account creation

Development-only seeded Admin:

| Field | Value |
| --- | --- |
| Email | `admin@workshop.local` |
| Password | `Admin123!` |

1. Log in as Admin.
2. Create a Manager, e.g. `manager@example.com` / `Manager123!`, with role `MANAGER`.
3. Create a Staff account, e.g. `staff@example.com` / `Staff123!`, with role `STAFF`.
4. Sign out, then sign in as Manager to see the sample workshops and add/edit workshops.
5. Sign in as Staff to view workshops and register/cancel attendees.

Manager and Staff credentials above are suggestions you create in the UI, **not automatically seeded accounts**. Admin does not have workshop access; that follows the challenge's permission matrix.

## 6. Verify the main workflow

1. Manager creates an OPEN workshop with capacity `2`.
2. Staff selects **Attendees** and registers two different emails.
3. The list shows `0 left`; any additional API registration is refused with `409`.
4. Cancel one attendee. The attendee row remains CANCELLED with actor/time and the list shows `1 left`.
5. Select **History** to view REGISTERED and CANCELLED events.
6. Register another attendee (or re-register the cancelled email). The original cancelled record stays visible.
7. Manager tries changing capacity from `2` to `1` when two active attendees exist. Expect an error.
8. Test date range, status and **Seats available** filters. Press **Find workshops** to apply them. Clear fields and uncheck the checkbox to view everything.
9. Sign in as Admin and confirm the account screen; it does not expose workshops. Backend denial is also covered by tests.

For a visual two-client check, use two different browser profiles and sign in as Staff in each. Both can attempt to register for the final seat; exactly one succeeds and the other receives the full-workshop message. Use **Refresh** to update the other browser's seat display. The API/database are authoritative, even if a screen is stale.

## 7. Build and automated checks

From project root:

```powershell
npm run build
```

In a separate terminal, from `backend`:

```powershell
npm test
```

Tests start their own API listener on a free port. First run `db:setup`. Tests use the Admin credentials from `.env`, create unique test users/workshops/registrations, and keep their fixtures for inspection; use a **local development database**. They check twelve competing registration requests for three seats, cancellation/history, permissions, duplicates, date/status/available filtering, a capacity-edit race, and immediate role changes.

Compiled backend can also run with `npm start` from `backend` after building. The documented connected frontend setup uses Vite's development proxy. Static production hosting needs a separately configured API proxy/origin; deployment is optional and not included.

## Source map

```text
workshop-registration/
  backend/
    schema.sql               Tables and indexes
    scripts/setup-db.ts      Create database and seed Admin/sample workshops
    src/config.ts            Environment configuration
    src/db.ts                Connection pool and transaction helper
    src/auth.ts              JWT authentication and role authorization
    src/http.ts              Validation and HTTP errors
    src/app.ts               API routes and transaction business rules
    src/server.ts            Listen on port 3000
    tests/integration.test.ts Core behavior and concurrency checks
  frontend/
    src/App.tsx              Login, team admin, workshops, registrations/history
    src/api.ts               Typed API client
    src/styles.css           Responsive UI
    vite.config.ts           Development API proxy
  DESIGN.md / DESIGN.pdf     Short written design document (PDF is one A4 page)
  WALKTHROUGH.md             Step-by-step explanation of the implementation
```

## API and access

All routes except login and health require `Authorization: Bearer <token>`.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | Public login only |
| GET | `/api/health` | Public health check |
| GET | `/api/auth/me` | Any authenticated role |
| GET / POST | `/api/users` | Admin |
| PATCH | `/api/users/:id/role` | Admin |
| GET | `/api/workshops` | Manager, Staff |
| POST | `/api/workshops` | Manager |
| PUT | `/api/workshops/:id` | Manager |
| GET / POST | `/api/workshops/:id/registrations` | Manager, Staff |
| POST | `/api/registrations/:id/cancel` | Manager, Staff |
| GET | `/api/registrations/:id/history` | Manager, Staff |

List query parameters: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `status=OPEN`, `availableOnly=true`.

## Common setup problems

| Error | Fix |
| --- | --- |
| PowerShell refuses `npm.ps1` | Use `npm.cmd` instead of `npm` in the same commands |
| `password authentication failed` | Fix `PGUSER` / `PGPASSWORD` in `backend/.env` |
| `ECONNREFUSED` on 5432 | Start PostgreSQL and check its configured port |
| `permission denied to create database` | Use a local account with CREATEDB permission, or create the named database once with an authorized local DB account |
| `JWT_SECRET` error | Copy `.env.example` to `.env`; keep a secret of at least 32 characters |
| `EADDRINUSE` on 3000 | Stop the older assessment backend using port 3000; if you change API port, update Vite's proxy too |
| Vite says 5173 is already used | Stop the earlier frontend. The configured strict port prevents silently moving to another origin |
| Frontend fetch/proxy error | Confirm backend is running and `/api/health` works |
| Seed login rejected after env password change | Seeding preserves the old Admin; use the original credentials. It does not reset passwords |
| Tables absent in DBeaver | Connect DBeaver to `workshop_registration`, then refresh; `.env` belongs to the Node app |

## Submit

Submit both `backend` and `frontend`, their lockfiles, `.env.example`, this README, and the one-page `DESIGN.pdf` (the editable text is in `DESIGN.md`). Exclude `.env`, `node_modules`, logs and `dist`. GitHub repo or a source zip is sufficient. Public deployment, waitlist and audit of non-registration changes are optional and are not implemented.
