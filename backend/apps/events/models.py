from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file
from apps.common.audience import AudienceFields
from apps.tenants.models import TenantScopedModel


class Event(AudienceFields, TenantScopedModel, TimeStampedModel):
    """Audience-targeting fields mirror `apps.communications.Announcement` exactly (same
    `TargetType` shape, same same-school validation on save) — reused rather than reinvented,
    since "who does this reach" is the same question for an announcement and an event."""

    class TargetType(models.TextChoices):
        SCHOOL = "school", "Entire School"
        CLASS = "class", "Class"
        SECTION = "section", "Section"
        DEPARTMENT = "department", "Department"
        STAFF = "staff", "All Staff"
        STUDENTS = "students", "All Students"
        PARENTS = "parents", "All Parents"
        SPECIFIC_USERS = "specific_users", "Specific Users"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CANCELLED = "cancelled", "Cancelled"

    class Category(models.TextChoices):
        ACADEMIC = "academic", "Academic"
        SPORTS = "sports", "Sports"
        CULTURAL = "cultural", "Cultural"
        MEETING = "meeting", "Meeting"
        HOLIDAY = "holiday", "Holiday"
        OTHER = "other", "Other"

    title = models.CharField(max_length=200)
    description = models.CharField(max_length=5000, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    location = models.CharField(max_length=255, blank=True)
    # The event's cover image — required on create through the API (see EventSerializer); nullable
    # in the DB so events that predate the field stay valid. Separate from the EventMedia gallery.
    image = models.FileField(upload_to="event_images/", null=True, blank=True, validators=[validate_image_file])
    # Null = unlimited attendance — a school-wide holiday notice has no headcount to cap.
    capacity = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # Registration stops on its own once the event has ended, or earlier at `registration_closes_at` (optional). The
    # creator can also close it by hand (`registration_closed`) and reopen it while the event has not ended.
    registration_closes_at = models.DateTimeField(null=True, blank=True)
    registration_closed = models.BooleanField(default=False)

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

    created_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "events"
        ordering = ["-start_datetime"]

    def __str__(self):
        return self.title

    @property
    def registered_count(self):
        return self.registrations.filter(status=EventRegistration.Status.REGISTERED).count()

    @property
    def registration_state(self) -> str:
        """"open", or why not: "not_published", "ended", "closed" (by hand) or "deadline" (the close time passed)."""
        from django.utils import timezone

        now = timezone.now()
        if self.status != self.Status.PUBLISHED:
            return "not_published"
        if self.end_datetime <= now:
            return "ended"
        if self.registration_closed:
            return "closed"
        if self.registration_closes_at and self.registration_closes_at <= now:
            return "deadline"
        return "open"

    @property
    def registration_open(self) -> bool:
        return self.registration_state == "open"

    def save(self, *args, **kwargs):
        if self.end_datetime < self.start_datetime:
            raise ValueError("Event.end_datetime must be on or after start_datetime")
        for field_name in ("target_class", "target_section", "target_department"):
            related = getattr(self, field_name, None)
            if related is not None and related.school_id != self.school_id:
                raise ValueError(f"Event.{field_name} must belong to the same school")
        super().save(*args, **kwargs)


class EventRecipient(TenantScopedModel):
    """Explicit audience list — only used/populated when target_type=specific_users. Distinct
    from `EventRegistration` below: this is who gets *notified an event exists*, not who has
    actually signed up to attend (the same split `AnnouncementRecipient` makes for Announcement's
    notification-only audience)."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="specific_recipients")
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "event_recipients"
        constraints = [
            models.UniqueConstraint(fields=["event", "user"], name="unique_event_recipient"),
        ]

    def __str__(self):
        return f"{self.event} -> {self.user}"

    def save(self, *args, **kwargs):
        if self.event.school_id != self.school_id:
            raise ValueError("EventRecipient.event must belong to the same school")
        if self.user.school_id != self.school_id:
            raise ValueError("EventRecipient.user must belong to the same school")
        super().save(*args, **kwargs)


class EventRegistration(TenantScopedModel):
    """Who has actually signed up to attend — separate from `EventRecipient`'s notification-only
    audience list above. `registered_at` is set once at creation and never touched again, even if
    `status` later changes (e.g. to `cancelled`) — it records when the RSVP was first made."""

    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        CANCELLED = "cancelled", "Cancelled"
        ATTENDED = "attended", "Attended"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REGISTERED)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "event_registrations"
        ordering = ["registered_at"]
        constraints = [
            models.UniqueConstraint(fields=["event", "user"], name="unique_event_registration"),
        ]

    def __str__(self):
        return f"{self.user} -> {self.event} ({self.status})"

    def save(self, *args, **kwargs):
        if self.event.school_id != self.school_id:
            raise ValueError("EventRegistration.event must belong to the same school")
        if self.user.school_id != self.school_id:
            raise ValueError("EventRegistration.user must belong to the same school")
        super().save(*args, **kwargs)


class EventMedia(TenantScopedModel, TimeStampedModel):
    """A photo or video attached to an event — a small gallery, not a document library. Uses
    the same `validate_image_file`/`validate_video_file` split by `media_type` as
    `LessonMaterial` (validated in the serializer, since one FileField can't switch its own
    validators based on a sibling field)."""

    class MediaType(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Video"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="media")
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    # No model-level `validators=` here on purpose — DRF's ModelSerializer would copy a
    # model-field validator onto the auto-generated serializer field unconditionally, which
    # would wrongly enforce image rules on video uploads too. Validated in the serializer
    # instead, branching on the sibling `media_type` field (same reasoning as LessonMaterial).
    file = models.FileField(upload_to="event_media/")
    caption = models.CharField(max_length=500, blank=True)
    uploaded_by = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "event_media"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event} - {self.media_type}"

    def save(self, *args, **kwargs):
        if self.event.school_id != self.school_id:
            raise ValueError("EventMedia.event must belong to the same school")
        if self.uploaded_by.school_id != self.school_id:
            raise ValueError("EventMedia.uploaded_by must belong to the same school")
        super().save(*args, **kwargs)
