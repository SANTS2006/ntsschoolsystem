from django.db import models

from apps.common.models import TimeStampedModel
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
