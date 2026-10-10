from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_upload_file
from apps.tenants.models import TenantScopedModel


class DocumentCategory(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "document_categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_document_category_name_per_school"),
        ]

    def __str__(self):
        return self.name


class Document(TenantScopedModel, TimeStampedModel):
    class OwnerType(models.TextChoices):
        SCHOOL = "school", "School-wide"
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    title = models.CharField(max_length=200)
    description = models.CharField(max_length=1000, blank=True)
    category = models.ForeignKey(
        DocumentCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="documents"
    )
    owner_type = models.CharField(max_length=10, choices=OwnerType.choices, default=OwnerType.SCHOOL)
    student = models.ForeignKey(
        "students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="documents"
    )
    staff = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.CASCADE, related_name="documents"
    )
    file = models.FileField(upload_to="documents/", validators=[validate_upload_file])
    uploaded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Governs self-service visibility of an owner_type=school document: a public policy vs.
    # something a school wants visible to admins only (e.g. an internal circular). Personal
    # (student/staff) documents are always private to their owner + the permission-gated staff
    # views regardless of this flag — it only matters for the school-wide case.
    is_confidential = models.BooleanField(default=False)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "documents"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(owner_type="school", student__isnull=True, staff__isnull=True)
                    | models.Q(owner_type="student", student__isnull=False, staff__isnull=True)
                    | models.Q(owner_type="staff", student__isnull=True, staff__isnull=False)
                ),
                name="document_owner_type_matches_fk",
            ),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.category_id and self.category.school_id != self.school_id:
            raise ValueError("Document.category must belong to the same school")
        if self.student_id and self.student.school_id != self.school_id:
            raise ValueError("Document.student must belong to the same school")
        if self.staff_id and self.staff.school_id != self.school_id:
            raise ValueError("Document.staff must belong to the same school")
        if self.uploaded_by_id and self.uploaded_by.school_id != self.school_id:
            raise ValueError("Document.uploaded_by must belong to the same school")
        super().save(*args, **kwargs)
