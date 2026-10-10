"""Backup & recovery bookkeeping.

These tables are deliberately *outside* the data that is backed up and restored: they have no foreign keys to
anything else (people are recorded by plain id + email), and `apps.backups.service.EXCLUDED` keeps them out of
every dump and every restore. A restore therefore can never erase the history of backups and restores — including
the restore that is running right now."""

import uuid

from django.db import models


class BackupSettings(models.Model):
    """The single row of backup policy. Also the row that is locked while a backup is being started, so two
    instances (or two admins) can never start overlapping backups."""

    automatic_enabled = models.BooleanField(default=True)
    # Time of day (UTC) from which the daily backup is due.
    schedule_hour_utc = models.PositiveSmallIntegerField(default=2)
    # Backups older than this are pruned...
    retention_days = models.PositiveIntegerField(default=14)
    # ...but at least this many of the newest *valid* backups are always kept, whatever their age.
    min_valid_to_keep = models.PositiveIntegerField(default=3)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "backup_settings"

    @classmethod
    def get_solo(cls) -> "BackupSettings":
        row, _ = cls.objects.get_or_create(pk=1)
        return row


class BackupRecord(models.Model):
    class Kind(models.TextChoices):
        AUTOMATIC = "automatic", "Automatic"
        MANUAL = "manual", "Manual"
        PRE_RESTORE = "pre_restore", "Safety backup before a restore"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class Verification(models.TextChoices):
        UNVERIFIED = "unverified", "Not verified"
        VALID = "valid", "Valid"
        INVALID = "invalid", "Invalid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    verification = models.CharField(max_length=20, choices=Verification.choices, default=Verification.UNVERIFIED)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    # Who asked for it (null for the scheduler). A plain id + email, not a foreign key — see the module docstring.
    created_by_id = models.UUIDField(null=True, blank=True)
    created_by_email = models.EmailField(blank=True)

    size_bytes = models.BigIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True)
    encrypted = models.BooleanField(default=True)
    storage_backend = models.CharField(max_length=20, blank=True)
    storage_key = models.CharField(max_length=255, blank=True)
    # {"app.model": row count} when the dump was taken, and the migration each app was at. Restore refuses a backup
    # whose schema differs from the running one.
    record_counts = models.JSONField(default=dict, blank=True)
    schema_state = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    # Set while a restore is using this backup, so retention can never delete it from under the restore.
    in_use_by_restore = models.BooleanField(default=False)

    class Meta:
        db_table = "backup_records"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["kind", "created_at"]),
        ]

    def __str__(self):
        return f"{self.kind} backup {self.created_at:%Y-%m-%d %H:%M} ({self.status})"

    @property
    def is_restorable(self) -> bool:
        return self.status == self.Status.COMPLETED and self.verification == self.Verification.VALID


class RestoreRecord(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PREPARING = "preparing", "Preparing"
        BACKING_UP = "backing_up_current_database", "Backing up the current database"
        RESTORING = "restoring", "Restoring"
        VERIFYING = "verifying", "Verifying"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    backup_id = models.UUIDField()
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    started_by_id = models.UUIDField(null=True, blank=True)
    started_by_email = models.EmailField(blank=True)
    safety_backup_id = models.UUIDField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    # What the restore is doing right now, in plain words, for the progress screen.
    step_message = models.CharField(max_length=255, blank=True)
    request_id = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "restore_records"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"Restore of {self.backup_id} ({self.status})"

    @property
    def is_finished(self) -> bool:
        return self.status in (self.Status.COMPLETED, self.Status.FAILED)
