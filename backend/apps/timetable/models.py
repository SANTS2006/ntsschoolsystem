from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Room(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(default=30)

    class Meta:
        db_table = "rooms"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_room_name_per_school"),
        ]

    def __str__(self):
        return self.name


class Period(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=50)  # "Period 1", "Lunch Break"
    start_time = models.TimeField()
    end_time = models.TimeField()
    order = models.PositiveIntegerField(default=0)
    is_break = models.BooleanField(default=False)

    class Meta:
        db_table = "periods"
        ordering = ["order", "start_time"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_period_name_per_school"),
            models.UniqueConstraint(fields=["school", "order"], name="unique_period_order_per_school"),
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")), name="period_end_after_start"
            ),
        ]

    def __str__(self):
        return self.name


class TimetableEntry(TenantScopedModel, TimeStampedModel):
    class Day(models.TextChoices):
        MONDAY = "monday", "Monday"
        TUESDAY = "tuesday", "Tuesday"
        WEDNESDAY = "wednesday", "Wednesday"
        THURSDAY = "thursday", "Thursday"
        FRIDAY = "friday", "Friday"
        SATURDAY = "saturday", "Saturday"
        SUNDAY = "sunday", "Sunday"

    section = models.ForeignKey(
        "academics.Section", on_delete=models.CASCADE, related_name="timetable_entries"
    )
    day_of_week = models.CharField(max_length=10, choices=Day.choices)
    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name="timetable_entries")
    subject = models.ForeignKey(
        "academics.Subject", null=True, blank=True, on_delete=models.SET_NULL, related_name="timetable_entries"
    )
    teacher = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="timetable_entries"
    )
    room = models.ForeignKey(
        Room, null=True, blank=True, on_delete=models.SET_NULL, related_name="timetable_entries"
    )

    class Meta:
        db_table = "timetable_entries"
        ordering = ["day_of_week", "period__order"]
        constraints = [
            # A section can only have one lesson per day/period — class double-booking,
            # enforced at the DB level, not just application logic.
            models.UniqueConstraint(
                fields=["section", "day_of_week", "period"], name="unique_section_day_period"
            ),
            # Teacher/room double-booking — partial (nullable FKs can repeat as NULL).
            models.UniqueConstraint(
                fields=["teacher", "day_of_week", "period"],
                condition=models.Q(teacher__isnull=False),
                name="unique_teacher_day_period",
            ),
            models.UniqueConstraint(
                fields=["room", "day_of_week", "period"],
                condition=models.Q(room__isnull=False),
                name="unique_room_day_period",
            ),
        ]

    def __str__(self):
        return f"{self.section} - {self.day_of_week} - {self.period}"

    def save(self, *args, **kwargs):
        if self.section.school_id != self.school_id:
            raise ValueError("TimetableEntry.school must match section.school")
        if self.period.school_id != self.school_id:
            raise ValueError("TimetableEntry.school must match period.school")
        if self.subject_id and self.subject.school_id != self.school_id:
            raise ValueError("TimetableEntry.subject must belong to the same school")
        if self.teacher_id and self.teacher.school_id != self.school_id:
            raise ValueError("TimetableEntry.teacher must belong to the same school")
        if self.room_id and self.room.school_id != self.school_id:
            raise ValueError("TimetableEntry.room must belong to the same school")
        super().save(*args, **kwargs)
