from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Meeting(TenantScopedModel, TimeStampedModel):
    """A school-wide live video meeting called by the principal/administration — distinct from
    `live_sessions.LiveSession`, which is a subject lesson tied to a class, subject and teacher.
    The audience is any mix of staff, parents and students: each group is either everyone in it
    (`include_all_*`) and/or hand-picked individuals (`MeetingInvitee` rows added from the explicit
    selections). Every resolved invitee — including the ones who came from an "all" flag — is
    materialised as a `MeetingInvitee` at creation, so who was invited (and whether their email
    went out) is a permanent record rather than something recomputed from today's roster.

    The Daily.co room is created together with the meeting, not at start: invitees — parents
    especially, who mostly have no portal login — are emailed a direct join link, so it has to
    exist before the emails go out."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"
        CANCELLED = "cancelled", "Cancelled"

    title = models.CharField(max_length=200)
    agenda = models.TextField(blank=True)
    scheduled_start = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60)
    host = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    include_all_staff = models.BooleanField(default=False)
    include_all_parents = models.BooleanField(default=False)
    include_all_students = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    daily_room_name = models.CharField(max_length=255, blank=True)
    daily_room_url = models.URLField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "meetings"
        ordering = ["-scheduled_start"]

    def __str__(self):
        return self.title


class MeetingInvitee(TenantScopedModel):
    """One person invited to a meeting. Exactly one of staff/guardian/student is set (that's the
    `kind`); `name`/`email` are snapshots so the record survives the person being edited or
    deleted. `user` is the portal account when they have one (used for in-app notifications and
    the "My meetings" list). People are de-duplicated by email at creation — a parent who is also
    a staff member gets one invitation, not two."""

    class Kind(models.TextChoices):
        STAFF = "staff", "Staff"
        PARENT = "parent", "Parent"
        STUDENT = "student", "Student"

    class EmailStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        NO_EMAIL = "no_email", "No email address"

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="invitees")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    staff = models.ForeignKey("staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    guardian = models.ForeignKey("parents.Guardian", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    user = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="meeting_invitations")
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    email_status = models.CharField(max_length=10, choices=EmailStatus.choices, default=EmailStatus.PENDING)
    emailed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "meeting_invitees"
        ordering = ["kind", "name"]
        indexes = [models.Index(fields=["meeting", "email_status"])]

    def __str__(self):
        return f"{self.meeting} -> {self.name}"
