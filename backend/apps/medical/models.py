from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class MedicalProfile(TenantScopedModel, TimeStampedModel):
    class BloodGroup(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"
        UNKNOWN = "unknown", "Unknown"

    student = models.OneToOneField(
        "students.Student", on_delete=models.CASCADE, related_name="medical_profile"
    )
    blood_group = models.CharField(max_length=10, choices=BloodGroup.choices, default=BloodGroup.UNKNOWN)
    allergies = models.CharField(max_length=500, blank=True)
    chronic_conditions = models.CharField(max_length=500, blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    notes = models.CharField(max_length=1000, blank=True)

    class Meta:
        db_table = "medical_profiles"

    def __str__(self):
        return f"Medical profile - {self.student}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("MedicalProfile.student must belong to the same school")
        super().save(*args, **kwargs)


class MedicalVisit(TenantScopedModel, TimeStampedModel):
    class VisitType(models.TextChoices):
        ROUTINE = "routine", "Routine"
        INCIDENT = "incident", "Incident"
        EMERGENCY = "emergency", "Emergency"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="medical_visits")
    attended_by = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="medical_visits_attended"
    )
    visit_type = models.CharField(max_length=20, choices=VisitType.choices, default=VisitType.ROUTINE)
    visited_at = models.DateTimeField()
    symptoms = models.CharField(max_length=500, blank=True)
    treatment = models.CharField(max_length=500, blank=True)
    notes = models.CharField(max_length=1000, blank=True)
    parent_notified = models.BooleanField(default=False)

    class Meta:
        db_table = "medical_visits"
        ordering = ["-visited_at"]

    def __str__(self):
        return f"{self.student} - {self.visited_at}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("MedicalVisit.student must belong to the same school")
        if self.attended_by_id and self.attended_by.school_id != self.school_id:
            raise ValueError("MedicalVisit.attended_by must belong to the same school")
        super().save(*args, **kwargs)
