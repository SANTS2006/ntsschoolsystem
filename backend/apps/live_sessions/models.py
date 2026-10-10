from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class LiveSession(TenantScopedModel, TimeStampedModel):
    """A scheduled or in-progress video call for a live online lesson, backed by a Daily.co
    room. `daily_room_name`/`daily_room_url` stay blank until `start` actually creates the room
    (see `apps.live_sessions.views.LiveSessionViewSet.start`) — scheduling a session doesn't
    reserve a room ahead of time, since Daily.co rooms expire and there's no reason to create one
    before the call is actually starting.

    `target_type` mirrors `Lesson.TargetType`'s `specific_students` split, chosen independently
    per session (not inherited from a linked `lesson`, even when one is set) — the recipient
    list lives in `LiveSessionRecipient`, not here."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"
        CANCELLED = "cancelled", "Cancelled"

    class TargetType(models.TextChoices):
        CLASS_SECTION = "class_section", "Class / Section"
        SPECIFIC_STUDENTS = "specific_students", "Specific Students"

    title = models.CharField(max_length=200)
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="live_sessions")
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="live_sessions")
    section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.CASCADE, related_name="live_sessions"
    )
    lesson = models.ForeignKey(
        "education.Lesson", null=True, blank=True, on_delete=models.SET_NULL, related_name="live_sessions"
    )
    teacher = models.ForeignKey("staff.Staff", on_delete=models.CASCADE, related_name="live_sessions")
    scheduled_start = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    target_type = models.CharField(max_length=20, choices=TargetType.choices, default=TargetType.CLASS_SECTION)
    daily_room_name = models.CharField(max_length=255, blank=True)
    daily_room_url = models.URLField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "live_sessions"
        ordering = ["-scheduled_start"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.subject.school_id != self.school_id:
            raise ValueError("LiveSession.subject must belong to the same school")
        if self.school_class.school_id != self.school_id:
            raise ValueError("LiveSession.school_class must belong to the same school")
        if self.section_id:
            if self.section.school_id != self.school_id:
                raise ValueError("LiveSession.section must belong to the same school")
            if self.section.school_class_id != self.school_class_id:
                raise ValueError("LiveSession.section must belong to LiveSession.school_class")
        if self.lesson_id and self.lesson.school_id != self.school_id:
            raise ValueError("LiveSession.lesson must belong to the same school")
        if self.teacher.school_id != self.school_id:
            raise ValueError("LiveSession.teacher must belong to the same school")
        super().save(*args, **kwargs)


class LiveSessionRecipient(TenantScopedModel):
    """Explicit student audience list — only used/populated when `target_type=specific_students`.
    Mirrors `education.LessonEnrollment` exactly (same reasoning: a live session's audience is
    always specifically students)."""

    session = models.ForeignKey(LiveSession, on_delete=models.CASCADE, related_name="recipients")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "live_session_recipients"
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="unique_live_session_recipient"),
        ]

    def __str__(self):
        return f"{self.session} -> {self.student}"

    def save(self, *args, **kwargs):
        if self.session.school_id != self.school_id:
            raise ValueError("LiveSessionRecipient.session must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("LiveSessionRecipient.student must belong to the same school")
        super().save(*args, **kwargs)
