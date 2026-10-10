from django.conf import settings
from django.db import models


class MaintenanceNotice(models.Model):
    """The platform-wide "system under maintenance" switch. A single row (pk=1).

    While `enabled`, the web app shows `message` as a banner — on every page, or only on the listed ones
    (`pages` holds path prefixes such as "/finance" or "/login"). Turning it on can also email everyone."""

    enabled = models.BooleanField(default=False)
    message = models.TextField(blank=True)
    all_pages = models.BooleanField(default=True)
    pages = models.JSONField(default=list, blank=True)
    enabled_at = models.DateTimeField(null=True, blank=True)
    emailed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "platform_maintenance_notice"

    @classmethod
    def get_solo(cls) -> "MaintenanceNotice":
        notice, _ = cls.objects.get_or_create(pk=1)
        return notice

    def __str__(self):
        return "Maintenance: on" if self.enabled else "Maintenance: off"
