from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_upload_file
from apps.tenants.models import TenantScopedModel


class Application(TenantScopedModel, TimeStampedModel):
    class Kind(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        SHORTLISTED = "shortlisted", "Shortlisted"
        INTERVIEW_SCHEDULED = "interview_scheduled", "Interview scheduled"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)

    first_name = models.CharField(max_length=150)
    middle_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    address = models.CharField(max_length=500, blank=True)

    # Student-specific — a public applicant picks from that school's own SchoolClass list
    # (see PublicApplicationSubmitSerializer, which resolves/validates this against the
    # explicitly-passed School rather than any ambient tenant context).
    applying_for_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    previous_school = models.CharField(max_length=255, blank=True)
    guardian_name = models.CharField(max_length=255, blank=True)
    guardian_phone = models.CharField(max_length=30, blank=True)
    guardian_email = models.EmailField(blank=True)

    # Staff-specific
    applying_for_role = models.ForeignKey(
        "authorization.Role", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    job_title = models.CharField(max_length=100, blank=True)
    qualification = models.CharField(max_length=255, blank=True)
    years_of_experience = models.PositiveIntegerField(null=True, blank=True)

    # Answers to the school's own extra questions: {question_key: {"label": ..., "value": ...}} — the
    # label is stored with the answer so it still reads correctly if the question is later edited.
    custom_answers = models.JSONField(default=dict, blank=True)

    # Interview — set together by the "invite to interview" bulk action.
    interview_datetime = models.DateTimeField(null=True, blank=True)
    interview_location = models.CharField(max_length=500, blank=True)
    interview_notes = models.TextField(blank=True)

    # Outcome — set by the accept/reject actions; created_student/created_staff link back to
    # whatever record acceptance produced, so "where did this Student/Staff come from" is
    # traceable without guessing from names/dates.
    reviewed_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_student = models.OneToOneField(
        "students.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="application"
    )
    created_staff = models.OneToOneField(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="application"
    )

    class Meta:
        db_table = "admission_applications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} ({self.kind})"

    @property
    def full_name(self):
        return " ".join(part for part in (self.first_name, self.middle_name, self.last_name) if part).strip()

    def save(self, *args, **kwargs):
        for field_name in (
            "applying_for_class", "applying_for_role", "reviewed_by", "created_student", "created_staff",
        ):
            related = getattr(self, field_name, None)
            if related is not None and related.school_id != self.school_id:
                raise ValueError(f"Application.{field_name} must belong to the same school")
        super().save(*args, **kwargs)


class ApplicationDocument(TenantScopedModel, TimeStampedModel):
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(max_length=200, blank=True)
    # Set when the file answers one of the school's own "file upload" questions (see form_config);
    # blank for the general "supporting documents" upload.
    question_key = models.CharField(max_length=20, blank=True)
    file = models.FileField(upload_to="admission_documents/", validators=[validate_upload_file])

    class Meta:
        db_table = "admission_application_documents"
        ordering = ["created_at"]

    def __str__(self):
        return self.title or self.file.name

    def save(self, *args, **kwargs):
        if self.application.school_id != self.school_id:
            raise ValueError("ApplicationDocument.school must match application.school")
        super().save(*args, **kwargs)


class ApplicationFormConfig(TenantScopedModel, TimeStampedModel):
    """One school's choices for the public application form for one kind of applicant. `fields` holds
    only what the school changed from the defaults ({field_key: {"enabled": bool, "required": bool}});
    `custom_fields` are its own extra questions. See form_config.py for how these combine."""

    kind = models.CharField(max_length=10, choices=Application.Kind.choices)
    fields = models.JSONField(default=dict, blank=True)
    custom_fields = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "admission_form_configs"
        constraints = [
            models.UniqueConstraint(fields=["school", "kind"], name="unique_application_form_config_per_kind"),
        ]

    def __str__(self):
        return f"{self.school_id} / {self.kind}"
