# Backup & Recovery

The platform administrator's **Backup & Recovery** page (`/platform/backups`) takes, verifies, stores and restores
encrypted backups of the whole database. This document explains how it works and how to run it safely.

## What a backup is — and isn't

* A **logical dump**: every application table (all schools), serialised by Django to JSON, gzip-compressed, **encrypted**
  in 1 MB chunks (Fernet: AES-128-CBC + HMAC-SHA256), checksummed (SHA-256) and written to durable storage.
* It deliberately **excludes** Django's own rebuildable tables (content types, permissions, sessions, admin log) and the
  backup bookkeeping tables themselves, so a restore can never erase the history of backups and restores.
* It is an **application-level safety net**. It does **not** replace the database host's own point-in-time recovery.
  Keep **Neon's history retention / branching** switched on as the first line of defence (minute-level recovery, no
  application involvement). This feature gives you: a daily, verified, encrypted, off-database copy you control and can
  restore from the UI, plus an automatic safety backup before every restore.
* Practical size limit: verification and restore parse the dump in memory. That is comfortable up to a few hundred MB of
  JSON. If the database grows beyond that, add a physical `pg_dump` job (see "Scaling up" below).

## Objectives (assumptions)

| | Target | Why |
|---|---|---|
| **RPO** (data you can lose) | **≤ 24 hours** with the daily backup; **minutes** with Neon point-in-time recovery | Backups run once a day; PITR is continuous |
| **RTO** (time to be back) | **≈ 5–30 minutes** for a typical school-system database (restore time grows with size) | Download + decrypt + truncate + load + verify |

## Automatic daily backup

`BackupSettings` holds the schedule (default **02:00 UTC**), retention and on/off switch. A backup is "due" when no
automatic backup has been created since the most recent scheduled time. Three things can start it — all idempotent, all
safe to run on every instance at once:

1. **Cron / scheduler** (recommended, dependable): run `python manage.py run_scheduled_backup` every 15 minutes (a Render
   Cron Job, GitHub Action, or any machine with the environment). It acts only when a backup is due.
2. **Scheduler URL**: `POST /api/v1/platform/backups/tick/` with header `X-Backup-Token: $BACKUP_TICK_TOKEN` — for an
   external pinger. Disabled while `BACKUP_TICK_TOKEN` is empty.
3. **Opportunistic**: ordinary traffic (the sign-in heartbeat) starts a due backup in the background
   (`BACKUP_AUTO_TRIGGER`, on by default). Convenient, but a server that is asleep (Render free plan) gets no traffic and
   therefore no backup — use (1) or (2) for a guarantee.

**No overlapping jobs, no single-process timer.** Starting a backup locks the `backup_settings` row inside a database
transaction (`SELECT … FOR UPDATE`); if another backup is pending/running (and younger than 2 hours) the second caller
gets "already running". This works across any number of instances and behind a connection pooler (it is a transaction-scoped
lock, not a session advisory lock). A backup that died mid-run stops blocking after 2 hours.

## Storage

`BACKUP_STORAGE` selects a `BackupStorageProvider` (`apps/backups/storage.py`). With nothing set it picks **r2** when the
four `BACKUP_R2_*` variables are present, else **cloudinary** when Cloudinary is configured, else **local**.

* **`r2` — Cloudflare R2 (recommended).** An S3-compatible private bucket in an account that is separate from your uploads,
  with no download fees. Setup:
  1. Cloudflare dashboard → **R2** → *Create bucket* (e.g. `nts-backups`). Leave it **private** — do not enable the public
     `r2.dev` URL or attach a public custom domain.
  2. **R2 → Manage R2 API Tokens → Create API token**: permission **Object Read & Write**, *Apply to specific buckets
     only* → your backup bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once).
  3. Your **Account ID** is on the R2 overview page (right-hand side).
  4. Set on the server: `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`,
     `BACKUP_R2_SECRET_ACCESS_KEY` (and `BACKUP_ENCRYPTION_KEY`). The endpoint is derived
     (`https://<account>.r2.cloudflarestorage.com`, region `auto`).
  5. Optional: a bucket **lifecycle rule** is unnecessary — the application prunes by its own retention policy.
  Large backups are uploaded in 16 MB parts and each part is retried.
* `s3` — any other private S3-compatible bucket (AWS S3, Backblaze B2, MinIO) via `BACKUP_S3_*`.
* `cloudinary` — uploaded as a **private, authenticated raw** file, fetchable only through a server-signed link. Check your
  plan's raw-file size limit; note it shares an account with your uploads.
* `local` — a folder (`BACKUP_LOCAL_DIR`, default `backend/backups_data`, git-ignored, never under static/media). **Only
  durable on a server with a persistent disk.** The dashboard warns loudly if production uses it.

Backups are never placed in a public directory, are encrypted before they leave the server (so even the bucket operator
cannot read them), and credentials never appear in any API response or log.

## Encryption

`BACKUP_ENCRYPTION_KEY` (≥ 32 random characters) — generate with
`python -c "import secrets; print(secrets.token_urlsafe(48))"`. In production a server **refuses to create a backup**
without it. **Store a copy of this key somewhere safe and separate from the server** — without it every backup is
permanently unreadable. Rotating the key makes earlier backups undecryptable by the new key; keep the old key until old
backups expire.

## Verification (a file existing is not a backup)

After creation, and on demand (`Verify`), the system reads the stored file back and checks: it exists and is non-empty →
its SHA-256 and size match what was recorded → it decrypts (wrong key / tampering fails) → it decompresses fully → it
parses as JSON → the number of records equals the row counts captured at dump time. Only then is it **valid**. A backup
that fails its check is marked **failed/invalid** and is never offered for restore.

## Retention

`retention_days` (default 14) and `min_valid_to_keep` (default 3). Older backups are pruned after each automatic run, but
**never**: the newest valid backup, the newest `min_valid_to_keep` valid backups, any backup a restore is using, or one
still being written. Manual deletion obeys the same protection.

## Restore

Only **platform administrators** can restore, and only a **completed, verified** backup whose database schema matches the
running one (the migration state is recorded with every backup; a mismatch is refused).

1. **Select** a backup → *Restore* (`POST …/restore/prepare/`): validates it, returns what will happen and a signed,
   10-minute, single-administrator token.
2. **Read** the warning: "restore the database to how it was on … everything after is lost".
3. **Confirm**: type the exact phrase (`RESTORE YYYY-MM-DD HH:MM`) **and** re-enter your password (`POST …/restore/`).
4. A background job then runs: *preparing* (re-verify, schema check) → *backing_up_current_database* (a verified
   **pre-restore safety backup**; the restore aborts if this fails) → *restoring* → *verifying* → *completed*.
5. The destructive step (truncate every data table + load the dump + compare every table's row count with the backup) runs in
   **one database transaction**: any error, or any count mismatch, rolls the database back to exactly what it was. The
   progress screen polls `GET …/restores/{id}/`.

After a restore, sessions of users who did not exist at the backup time stop working (sign in again). To **undo** a restore,
restore the safety backup the restore created (listed as "Safety (before restore)").

`BACKUP_ALLOW_RESTORE=false` switches restoring off on a server (e.g. during an incident).

## Audit trail

Every action writes an audit event (admin id/email, backup id, result, reason, request id): `BACKUP_STARTED`,
`BACKUP_VERIFIED`, `BACKUP_FAILED`, `BACKUP_DELETED`, `BACKUP_DOWNLOADED`, `RESTORE_STARTED`, `RESTORE_COMPLETED`,
`RESTORE_FAILED`, `RESTORE_ROLLBACK`, `backup.settings_changed`. Audit rows are written by the server only; no API edits them.

## Failure recovery playbook

| Situation | What to do |
|---|---|
| A single wrong change | Use Neon point-in-time recovery to a new branch, or restore the latest valid backup |
| Database lost / corrupted | Provision/repair the database, run migrations (`manage.py migrate`) so the schema matches, deploy the app, then restore the newest valid backup from the dashboard (or `loaddata` from a downloaded, decrypted file) |
| Dashboard unavailable | Download the `.ntsbak` from storage; decrypt with `apps.backups.crypto.decrypt_stream` using the key; `gunzip`; `manage.py loaddata` |
| A restore failed | Nothing was changed (transaction rolled back). Read the reason, fix, retry; the safety backup exists if anything is in doubt |
| Backups failing | The dashboard shows the last error; typical causes: missing `BACKUP_ENCRYPTION_KEY`, storage credentials/quota |

## Scaling up

When the database outgrows in-memory JSON verification, add a physical backup job (`pg_dump -Fc`, run from a worker image
that includes the PostgreSQL client) behind a second `BackupStorageProvider` kind, keeping this module's records,
verification states, retention, audit and UI.
