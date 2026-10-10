from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file
from apps.tenants.models import TenantScopedModel


class Complaint(TenantScopedModel, TimeStampedModel):
    """No student/parent role exists in this system's default RBAC catalog (confirmed during
    Events, Phase G) — self-service visibility here is deliberately *not* gated by a permission
    code at all (any authenticated user can submit/see their own), mirroring how
    `apps.assignments.MyAssignmentsView` handles student self-service by keying off the request's
    identity directly rather than a role grant. See `ComplaintViewSet.get_queryset` for the
    submitter-sees-own / staff-sees-all split this enables."""

    class Category(models.TextChoices):
        ACADEMIC = "academic", "Academic"
        FACILITY = "facility", "Facility"
        BEHAVIORAL = "behavioral", "Behavioral"
        ADMINISTRATIVE = "administrative", "Administrative"
        OTHER = "other", "Other"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        RESOLVED = "resolved", "Resolved"
        REJECTED = "rejected", "Rejected"

    submitted_by = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    subject = models.CharField(max_length=200)
    description = models.CharField(max_length=5000)
    # Optional supporting photo (e.g. the damaged desks being reported).
    image = models.FileField(upload_to="complaint_images/", null=True, blank=True, validators=[validate_image_file])
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    # Soft anonymity: the real submitter is always stored (accountability, spam prevention), but
    # the serializer masks `submitted_by`/`submitted_by_name` for anyone except the submitter
    # themselves and staff who can already see everything — see ComplaintSerializer.
    is_anonymous = models.BooleanField(default=False)
    assigned_to = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Optional: the submitter can address a complaint to a specific staff member instead of
    # leaving it unassigned for any complaints.manage holder to pick up. Orthogonal to
    # is_anonymous — a submitter can stay anonymous to the addressee too, same masking as
    # everyone else (see ComplaintSerializer._identity_hidden).
    addressed_to = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolution_notes = models.CharField(max_length=2000, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "complaints"
        ordering = ["-created_at"]

    def __str__(self):
        return self.subject

    def save(self, *args, **kwargs):
        if self.submitted_by_id and self.submitted_by.school_id != self.school_id:
            raise ValueError("Complaint.submitted_by must belong to the same school")
        if self.assigned_to_id and self.assigned_to.school_id != self.school_id:
            raise ValueError("Complaint.assigned_to must belong to the same school")
        if self.addressed_to_id and self.addressed_to.school_id != self.school_id:
            raise ValueError("Complaint.addressed_to must belong to the same school")
        super().save(*args, **kwargs)


class ComplaintResponse(TenantScopedModel):
    """A reply thread between the submitter and staff — both sides can post here (see
    `ComplaintResponseViewSet`'s object-level check), unlike `Complaint` itself which only staff
    can transition (assign/resolve/reject)."""

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="responses")
    author = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    message = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "complaint_responses"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.author_id} -> {self.complaint_id}"

    def save(self, *args, **kwargs):
        if self.complaint.school_id != self.school_id:
            raise ValueError("ComplaintResponse.complaint must belong to the same school")
        if self.author.school_id != self.school_id:
            raise ValueError("ComplaintResponse.author must belong to the same school")
        super().save(*args, **kwargs)
