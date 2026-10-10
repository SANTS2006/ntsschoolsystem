from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file
from apps.tenants.models import TenantScopedModel


class Student(TenantScopedModel, TimeStampedModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        APPLICANT = "applicant", "Applicant"
        ADMITTED = "admitted", "Admitted"
        ACTIVE = "active", "Active"
        TRANSFERRED = "transferred", "Transferred"
        GRADUATED = "graduated", "Graduated"
        WITHDRAWN = "withdrawn", "Withdrawn"
        ARCHIVED = "archived", "Archived"

    # Nullable: most students don't get a portal login immediately (or ever) — this is an
    # optional future link, never a requirement for the student record to exist.
    user = models.OneToOneField(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="student_profile"
    )

    admission_number = models.CharField(max_length=50)
    first_name = models.CharField(max_length=150)
    middle_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    photo = models.FileField(upload_to="student_photos/", null=True, blank=True, validators=[validate_image_file])
    address = models.CharField(max_length=500, blank=True)
    previous_school = models.CharField(max_length=255, blank=True)

    admission_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ADMITTED)

    current_academic_year = models.ForeignKey(
        "academics.AcademicYear", null=True, blank=True, on_delete=models.SET_NULL, related_name="students"
    )
    current_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.SET_NULL, related_name="students"
    )
    current_section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.SET_NULL, related_name="students"
    )

    class Meta:
        db_table = "students"
        ordering = ["last_name", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "admission_number"], name="unique_admission_number_per_school"
            ),
        ]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return " ".join(part for part in (self.first_name, self.middle_name, self.last_name) if part).strip()

    def save(self, *args, **kwargs):
        for field_name in ("current_academic_year", "current_class", "current_section"):
            related = getattr(self, field_name, None)
            if related is not None and related.school_id != self.school_id:
                raise ValueError(f"Student.{field_name} must belong to the same school")
        if self.user_id and self.user.school_id != self.school_id:
            raise ValueError("Student.user must belong to the same school")
        super().save(*args, **kwargs)
