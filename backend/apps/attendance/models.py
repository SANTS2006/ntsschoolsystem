from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class AttendanceStatus(models.TextChoices):
    PRESENT = "present", "Present"
    ABSENT = "absent", "Absent"
    LATE = "late", "Late"
    EXCUSED = "excused", "Excused"
    EARLY_DEPARTURE = "early_departure", "Early Departure"


class StudentAttendance(TenantScopedModel, TimeStampedModel):
    """
    `period=None` means daily/homeroom attendance; a set `period` means
    subject-level attendance for that specific lesson. Both are prevented
    from duplicating via partial unique constraints below, rather than
    relying on application logic alone.
    """

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    status = models.CharField(max_length=20, choices=AttendanceStatus.choices)
    section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    subject = models.ForeignKey(
        "academics.Subject", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    period = models.ForeignKey(
        "timetable.Period", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    notes = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "student_attendance"
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "date"],
                condition=models.Q(period__isnull=True),
                name="unique_daily_attendance_per_student",
            ),
            models.UniqueConstraint(
                fields=["student", "date", "period"],
                condition=models.Q(period__isnull=False),
                name="unique_subject_attendance_per_student_period",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.date} - {self.status}"

    def save(self, *args, **kwargs):
        for field_name in ("student", "section", "subject", "period"):
            related = getattr(self, field_name, None)
            if related is not None and related.school_id != self.school_id:
                raise ValueError(f"StudentAttendance.{field_name} must belong to the same school")
        super().save(*args, **kwargs)


class StaffAttendance(TenantScopedModel, TimeStampedModel):
    staff = models.ForeignKey("staff.Staff", on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    status = models.CharField(max_length=20, choices=AttendanceStatus.choices)
    check_in_time = models.TimeField(null=True, blank=True)
    check_out_time = models.TimeField(null=True, blank=True)
    notes = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "staff_attendance"
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["staff", "date"], name="unique_staff_attendance_per_day"),
        ]

    def __str__(self):
        return f"{self.staff} - {self.date} - {self.status}"

    def save(self, *args, **kwargs):
        if self.staff.school_id != self.school_id:
            raise ValueError("StaffAttendance.staff must belong to the same school")
        super().save(*args, **kwargs)
