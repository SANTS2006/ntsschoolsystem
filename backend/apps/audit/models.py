from django.db import models

from apps.common.models import UUIDModel


class AuditLog(UUIDModel):
    """
    Append-only. Never stores passwords, tokens, API keys, reset links, or
    other secrets — only business-relevant before/after field values.
    """

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    # Nullable: platform-level actions (e.g. creating a school) have no school.
    school = models.ForeignKey(
        "tenants.School", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    # Nullable + denormalized email: the actor account may later be deleted/disabled.
    actor = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    actor_email = models.EmailField(blank=True)

    action = models.CharField(max_length=100, db_index=True)
    entity_type = models.CharField(max_length=100, blank=True, db_index=True)
    entity_id = models.CharField(max_length=64, blank=True, db_index=True)

    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.INFO)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["school", "created_at"]),
            models.Index(fields=["entity_type", "entity_id"]),
        ]

    def __str__(self):
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M:%S}"

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("Audit logs are append-only and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit logs cannot be deleted through the ORM.")
