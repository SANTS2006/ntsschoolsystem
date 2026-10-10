from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class DisciplineIncident(TenantScopedModel, TimeStampedModel):
    class Category(models.TextChoices):
        BULLYING = "bullying", "Bullying"
        VANDALISM = "vandalism", "Vandalism"
        TARDINESS = "tardiness", "Tardiness"
        ACADEMIC_DISHONESTY = "academic_dishonesty", "Academic Dishonesty"
        FIGHTING = "fighting", "Fighting"
        OTHER = "other", "Other"

    class Severity(models.TextChoices):
        MINOR = "minor", "Minor"
        MODERATE = "moderate", "Moderate"
        SEVERE = "severe", "Severe"

    class ActionTaken(models.TextChoices):
        NONE = "none", "None"
        WARNING = "warning", "Warning"
        DETENTION = "detention", "Detention"
        SUSPENSION = "suspension", "Suspension"
        EXPULSION = "expulsion", "Expulsion"

    class Status(models.TextChoices):
        REPORTED = "reported", "Reported"
        UNDER_REVIEW = "under_review", "Under Review"
        RESOLVED = "resolved", "Resolved"

    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="discipline_incidents"
    )
    category = models.CharField(max_length=30, choices=Category.choices, default=Category.OTHER)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MINOR)
    incident_date = models.DateTimeField()
    description = models.CharField(max_length=1000)
    reported_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    action_taken = models.CharField(max_length=20, choices=ActionTaken.choices, default=ActionTaken.NONE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REPORTED)
    parent_notified = models.BooleanField(default=False)
    follow_up_notes = models.CharField(max_length=1000, blank=True)

    class Meta:
        db_table = "discipline_incidents"
        ordering = ["-incident_date"]

    def __str__(self):
        return f"{self.student} - {self.category} - {self.incident_date:%Y-%m-%d}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("DisciplineIncident.student must belong to the same school")
        if self.reported_by_id and self.reported_by.school_id != self.school_id:
            raise ValueError("DisciplineIncident.reported_by must belong to the same school")
        super().save(*args, **kwargs)
