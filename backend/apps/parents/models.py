from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file
from apps.tenants.models import TenantScopedModel


class Guardian(TenantScopedModel, TimeStampedModel):
    # Nullable: a guardian may never need portal access at all.
    user = models.OneToOneField(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="guardian_profile"
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=500, blank=True)
    occupation = models.CharField(max_length=150, blank=True)
    # Not always available via `user.photo` — many guardians have no portal account at all.
    photo = models.FileField(upload_to="guardian_photos/", null=True, blank=True, validators=[validate_image_file])

    students = models.ManyToManyField(
        "students.Student", through="StudentGuardian", related_name="guardians"
    )

    class Meta:
        db_table = "guardians"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        if self.user_id and self.user.school_id != self.school_id:
            raise ValueError("Guardian.user must belong to the same school")
        super().save(*args, **kwargs)


class StudentGuardian(TenantScopedModel):
    class Relationship(models.TextChoices):
        MOTHER = "mother", "Mother"
        FATHER = "father", "Father"
        GUARDIAN = "guardian", "Guardian"
        OTHER = "other", "Other"

    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="guardian_relationships"
    )
    guardian = models.ForeignKey(Guardian, on_delete=models.CASCADE, related_name="student_relationships")
    relationship = models.CharField(max_length=20, choices=Relationship.choices, default=Relationship.GUARDIAN)
    is_primary = models.BooleanField(default=False)
    is_emergency_contact = models.BooleanField(default=False)

    class Meta:
        db_table = "student_guardians"
        constraints = [
            models.UniqueConstraint(fields=["student", "guardian"], name="unique_student_guardian_pair"),
        ]

    def __str__(self):
        return f"{self.guardian_id} -> {self.student_id}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id or self.guardian.school_id != self.school_id:
            raise ValueError("StudentGuardian.school must match both student.school and guardian.school")
        super().save(*args, **kwargs)
