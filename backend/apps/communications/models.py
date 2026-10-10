from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file
from apps.common.audience import AudienceFields
from apps.tenants.models import TenantScopedModel


class Announcement(AudienceFields, TenantScopedModel, TimeStampedModel):
    class TargetType(models.TextChoices):
        SCHOOL = "school", "Entire School"
        CLASS = "class", "Class"
        SECTION = "section", "Section"
        DEPARTMENT = "department", "Department"
        STAFF = "staff", "All Staff"
        STUDENTS = "students", "All Students"
        PARENTS = "parents", "All Parents"
        SPECIFIC_USERS = "specific_users", "Specific Users"

    title = models.CharField(max_length=200)
    body = models.CharField(max_length=5000)
    # Required when an announcement is created through the API (see AnnouncementSerializer), but
    # nullable at the DB level so announcements that predate this field stay valid.
    image = models.FileField(
        upload_to="announcement_images/", null=True, blank=True, validators=[validate_image_file]
    )
    target_type = models.CharField(max_length=20, choices=TargetType.choices, default=TargetType.SCHOOL)
    target_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    target_section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    target_department = models.ForeignKey(
        "academics.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    send_email = models.BooleanField(default=False)
    # Who created it — the only person who may edit, delete or publish it (see
    # AnnouncementViewSet). `published_by` records who actually pressed Publish.
    created_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "announcements"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        for field_name in ("target_class", "target_section", "target_department"):
            related = getattr(self, field_name, None)
            if related is not None and related.school_id != self.school_id:
                raise ValueError(f"Announcement.{field_name} must belong to the same school")
        super().save(*args, **kwargs)


class AnnouncementRecipient(TenantScopedModel):
    """Explicit recipient list — only used/populated when target_type=specific_users."""

    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name="specific_recipients")
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "announcement_recipients"
        constraints = [
            models.UniqueConstraint(fields=["announcement", "user"], name="unique_announcement_recipient"),
        ]

    def __str__(self):
        return f"{self.announcement} -> {self.user}"

    def save(self, *args, **kwargs):
        if self.announcement.school_id != self.school_id:
            raise ValueError("AnnouncementRecipient.announcement must belong to the same school")
        if self.user.school_id != self.school_id:
            raise ValueError("AnnouncementRecipient.user must belong to the same school")
        super().save(*args, **kwargs)
