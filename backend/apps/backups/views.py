"""Backup & Recovery admin API — platform administrators only.

Everything here is under /api/v1/platform/backups/. Nothing returned ever includes storage credentials or the
storage location of a file; the encrypted download is the only way to take a file out."""

import hmac

from django.conf import settings
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.authentication import lockout
from apps.authorization.permissions import IsPlatformAdmin
from apps.common.net import get_client_ip as client_ip

from . import service
from .models import BackupRecord, BackupSettings, RestoreRecord
from .service import BackupError
from .storage import BackupStorageError, get_storage

MAX_PAGE_SIZE = 50


def _ok(message="", http_status=status.HTTP_200_OK, **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra}, status=http_status)


def _fail(message, code="BACKUP_ERROR", http_status=status.HTTP_400_BAD_REQUEST):
    return Response(
        {"success": False, "message": message, "code": code, "errors": [{"field": None, "message": message}]},
        status=http_status,
    )


def backup_payload(record: BackupRecord) -> dict:
    return {
        "id": str(record.id),
        "kind": record.kind,
        "status": record.status,
        "verification": record.verification,
        "created_at": record.created_at.isoformat(),
        "started_at": record.started_at.isoformat() if record.started_at else None,
        "finished_at": record.finished_at.isoformat() if record.finished_at else None,
        "verified_at": record.verified_at.isoformat() if record.verified_at else None,
        "created_by_email": record.created_by_email,
        "size_bytes": record.size_bytes,
        "checksum_sha256": record.checksum_sha256,
        "encrypted": record.encrypted,
        "storage": record.storage_backend,
        "record_total": sum(record.record_counts.values()) if record.record_counts else 0,
        "error_message": record.error_message,
        "restorable": record.is_restorable,
        "in_use_by_restore": record.in_use_by_restore,
    }


def restore_payload(restore: RestoreRecord) -> dict:
    return {
        "id": str(restore.id),
        "backup_id": str(restore.backup_id),
        "status": restore.status,
        "step_message": restore.step_message,
        "created_at": restore.created_at.isoformat(),
        "started_at": restore.started_at.isoformat() if restore.started_at else None,
        "finished_at": restore.finished_at.isoformat() if restore.finished_at else None,
        "started_by_email": restore.started_by_email,
        "safety_backup_id": str(restore.safety_backup_id) if restore.safety_backup_id else None,
        "error_message": restore.error_message,
        "is_finished": restore.is_finished,
        "request_id": restore.request_id,
    }


def settings_payload(cfg: BackupSettings) -> dict:
    return {
        "automatic_enabled": cfg.automatic_enabled,
        "schedule_hour_utc": cfg.schedule_hour_utc,
        "retention_days": cfg.retention_days,
        "min_valid_to_keep": cfg.min_valid_to_keep,
    }


class _PlatformAdminView(APIView):
    permission_classes = [IsPlatformAdmin]
    throttle_scope = "backups_admin"


def _paginate(request, queryset):
    try:
        page = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(max(int(request.query_params.get("page_size", 20)), 1), MAX_PAGE_SIZE)
    except ValueError:
        page, page_size = 1, 20
    total = queryset.count()
    start = (page - 1) * page_size
    return total, queryset[start : start + page_size], page, page_size


class BackupOverviewView(_PlatformAdminView):
    """Everything the dashboard's top section needs in one call."""

    def get(self, request):
        service.reap_stale()
        cfg = BackupSettings.get_solo()
        valid = BackupRecord.objects.filter(
            status=BackupRecord.Status.COMPLETED, verification=BackupRecord.Verification.VALID
        )
        last_valid = valid.order_by("-created_at").first()
        last_failed = BackupRecord.objects.filter(status=BackupRecord.Status.FAILED).order_by("-created_at").first()
        running = BackupRecord.objects.filter(status__in=["pending", "running"]).order_by("-created_at").first()
        restoring = RestoreRecord.objects.exclude(status__in=["completed", "failed"]).order_by("-created_at").first()
        next_at = service.next_scheduled_at()
        return _ok(
            overview={
                "settings": settings_payload(cfg),
                "storage": settings.BACKUP_STORAGE,
                "storage_is_durable": settings.BACKUP_STORAGE != "local" or settings.DEBUG,
                "encryption_configured": bool(settings.BACKUP_ENCRYPTION_KEY) or settings.DEBUG,
                "restore_allowed": settings.BACKUP_ALLOW_RESTORE,
                "last_valid_backup": backup_payload(last_valid) if last_valid else None,
                "last_failed_backup": backup_payload(last_failed) if last_failed else None,
                "running_backup": backup_payload(running) if running else None,
                "running_restore": restore_payload(restoring) if restoring else None,
                "next_scheduled_at": next_at.isoformat() if next_at else None,
                "valid_backup_count": valid.count(),
                "total_backup_count": BackupRecord.objects.count(),
                "total_size_bytes": sum(valid.values_list("size_bytes", flat=True)),
            }
        )


class BackupListView(_PlatformAdminView):
    def get(self, request):
        queryset = BackupRecord.objects.all()
        if request.query_params.get("kind") in {"automatic", "manual", "pre_restore"}:
            queryset = queryset.filter(kind=request.query_params["kind"])
        if request.query_params.get("status") in {"pending", "running", "completed", "failed"}:
            queryset = queryset.filter(status=request.query_params["status"])
        total, rows, page, page_size = _paginate(request, queryset)
        return _ok(count=total, page=page, page_size=page_size, results=[backup_payload(r) for r in rows])

    def post(self, request):
        """Starts a manual backup. Returns straight away (202); the dashboard polls the record."""
        try:
            record = service.create_backup(BackupRecord.Kind.MANUAL, request.user, background=True)
        except service.BackupInProgress as exc:
            return _fail(str(exc), "BACKUP_IN_PROGRESS", status.HTTP_409_CONFLICT)
        return _ok("Backup started.", status.HTTP_202_ACCEPTED, backup=backup_payload(record))


class BackupDetailView(_PlatformAdminView):
    def get(self, request, pk):
        return _ok(backup=backup_payload(get_object_or_404(BackupRecord, pk=pk)))

    def delete(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        try:
            service.delete_backup(record, actor=request.user)
        except BackupError as exc:
            return _fail(str(exc), "BACKUP_PROTECTED", status.HTTP_409_CONFLICT)
        return _ok("Backup deleted.")


class BackupVerifyView(_PlatformAdminView):
    def post(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        if record.status in ("pending", "running"):
            return _fail("This backup is still being created.", "BACKUP_IN_PROGRESS", status.HTTP_409_CONFLICT)
        valid = service.verify_backup(record, actor=request.user)
        record.refresh_from_db()
        return _ok("Backup is valid." if valid else "Backup failed verification.", valid=valid, backup=backup_payload(record))


class BackupDownloadView(_PlatformAdminView):
    """The stored file as it is: encrypted. Useful for keeping an off-site copy; it can't be read without the key."""

    def get(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        if record.status != BackupRecord.Status.COMPLETED or not record.storage_key:
            return _fail("This backup has no file to download.", "NO_FILE", status.HTTP_404_NOT_FOUND)
        try:
            stream = get_storage(record.storage_backend).stream(record.storage_key)
            first = next(stream, b"")
        except BackupStorageError as exc:
            return _fail(str(exc), "STORAGE_ERROR", status.HTTP_502_BAD_GATEWAY)

        def body():
            yield first
            yield from stream

        log_action(
            action="backup.backup_downloaded",
            actor=request.user,
            entity_type="BackupRecord",
            entity_id=str(record.id),
            severity=AuditLog.Severity.WARNING,
            metadata={"event": "BACKUP_DOWNLOADED", "backup_id": str(record.id)},
        )
        response = StreamingHttpResponse(body(), content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="nts-backup-{record.created_at:%Y%m%d-%H%M}.ntsbak"'
        response["Cache-Control"] = "no-store"
        return response


class RestorePrepareView(_PlatformAdminView):
    """Step 1 of a restore: validates the backup and returns what to confirm, plus a short-lived token."""

    def post(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        try:
            return _ok(restore=service.prepare_restore(record, request.user))
        except BackupError as exc:
            return _fail(str(exc), "RESTORE_NOT_POSSIBLE")


class RestoreStartView(_PlatformAdminView):
    """Step 2: needs the token from step 1, the typed confirmation phrase AND the administrator's password."""

    def post(self, request, pk):
        record = get_object_or_404(BackupRecord, pk=pk)
        token = str(request.data.get("token", ""))
        confirmation = str(request.data.get("confirmation", ""))
        password = str(request.data.get("password", ""))
        if lockout.is_locked(request.user):
            return _fail("This account is temporarily locked.", "LOCKED", status.HTTP_403_FORBIDDEN)
        if not request.user.check_password(password):
            lockout.register_failure(request.user, ip=client_ip(request))
            return _fail("Your password is incorrect.", "INVALID_PASSWORD")
        try:
            restore = service.begin_restore(record, request.user, token=token, confirmation=confirmation)
        except BackupError as exc:
            return _fail(str(exc), "RESTORE_NOT_POSSIBLE")
        return _ok("Restore started.", status.HTTP_202_ACCEPTED, restore=restore_payload(restore))


class RestoreListView(_PlatformAdminView):
    def get(self, request):
        total, rows, page, page_size = _paginate(request, RestoreRecord.objects.all())
        return _ok(count=total, page=page, page_size=page_size, results=[restore_payload(r) for r in rows])


class RestoreDetailView(_PlatformAdminView):
    def get(self, request, pk):
        return _ok(restore=restore_payload(get_object_or_404(RestoreRecord, pk=pk)))


class BackupSettingsView(_PlatformAdminView):
    def get(self, request):
        return _ok(settings=settings_payload(BackupSettings.get_solo()))

    def put(self, request):
        cfg = BackupSettings.get_solo()
        data = request.data
        try:
            automatic = bool(data.get("automatic_enabled", cfg.automatic_enabled))
            hour = int(data.get("schedule_hour_utc", cfg.schedule_hour_utc))
            days = int(data.get("retention_days", cfg.retention_days))
            keep = int(data.get("min_valid_to_keep", cfg.min_valid_to_keep))
        except (TypeError, ValueError):
            return _fail("Those settings are not valid numbers.", "VALIDATION_ERROR")
        if not 0 <= hour <= 23:
            return _fail("The backup hour must be between 0 and 23 (UTC).", "VALIDATION_ERROR")
        if not 1 <= days <= 365:
            return _fail("Keep backups for between 1 and 365 days.", "VALIDATION_ERROR")
        if not 1 <= keep <= 60:
            return _fail("Always keep between 1 and 60 recent valid backups.", "VALIDATION_ERROR")
        cfg.automatic_enabled, cfg.schedule_hour_utc, cfg.retention_days, cfg.min_valid_to_keep = automatic, hour, days, keep
        cfg.save()
        log_action(
            action="backup.settings_changed",
            actor=request.user,
            entity_type="BackupSettings",
            entity_id="1",
            severity=AuditLog.Severity.WARNING,
            metadata=settings_payload(cfg),
        )
        return _ok("Backup settings saved.", settings=settings_payload(cfg))


class SchedulerTickView(APIView):
    """For an external scheduler (a Render cron job, an uptime pinger): `POST` with the shared secret in
    `X-Backup-Token` and the daily backup runs if it is due. Does nothing otherwise. Disabled unless
    BACKUP_TICK_TOKEN is set."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "backups_tick"

    def post(self, request):
        expected = settings.BACKUP_TICK_TOKEN
        given = request.headers.get("X-Backup-Token", "")
        if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
            return _fail("Not allowed.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        record = service.run_scheduled_backup_if_due(background=True)
        return _ok("Backup started." if record else "Nothing is due.", started=bool(record))
