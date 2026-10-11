from django.db import models

from apps.common.models import TimeStampedModel, UUIDModel
from apps.tenants.models import TenantScopedModel


class Notification(TenantScopedModel, TimeStampedModel):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"

    recipient = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="notifications")
    category = models.CharField(max_length=50)  # "announcement", "assignment", "fee_reminder", ...
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    title = models.CharField(max_length=200)
    # Unbounded: the details page shows the full text (an announcement's whole body), not a teaser.
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read"]),
        ]

    def __str__(self):
        return f"{self.recipient} - {self.title}"

    def save(self, *args, **kwargs):
        if self.recipient.school_id != self.school_id:
            raise ValueError("Notification.recipient must belong to the same school")
        super().save(*args, **kwargs)


class PushSubscription(UUIDModel, TimeStampedModel):
    """One browser/device that agreed to receive push alerts for a user. Not tenant-scoped on purpose: it belongs to a
    person, and `endpoint` (the browser vendor's address for that device) is unique, so a shared computer that signs in as
    someone else is re-pointed at the new person rather than alerting the old one."""

    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "notification_push_subscriptions"

    def __str__(self):
        return f"Push subscription for {self.user_id}"
