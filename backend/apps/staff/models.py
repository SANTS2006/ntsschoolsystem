from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Staff(TenantScopedModel, TimeStampedModel):
    class EmploymentStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        ON_LEAVE = "on_leave", "On Leave"
        TERMINATED = "terminated", "Terminated"

    user = models.OneToOneField("users.User", on_delete=models.CASCADE, related_name="staff_profile")
    staff_id = models.CharField(max_length=50, blank=True)
    department = models.ForeignKey(
        "academics.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="staff_members"
    )
    job_title = models.CharField(max_length=100, blank=True)
    qualification = models.CharField(max_length=255, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    employment_status = models.CharField(
        max_length=20, choices=EmploymentStatus.choices, default=EmploymentStatus.ACTIVE
    )
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)

    class Meta:
        db_table = "staff"
        ordering = ["user__first_name", "user__last_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "staff_id"],
                condition=~models.Q(staff_id=""),
                name="unique_staff_id_per_school",
            ),
        ]

    def __str__(self):
        return self.user.full_name

    @property
    def photo(self):
        """Staff has no photo field of its own — it always delegates to the linked account's,
        so every consumer (serializers, admin, management commands) reads `staff.photo` the same
        way regardless of which model actually stores it."""
        return self.user.photo

    def save(self, *args, **kwargs):
        if self.user.school_id != self.school_id:
            raise ValueError("Staff.school must match user.school")
        if self.department_id and self.department.school_id != self.school_id:
            raise ValueError("Staff.department must belong to the same school")
        super().save(*args, **kwargs)
