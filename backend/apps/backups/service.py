"""Creating, verifying, pruning and restoring database backups.

What a backup is: a logical dump of every application table (Django's serializer, JSON), gzip-compressed, encrypted in
1 MB chunks (`crypto.py`), checksummed, and stored through a `BackupStorageProvider` (`storage.py`). It is a safety net
that lives with the application — it is not a substitute for the database host's own point-in-time recovery (Neon's
history retention), which should stay switched on as the first line of defence. See docs/BACKUP_AND_RECOVERY.md.

A backup only counts as a recovery point once it is *verified*: the stored file is read back, its checksum compared,
decrypted, decompressed and parsed, and its object count compared with the row counts taken at dump time."""

import hashlib
import json
import logging
import tempfile
import zlib
from datetime import datetime, timedelta
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core import signing
from django.core.management import call_command
from django.db import connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.common.background import run_in_background
from apps.common.request_id import get_request_id

from .crypto import BackupCryptoError, decrypt_stream, encrypt_file
from .models import BackupRecord, BackupSettings, RestoreRecord
from .storage import BackupStorageError, get_storage

logger = logging.getLogger("apps.backups")

# Bookkeeping that must survive a restore, plus tables that are rebuilt by Django itself.
EXCLUDED_APPS = {"contenttypes", "sessions", "admin", "backups"}
EXCLUDED_MODELS = {"auth.permission"}

# A "running" backup older than this is assumed to have died with its process and no longer blocks new ones.
STALE_AFTER = timedelta(hours=2)
RESTORE_TOKEN_MAX_AGE = 10 * 60
_RESTORE_SALT = "nts.backups.restore"


class BackupError(Exception):
    """A problem to show the administrator, in plain words."""


class BackupInProgress(BackupError):
    pass


# ---- what is in a backup ---------------------------------------------------------------------------


def included_models(*, with_through: bool = False):
    models = apps.get_models(include_auto_created=with_through)
    return [
        m
        for m in models
        if m._meta.app_label not in EXCLUDED_APPS and m._meta.label_lower not in EXCLUDED_MODELS and not m._meta.proxy
    ]


def _dump_excludes() -> list[str]:
    return sorted(EXCLUDED_APPS) + ["auth.Permission"]


def current_schema_state() -> dict[str, str]:
    """The newest applied migration of every application that is part of a backup."""
    latest: dict[str, str] = {}
    for app, name in MigrationRecorder.Migration.objects.order_by("app", "name").values_list("app", "name"):
        if app not in EXCLUDED_APPS:
            latest[app] = name
    return latest


def current_record_counts() -> dict[str, int]:
    return {m._meta.label_lower: m._base_manager.count() for m in included_models()}


# ---- creating --------------------------------------------------------------------------------------


def _sha256_of_stream(chunks) -> tuple[str, int]:
    digest, size = hashlib.sha256(), 0
    for chunk in chunks:
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


def _storage_key(record: BackupRecord) -> str:
    return f"nts-backups/{record.created_at:%Y/%m}/{record.id}.ntsbak"


def reap_stale() -> int:
    """A backup or restore whose process died (a deploy, a crash, the server going to sleep) would otherwise show as
    "running" forever. Anything unfinished for longer than STALE_AFTER is marked failed, with the reason."""
    cutoff = timezone.now() - STALE_AFTER
    reason = "Interrupted: the server stopped before this finished."
    backups = BackupRecord.objects.filter(status__in=["pending", "running"], created_at__lt=cutoff).update(
        status=BackupRecord.Status.FAILED, finished_at=timezone.now(), error_message=reason
    )
    restores = RestoreRecord.objects.exclude(status__in=["completed", "failed"]).filter(created_at__lt=cutoff)
    ids = list(restores.values_list("backup_id", flat=True))
    restores.update(status=RestoreRecord.Status.FAILED, finished_at=timezone.now(), error_message=reason)
    BackupRecord.objects.filter(pk__in=ids).update(in_use_by_restore=False)
    return backups + len(ids)


def start_backup(kind: str, user=None) -> BackupRecord:
    """Records that a backup is starting. The settings row is locked while this happens, so two instances or two
    administrators clicking at once can never start overlapping backups."""
    reap_stale()
    with transaction.atomic():
        BackupSettings.objects.select_for_update().get_or_create(pk=1)
        running = BackupRecord.objects.filter(
            status__in=[BackupRecord.Status.PENDING, BackupRecord.Status.RUNNING],
            created_at__gte=timezone.now() - STALE_AFTER,
        ).exists()
        if running:
            raise BackupInProgress("A backup is already running. Wait for it to finish.")
        return BackupRecord.objects.create(
            kind=kind,
            created_by_id=getattr(user, "pk", None),
            created_by_email=getattr(user, "email", "") or "",
            storage_backend=settings.BACKUP_STORAGE,
        )


def run_backup(record_id) -> BackupRecord:
    """Does the work for a record made by `start_backup`. Never raises: a failure is recorded on the record."""
    record = BackupRecord.objects.get(pk=record_id)
    record.status = BackupRecord.Status.RUNNING
    record.started_at = timezone.now()
    record.save(update_fields=["status", "started_at"])
    storage = get_storage(record.storage_backend)
    try:
        with tempfile.TemporaryDirectory(prefix="nts-backup-") as tmp:
            dump = Path(tmp) / "dump.json.gz"
            sealed = Path(tmp) / "dump.ntsbak"
            counts = current_record_counts()
            schema_state = current_schema_state()
            # `use_base_manager`: the normal managers filter by the current school; a backup needs every row.
            call_command(
                "dumpdata",
                *[f"--exclude={name}" for name in _dump_excludes()],
                use_base_manager=True,
                format="json",
                output=str(dump),
                verbosity=0,
            )
            encrypt_file(dump, sealed)
            with open(sealed, "rb") as handle:
                checksum, size = _sha256_of_stream(iter(lambda: handle.read(1024 * 1024), b""))
            if size == 0:
                raise BackupError("The backup file came out empty.")
            record.storage_key = _storage_key(record)
            storage.put(record.storage_key, sealed)
        record.checksum_sha256 = checksum
        record.size_bytes = size
        record.record_counts = counts
        record.schema_state = schema_state
        record.finished_at = timezone.now()
        record.status = BackupRecord.Status.COMPLETED
        record.save()
        verify_backup(record)
    except Exception as exc:  # noqa: BLE001 - recorded on the backup, never lost
        _fail_backup(record, exc)
    record.refresh_from_db()
    return record


def _fail_backup(record: BackupRecord, exc: Exception) -> None:
    logger.error("Backup %s failed: %s", record.id, exc, exc_info=True)
    record.status = BackupRecord.Status.FAILED
    record.finished_at = timezone.now()
    record.error_message = _safe_message(exc)
    record.save(update_fields=["status", "finished_at", "error_message"])
    _audit("BACKUP_FAILED", record, severity=AuditLog.Severity.WARNING, extra={"reason": record.error_message})


def _safe_message(exc: Exception) -> str:
    text = str(exc) or exc.__class__.__name__
    return text[:500]


def create_backup(kind: str = BackupRecord.Kind.MANUAL, user=None, *, background: bool = False) -> BackupRecord:
    record = start_backup(kind, user)
    _audit("BACKUP_STARTED", record, actor=user)
    if background:
        run_in_background("database backup", run_backup, record.pk)
        return record
    return run_backup(record.pk)


# ---- verifying -------------------------------------------------------------------------------------


def _decompressed_json_chunks(record: BackupRecord):
    storage = get_storage(record.storage_backend)
    inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
    for piece in decrypt_stream(storage.stream(record.storage_key)):
        out = inflater.decompress(piece)
        if out:
            yield out
    tail = inflater.flush()
    if tail:
        yield tail
    if not inflater.eof:
        raise BackupError("The backup's compressed data is incomplete.")


def verify_backup(record: BackupRecord, *, actor=None) -> bool:
    """Reads the stored backup back and proves it is usable. Marks the record valid or invalid."""
    problem = ""
    try:
        storage = get_storage(record.storage_backend)
        if not record.storage_key or not storage.exists(record.storage_key):
            raise BackupError("The backup file is missing from storage.")
        checksum, size = _sha256_of_stream(storage.stream(record.storage_key))
        if size == 0:
            raise BackupError("The stored backup file is empty.")
        if checksum != record.checksum_sha256 or size != record.size_bytes:
            raise BackupError("The stored backup does not match its checksum — it was altered or damaged.")
        with tempfile.TemporaryDirectory(prefix="nts-verify-") as tmp:
            raw = Path(tmp) / "dump.json"
            with open(raw, "wb") as out:
                for chunk in _decompressed_json_chunks(record):
                    out.write(chunk)
            with open(raw, encoding="utf-8") as handle:
                objects = json.load(handle)
        expected = sum(record.record_counts.values())
        if not isinstance(objects, list) or len(objects) != expected:
            raise BackupError(
                f"The backup holds {len(objects) if isinstance(objects, list) else 'invalid'} records but {expected} were expected."
            )
    except (BackupError, BackupCryptoError, BackupStorageError, ValueError, zlib.error) as exc:
        problem = _safe_message(exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("Verifying backup %s crashed: %s", record.id, exc, exc_info=True)
        problem = "Verification could not be completed: " + _safe_message(exc)

    record.verified_at = timezone.now()
    if problem:
        record.verification = BackupRecord.Verification.INVALID
        record.error_message = problem
        if record.status == BackupRecord.Status.COMPLETED and not record.in_use_by_restore:
            # A backup that fails its own check is not a recovery point.
            record.status = BackupRecord.Status.FAILED
        record.save(update_fields=["verification", "error_message", "verified_at", "status"])
        _audit("BACKUP_FAILED", record, actor=actor, severity=AuditLog.Severity.WARNING, extra={"reason": problem})
        return False
    record.verification = BackupRecord.Verification.VALID
    record.error_message = ""
    record.save(update_fields=["verification", "error_message", "verified_at"])
    _audit("BACKUP_VERIFIED", record, actor=actor)
    return True


# ---- retention -------------------------------------------------------------------------------------


def _protected_ids() -> set:
    cfg = BackupSettings.get_solo()
    valid = list(
        BackupRecord.objects.filter(status=BackupRecord.Status.COMPLETED, verification=BackupRecord.Verification.VALID)
        .order_by("-created_at")
        .values_list("id", flat=True)
    )
    protected = set(valid[: max(cfg.min_valid_to_keep, 1)])  # never fewer than the newest valid backup
    protected |= set(BackupRecord.objects.filter(in_use_by_restore=True).values_list("id", flat=True))
    protected |= set(  # a backup that is still being written
        BackupRecord.objects.filter(status__in=[BackupRecord.Status.PENDING, BackupRecord.Status.RUNNING]).values_list(
            "id", flat=True
        )
    )
    return protected


def delete_backup(record: BackupRecord, *, actor=None, reason: str = "") -> None:
    if record.id in _protected_ids():
        raise BackupError(
            "This backup is protected: it is one of the most recent valid backups, still being written, or in use by a restore."
        )
    if record.storage_key:
        try:
            get_storage(record.storage_backend).delete(record.storage_key)
        except BackupStorageError as exc:
            raise BackupError(f"The backup file could not be removed from storage: {exc}") from exc
    _audit("BACKUP_DELETED", record, actor=actor, extra={"reason": reason or "manual"})
    record.delete()


def apply_retention(now=None) -> int:
    """Removes backups older than the retention period — but never the newest valid ones (`min_valid_to_keep`),
    never one a restore is using, never one still being written. Returns how many were removed."""
    now = now or timezone.now()
    cfg = BackupSettings.get_solo()
    cutoff = now - timedelta(days=cfg.retention_days)
    protected = _protected_ids()
    removed = 0
    for record in BackupRecord.objects.filter(created_at__lt=cutoff).exclude(id__in=protected):
        try:
            delete_backup(record, reason="retention")
            removed += 1
        except BackupError as exc:
            logger.warning("Retention skipped backup %s: %s", record.id, exc)
    return removed


# ---- scheduling ------------------------------------------------------------------------------------


def _due_since(now: datetime, cfg: BackupSettings) -> datetime:
    today_slot = now.replace(hour=cfg.schedule_hour_utc, minute=0, second=0, microsecond=0)
    return today_slot if now >= today_slot else today_slot - timedelta(days=1)


def next_scheduled_at(now=None) -> datetime | None:
    now = now or timezone.now()
    cfg = BackupSettings.get_solo()
    if not cfg.automatic_enabled:
        return None
    last_slot = _due_since(now, cfg)
    done = BackupRecord.objects.filter(
        kind=BackupRecord.Kind.AUTOMATIC, created_at__gte=last_slot, status__in=["pending", "running", "completed"]
    ).exists()
    return last_slot + timedelta(days=1) if done else last_slot


def is_scheduled_backup_due(now=None) -> bool:
    now = now or timezone.now()
    cfg = BackupSettings.get_solo()
    if not cfg.automatic_enabled:
        return False
    slot = _due_since(now, cfg)
    if BackupRecord.objects.filter(
        kind=BackupRecord.Kind.AUTOMATIC, created_at__gte=slot, status__in=["pending", "running", "completed"]
    ).exists():
        return False
    # A failed attempt is retried, but not in a tight loop.
    recent_failure = BackupRecord.objects.filter(
        kind=BackupRecord.Kind.AUTOMATIC, status="failed", created_at__gte=now - timedelta(hours=1)
    ).exists()
    return not recent_failure


def run_scheduled_backup_if_due(now=None, *, background: bool = False) -> BackupRecord | None:
    """The one entry point every scheduler uses (the cron command, the tick URL, the opportunistic call from normal
    traffic). Safe to call from any number of instances at once: `start_backup`'s row lock lets exactly one win."""
    if not is_scheduled_backup_due(now):
        return None
    try:
        record = create_backup(BackupRecord.Kind.AUTOMATIC, None, background=background)
    except BackupInProgress:
        return None
    if not background:
        apply_retention()
    return record


def trigger_scheduled_backup_from_traffic() -> None:
    """Called from ordinary requests (the sign-in heartbeat): if the daily backup is due, start it in the background.
    This makes the daily backup happen on a server with no cron job at all — as long as anybody is using the system.
    It is only a convenience; the dependable schedule is an external cron/tick (see docs/BACKUP_AND_RECOVERY.md).
    Cheap and safe: checked at most once every few minutes per process, and the row lock in `start_backup` guarantees
    that however many processes try at once, one backup starts."""
    from django.core.cache import cache

    if not settings.BACKUP_AUTO_TRIGGER or not cache.add("backups:tick", 1, 300):
        return
    run_in_background("scheduled backup", _scheduled_job)


def _scheduled_job() -> None:
    run_scheduled_backup_if_due()


# ---- restoring -------------------------------------------------------------------------------------


def restore_phrase(record: BackupRecord) -> str:
    return f"RESTORE {record.created_at:%Y-%m-%d %H:%M}"


def compatibility_problem(record: BackupRecord) -> str:
    state = current_schema_state()
    if record.schema_state != state:
        changed = sorted({a for a in set(state) | set(record.schema_state) if state.get(a) != record.schema_state.get(a)})
        return (
            "This backup was taken with a different database version (" + ", ".join(changed[:6]) + "). "
            "Restoring it would not fit the current schema."
        )
    return ""


def prepare_restore(record: BackupRecord, user) -> dict:
    """Step 1 of a restore: checks the chosen backup and returns what the administrator must read and confirm,
    plus a short-lived signed token that the actual restore call must present."""
    if not settings.BACKUP_ALLOW_RESTORE:
        raise BackupError("Restoring is disabled on this server (BACKUP_ALLOW_RESTORE is off).")
    if not record.is_restorable:
        raise BackupError("Only a completed, verified backup can be restored. Verify this backup first.")
    problem = compatibility_problem(record)
    if problem:
        raise BackupError(problem)
    if RestoreRecord.objects.exclude(status__in=["completed", "failed"]).filter(
        created_at__gte=timezone.now() - STALE_AFTER
    ).exists():
        raise BackupError("Another restore is already running.")
    token = signing.dumps({"b": str(record.id), "u": str(user.pk), "c": record.checksum_sha256}, salt=_RESTORE_SALT)
    return {
        "backup_id": str(record.id),
        "taken_at": record.created_at.isoformat(),
        "kind": record.kind,
        "size_bytes": record.size_bytes,
        "record_total": sum(record.record_counts.values()),
        "required_phrase": restore_phrase(record),
        "token": token,
        "token_valid_seconds": RESTORE_TOKEN_MAX_AGE,
        "warning": (
            f"You are about to restore the whole database to how it was on {record.created_at:%d %b %Y at %H:%M} UTC. "
            "Everything created or changed after that moment — across every school — will be lost. "
            "A safety backup of the current data is taken first."
        ),
    }


def begin_restore(record: BackupRecord, user, *, token: str, confirmation: str, background: bool = True) -> RestoreRecord:
    """Step 2: the checks that make a restore a deliberate act, then the restore itself in the background."""
    try:
        claims = signing.loads(token, salt=_RESTORE_SALT, max_age=RESTORE_TOKEN_MAX_AGE)
    except signing.BadSignature as exc:
        raise BackupError("This restore confirmation has expired. Start again.") from exc
    if claims.get("b") != str(record.id) or claims.get("u") != str(user.pk) or claims.get("c") != record.checksum_sha256:
        raise BackupError("This confirmation does not belong to this backup or administrator. Start again.")
    if confirmation.strip() != restore_phrase(record):
        raise BackupError("The confirmation text does not match.")
    prepare_restore(record, user)  # re-run every check right before acting

    with transaction.atomic():
        BackupSettings.objects.select_for_update().get_or_create(pk=1)
        if RestoreRecord.objects.exclude(status__in=["completed", "failed"]).filter(
            created_at__gte=timezone.now() - STALE_AFTER
        ).exists():
            raise BackupError("Another restore is already running.")
        restore = RestoreRecord.objects.create(
            backup_id=record.id,
            started_by_id=user.pk,
            started_by_email=user.email,
            step_message="Waiting to start",
            request_id=get_request_id(),
        )
        BackupRecord.objects.filter(pk=record.pk).update(in_use_by_restore=True)
    _audit("RESTORE_STARTED", record, actor=user, severity=AuditLog.Severity.WARNING, extra={"restore_id": str(restore.id)})
    if background:
        run_in_background("database restore", run_restore, restore.pk)
    else:
        run_restore(restore.pk)
    restore.refresh_from_db()
    return restore


def _set_step(restore: RestoreRecord, status: str, message: str) -> None:
    restore.status = status
    restore.step_message = message
    if status == RestoreRecord.Status.PREPARING and restore.started_at is None:
        restore.started_at = timezone.now()
    restore.save(update_fields=["status", "step_message", "started_at"])


def _truncate_all(cursor) -> None:
    tables = {m._meta.db_table for m in included_models(with_through=True)}
    # Tables outside the backup that point at backed-up tables (Django's admin log references users) must be emptied in
    # the same statement, or PostgreSQL refuses: after a restore their rows would point at users that may not exist.
    if apps.is_installed("django.contrib.admin"):
        tables.add(apps.get_model("admin", "LogEntry")._meta.db_table)
    tables = sorted(tables)
    quoted = ", ".join(connection.ops.quote_name(t) for t in tables)
    # Foreign keys are checked at commit (DEFERRABLE INITIALLY DEFERRED). Flush any checks still pending from earlier
    # in this transaction — PostgreSQL refuses to TRUNCATE a table with unfired constraint triggers — and then defer
    # them again, so the dump can be loaded in any table order and is verified once, at the end.
    cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    cursor.execute(f"TRUNCATE TABLE {quoted} RESTART IDENTITY")
    cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def run_restore(restore_id) -> RestoreRecord:
    """The restore itself. Every step is recorded; the destructive part runs in ONE transaction together with its own
    verification, so any failure rolls the database back to exactly what it was."""
    restore = RestoreRecord.objects.get(pk=restore_id)
    record = BackupRecord.objects.get(pk=restore.backup_id)
    try:
        _set_step(restore, RestoreRecord.Status.PREPARING, "Checking the backup")
        if not verify_backup(record):
            raise BackupError("The backup failed its integrity check, so it was not restored.")
        problem = compatibility_problem(record)
        if problem:
            raise BackupError(problem)

        _set_step(restore, RestoreRecord.Status.BACKING_UP, "Saving a safety backup of the current database")
        safety = create_backup(BackupRecord.Kind.PRE_RESTORE, None)
        if not safety.is_restorable:
            raise BackupError("The safety backup of the current data could not be completed, so nothing was changed.")
        restore.safety_backup_id = safety.id
        restore.save(update_fields=["safety_backup_id"])

        _set_step(restore, RestoreRecord.Status.RESTORING, "Replacing the database contents")
        with tempfile.TemporaryDirectory(prefix="nts-restore-") as tmp:
            fixture = Path(tmp) / "restore.json"
            with open(fixture, "wb") as out:
                for chunk in _decompressed_json_chunks(record):
                    out.write(chunk)
            with transaction.atomic():
                with connection.cursor() as cursor:
                    _truncate_all(cursor)
                call_command("loaddata", str(fixture), verbosity=0)
                mismatched = {
                    label: (have, want)
                    for label, want in record.record_counts.items()
                    if (have := apps.get_model(label)._base_manager.count()) != want
                }
                if mismatched:
                    raise BackupError(
                        "The restored data did not match the backup (" + ", ".join(sorted(mismatched)[:5]) + "); it was rolled back."
                    )

        _set_step(restore, RestoreRecord.Status.VERIFYING, "Checking the restored database")
        if current_schema_state() != record.schema_state:
            raise BackupError("The restored database did not pass the final check.")
        restore.status = RestoreRecord.Status.COMPLETED
        restore.step_message = "The database was restored"
        restore.finished_at = timezone.now()
        restore.save(update_fields=["status", "step_message", "finished_at"])
        _audit("RESTORE_COMPLETED", record, extra={"restore_id": str(restore.id), "restored_by": restore.started_by_email})
    except Exception as exc:  # noqa: BLE001 - recorded, and the transaction above has already rolled back
        logger.error("Restore %s failed: %s", restore.id, exc, exc_info=True)
        restore.refresh_from_db()
        restore.status = RestoreRecord.Status.FAILED
        restore.step_message = "The restore did not complete"
        restore.error_message = _safe_message(exc)
        restore.finished_at = timezone.now()
        restore.save(update_fields=["status", "step_message", "error_message", "finished_at"])
        _audit("RESTORE_FAILED", record, severity=AuditLog.Severity.CRITICAL, extra={"restore_id": str(restore.id), "reason": restore.error_message})
        _audit("RESTORE_ROLLBACK", record, extra={"restore_id": str(restore.id)})
    finally:
        BackupRecord.objects.filter(pk=record.pk).update(in_use_by_restore=False)
    restore.refresh_from_db()
    return restore


# ---- shared ----------------------------------------------------------------------------------------


def _audit(action: str, record: BackupRecord, *, actor=None, severity=AuditLog.Severity.INFO, extra=None) -> None:
    try:
        log_action(
            action=f"backup.{action.lower()}",
            actor=actor,
            entity_type="BackupRecord",
            entity_id=str(record.id),
            severity=severity,
            metadata={
                "event": action,
                "kind": record.kind,
                "backup_id": str(record.id),
                "request_id": get_request_id(),
                **(extra or {}),
            },
        )
    except Exception:  # noqa: BLE001 - an audit hiccup must never break a backup or leave a restore half-recorded
        logger.error("Could not write audit event %s", action, exc_info=True)
