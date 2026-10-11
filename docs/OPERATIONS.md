# Operations, scaling, reliability & security notes

Companion to `ARCHITECTURE.md`, `SECURITY.md` and `BACKUP_AND_RECOVERY.md`.

## 1. Architecture (as audited)

* **Backend**: Django 5 + Django REST Framework, one Docker web service on Render serving both the API (`/api/v1/*`)
  and the built React app (WhiteNoise). gunicorn `gthread` (2 workers × 2 threads by default, `WEB_CONCURRENCY`,
  `GUNICORN_THREADS`), 300 s request timeout, 30 s graceful timeout, workers recycled every ~1000 requests.
* **Database**: Neon PostgreSQL via the pooler. `CONN_MAX_AGE=600` (connections reused across requests within a worker),
  server-side cursors disabled for pgbouncer. There is no per-request connection churn.
* **Multi-tenancy**: every school-owned model carries a `school` FK; the default manager filters by the request's school;
  `unscoped_objects` is used explicitly where a service needs rows outside request context.
* **Auth**: JWT access (15 min) + refresh (1 day, rotating, blacklisted) in `httpOnly` cookies, CSRF header on unsafe
  methods, Argon2 passwords, per-account lockout, optional TOTP 2FA (required for platform admins & principals unless they
  opt out), sign-in page scoping (a school's users only through their own school's page).
* **Authorization**: server-side only — `require_permission(code)` per action, plus queryset scoping (tenant, teacher-of-
  subject, owner). The frontend hides controls but never decides.
* **Frontend**: React + React Router (BrowserRouter mounted at `/<school-slug>`), TanStack Query, lazy-loaded route chunks,
  PWA service worker (network-first navigations, cache-first hashed assets).
* **Background work**: no queue. `apps.common.background.run_in_background` runs short jobs in a daemon thread (emails
  to a whole school, backups). Scheduled work is driven by an idempotent command + DB row lock (see backup doc).

## 2. Blank-page root causes found and fixed

See the final audit report for the full write-up. In short: (1) **no error boundary anywhere** — any exception while
rendering a page, or a rejected lazy `import()`, unmounted the entire React tree (white screen) until a manual refresh;
(2) **a missing hashed asset was answered with the app's HTML (HTTP 200)** by the SPA fallback, so after a deploy a stale tab
received "HTML as JavaScript" and the lazy page never loaded; (3) the API client had **no timeout**, so a stalled request left
a page spinning forever, and network/5xx failures on the session check were treated like "signed out".

## 3. Concurrency strategy

* Money & capacity are guarded by **transaction + `SELECT … FOR UPDATE` + re-check** (payments/refunds on the invoice row,
  hostel bed allocation, event capacity) — see `apps/finance/services.py`, `apps/hostel/services.py`, `apps/events/views.py`.
* Duplicate-payment guard (`DuplicatePaymentError`), unique constraints for numbering/identity, admissions acceptance in one
  transaction (`@transaction.atomic`).
* Backups/restores use a row lock on `backup_settings` so only one runs at a time, on any number of instances.
* Buttons disable themselves while a save is in flight (frontend), preventing double submits at the source.

## 4. Error handling

Every API error uses one envelope: `{"success": false, "message", "code", "errors": [...], "requestId"}`. `requestId` is the
`X-Request-ID` header (accepted from the caller if it looks sane, else generated) and appears in every log line. Unexpected
exceptions return a generic message — never a stack trace. Browser crashes are reported to `POST /api/v1/client-errors/`
(unauthenticated, throttled, size-limited, written to the `apps.client` log).

## 5. Environment variables (additions)

| Variable | Purpose |
|---|---|
| `BACKUP_STORAGE` | `r2` \| `s3` \| `cloudinary` \| `local` (default: r2 if its four variables are set, else cloudinary if configured, else local) |
| `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | Cloudflare R2 backup storage |
| `BACKUP_ENCRYPTION_KEY` | Encrypts backups. **Required in production.** Back it up separately |
| `BACKUP_LOCAL_DIR` | Folder for `local` storage (never public) |
| `BACKUP_ALLOW_RESTORE` | `false` disables restoring |
| `BACKUP_TICK_TOKEN` | Enables the scheduler URL; secret sent in `X-Backup-Token` |
| `BACKUP_AUTO_TRIGGER` | `false` stops ordinary traffic from starting a due backup |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT_URL`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Other S3-compatible storage |

## 6. Deployment checklist

1. Set `BACKUP_ENCRYPTION_KEY` (and keep a copy off the server) and, ideally, durable `BACKUP_STORAGE`.
2. Deploy; `deploy/start.sh` runs migrations (`backups`, `platform_admin`, `tenants`, `users` are new).
3. Add a scheduler: a Render **Cron Job** running `python manage.py run_scheduled_backup` every 15 minutes, **or** an
   external pinger calling the tick URL.
4. Open **Backup & Recovery**, press *Back up now*, confirm it becomes *Verified*, download once and check the file is
   non-empty.
5. Turn on **Neon history retention** for point-in-time recovery.
6. Move off the Render **free** plan for production: it sleeps after 15 minutes idle (no traffic, no backups, a ~1 minute
   cold start) and has 512 MB RAM.
7. Confirm `TRUSTED_PROXY_COUNT` (see `deploy/README.md`).

## 7. Monitoring & troubleshooting

* Logs carry `[request_id]`; search a user-reported id. Browser crashes appear as `apps.client` warnings.
* Health: `GET /api/v1/health/` (used by Render). Backups: dashboard overview + audit events `backup.*`.
* "Page blank/stuck": check the browser console for `[chunk]`/`[render]` lines and the `apps.client` log for the same.
* Rate limiting uses Django's cache. The default cache is per-process memory, so limits apply per worker; with several
  instances use a shared cache (Redis) — a known limitation listed in the audit.

## 8. Schema migrations

Prefer additive, backwards-compatible migrations (add nullable/defaulted columns first, backfill, then tighten in a later
deploy). Backups record the migration state; restore refuses a backup from a different schema, so **take a backup before
deploying a migration that changes existing columns.**


## 9. Real-time notifications (Web Push)

A notification created anywhere in the system (`apps.notifications.services.notify` / `notify_bulk`) is also pushed to the
recipient's subscribed browsers through the browser vendor's push service, so it arrives in seconds even when the app is
closed. Nothing holds a connection open on our server (important on a small gunicorn instance). Open tabs are told by the
service worker (`sw.js`) and refresh straight away; the bell's polling remains the fallback.

**Set-up (once):** run `python manage.py generate_vapid_keys` (in `backend/`), then set `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` in Render. Keep the private key secret and do not change it later, or every device must re-subscribe.
Optional: `VAPID_SUBJECT` (default `mailto:hello@ntsdigitalsolutions.com`). Without the keys push is off and the bell hides
its "Get alerts on this device" row.

**Using it:** each person opens the bell and chooses *Turn on* (the browser then asks permission). Alerts are removed from
the device when the person signs out, and switched back on at the next sign-in on that browser. iPhones only support push
for the app added to the home screen. Dead subscriptions (HTTP 404/410 from the push service) are deleted automatically.
