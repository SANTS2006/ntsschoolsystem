# School Management Platform

Multi-tenant School Management SaaS. React + TypeScript frontend, Django + DRF backend,
PostgreSQL (Neon). No Docker.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design decisions and
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for what's built vs. pending.

## Prerequisites

- Python 3.13+
- Node.js 22+ / npm
- A Neon PostgreSQL project (or any Postgres instance) — get a connection string from
  the Neon dashboard's *Connection Details*

## Backend setup

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements/dev.txt
cp .env.example .env          # then fill in DATABASE_URL, DJANGO_SECRET_KEY, etc.
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend runs at `http://localhost:8000`. `manage.py` defaults to `config.settings.dev`.

Optionally seed development-only demo data (a demo school, its default roles, and one user per
key role — see the command output for emails/password):

```bash
python manage.py seed_dev_data      # idempotent; also seeds the Permission catalog
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api/*` to `http://localhost:8000`
in development (see `vite.config.ts`) — no `VITE_API_URL` needed locally.

## Running both

Start the backend and frontend in separate terminals (commands above). Visit
`http://localhost:5173` — it redirects to `/login`. Log in with a seeded account (see
`python manage.py seed_dev_data` above, or any account created via the API/admin) to reach the
dashboard. `/students` (nav-gated by `students.view`) is the first full domain module — list,
create, edit, and archive — everything else is still API-only from the frontend's perspective; see
`docs/IMPLEMENTATION_STATUS.md` for what's built.

## API surface so far

All under `/api/v1/`:

- `auth/` — login, logout, refresh, me, change-password, password-reset(+confirm),
  email-verification(+confirm), accept-invitation
- `schools/` — platform-admin school CRUD + `activate`/`suspend` actions; `schools/me/` for a
  school's own profile (view: any member; update: `settings.update` permission)
- `platform/admins/` — platform-admin account management (`invite`/`disable`/`enable`);
  `platform/stats/` — school/user counts
- `users/` — school-scoped user management (`invite`/`disable`/`enable`/`assign-role`/
  `remove-role`); direct creation is rejected (405) — always via `invite`
- `roles/` — read-only, lists the caller's own school's roles + permissions
- `audit/` — read-only audit log (platform admins see everything; school users with
  `audit.view` see only their own school)
- `academics/{academic-years,terms,departments,subjects,classes,sections}/` — school academic
  structure (all `academics.*` permission-gated)
- `staff/` — staff profiles (`create` links an existing invited user; `DELETE` deactivates rather
  than removing; `enable` reactivates)
- `students/` — student records (`DELETE` archives rather than removing); `students/{id}/guardians/`
  (GET/POST/DELETE) links/lists/unlinks guardians
- `parents/` — guardian records
- `timetable/{rooms,periods,entries}/` — weekly recurring timetable, DB + serializer conflict
  detection on class/teacher/room double-booking; `timetable/me/` — the caller's own lessons
  (teacher or student)
- `attendance/students/` — daily/subject-level attendance, `bulk-mark` (whole-section, idempotent
  upsert) and `stats` actions; `attendance/staff/` — staff attendance (separate
  `staff_attendance.*` permission from student attendance)
- `examinations/{grading-scales,grade-boundaries,exams,schedules}/` — exam configuration
- `results/` — the mark lifecycle (`draft→submitted→reviewed→approved→published→locked`), one
  action per transition (`submit`/`review`/`approve`/`publish`/`lock`); `correct` is the only way
  to change a `locked` result (requires a `reason`, fully audited); `bulk-enter` for a whole
  class's scores at once; `report-card` aggregates a student's published/locked results
- `finance/{fee-categories,fee-structures,fee-structure-items}/` — fee configuration;
  `finance/invoices/` (`generate` bulk-creates from a fee structure, `cancel`, `outstanding`,
  `stats`); `finance/invoice-line-items/` (locked once a payment exists); `finance/payments/`
  (atomic balance updates, duplicate-payment rejection, `refund` action)
- `library/{categories,books,copies}/`; `library/loans/` (`create` = checkout, `return`, `renew`);
  `library/reservations/` (`cancel`, `fulfill`)
- `transport/{vehicles,routes,stops,maintenance,assignments}/`
- `hostel/{hostels,rooms,beds}/`; `hostel/allocations/` (`create` = allocate, atomic
  over-allocation prevention; `check-out`)
- `medical/{profiles,visits}/` — stricter permissions, principal/school-admin only by default
- `discipline/incidents/` — stricter permissions, principal/school-admin only by default
- `notifications/` — read-only inbox scoped to the caller (`mark-read`, `mark-all-read`)
- `communications/announcements/` — targeted (school/class/section/department/staff/students/
  parents/specific-users) announcements; `publish` resolves the audience and notifies them;
  `communications/announcement-recipients/` manages the specific-user recipient list
- `assignments/` — teacher-managed assignments (Cloudinary-backed attachment);
  `assignment-submissions/` (`grade` action, capped at `max_score`); `my-assignments/` and
  `assignments/{id}/submit/` — student self-service (no permission beyond auth, same as
  `timetable/me/`)
- `document-categories/`, `documents/` — stricter permissions, principal/school-admin only by
  default (Cloudinary-backed attachment, school-wide/student/staff via `owner_type`);
  `documents/me/` — student/staff self-service (own documents + public school-wide ones, no
  permission beyond auth)
- `inventory/{categories,items}/` — principal/school-admin only by default (no seeded
  store-keeper role); `items/{id}/stock_in`, `items/{id}/stock_out` (atomic, rejects an
  over-draw with a clean message), `items/low_stock/`; `inventory/transactions/` — read-only
  stock-movement ledger
- `procurement/{suppliers,requests,request-items,orders,order-items}/` — `accountant`-accessible
  by default (plus principal/school-admin); `requests/{id}/{submit,approve,reject,cancel}`
  (submit rejects an empty request; approve/reject need `procurement.approve`);
  `orders/{id}/{send,cancel,receive}` (`receive` records a partial/full shipment, updates the
  linked `InventoryItem`'s stock via the same ledger as `inventory/`, and rejects an over-receipt)
- `reports/{dashboard,enrollment,attendance,academic-performance,finance}/` — no new models, pure
  aggregation over existing data; `accountant`/`registrar`-accessible by default (plus
  principal/school-admin); each is `reports.view` to see as JSON, `reports.export` to download as
  CSV via `?export=csv` on the same endpoint (**not** `?format=csv` — that collides with DRF's own
  reserved query parameter)

## Public website

The marketing site lives in `website/` and is served by the same service as the app. See `docs/WEBSITE.md` (architecture,
build, enquiries, environment, what still needs a human) and `docs/product-audit.md` (what the website may and may not claim).

```bash
cd website && npm install && npm test && npm run build
```

## Environment variables

- `backend/.env` — see `backend/.env.example` for the full list (Neon `DATABASE_URL`,
  Django secret key, CORS/CSRF origins, Cloudinary, Brevo). **Never commit `.env`.**
- `frontend/.env.local` — see `frontend/.env.example`. Only non-secret, public config belongs
  here (it ships in client-side JS).

## Testing

```bash
cd backend && pytest
```

Runs against a real, ephemeral Neon test database (created and migrated automatically) — no
mocking of the ORM. If a run reports the test database "already exists" or "being accessed by
other users", a prior run's teardown was interrupted (a known Neon-pooler quirk — see
IMPLEMENTATION_STATUS.md); reconnect and drop it manually, or just retry.

(Test suite is being built out alongside each domain app — see IMPLEMENTATION_STATUS.md.)
