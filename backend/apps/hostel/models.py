from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Hostel(TenantScopedModel, TimeStampedModel):
    class GenderRestriction(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        MIXED = "mixed", "Mixed"

    name = models.CharField(max_length=150)
    gender_restriction = models.CharField(
        max_length=10, choices=GenderRestriction.choices, default=GenderRestriction.MIXED
    )
    warden = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="wardened_hostels"
    )

    class Meta:
        db_table = "hostels"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_hostel_name_per_school"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.warden_id and self.warden.school_id != self.school_id:
            raise ValueError("Hostel.warden must belong to the same school")
        super().save(*args, **kwargs)


class Room(TenantScopedModel, TimeStampedModel):
    hostel = models.ForeignKey(Hostel, on_delete=models.CASCADE, related_name="rooms")
    room_number = models.CharField(max_length=20)
    capacity = models.PositiveIntegerField(default=4)

    class Meta:
        db_table = "hostel_rooms"
        ordering = ["room_number"]
        constraints = [
            models.UniqueConstraint(fields=["hostel", "room_number"], name="unique_room_number_per_hostel"),
        ]

    def __str__(self):
        return f"{self.hostel.name} - {self.room_number}"

    def save(self, *args, **kwargs):
        if self.hostel.school_id != self.school_id:
            raise ValueError("Room.hostel must belong to the same school")
        super().save(*args, **kwargs)


class Bed(TenantScopedModel, TimeStampedModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="beds")
    bed_number = models.CharField(max_length=20)

    class Meta:
        db_table = "hostel_beds"
        ordering = ["bed_number"]
        constraints = [
            models.UniqueConstraint(fields=["room", "bed_number"], name="unique_bed_number_per_room"),
        ]

    def __str__(self):
        return f"{self.room} - {self.bed_number}"

    def save(self, *args, **kwargs):
        if self.room.school_id != self.school_id:
            raise ValueError("Bed.room must belong to the same school")
        super().save(*args, **kwargs)

    @property
    def is_occupied(self):
        return self.allocations.filter(status=HostelAllocation.Status.ACTIVE).exists()


class HostelAllocation(TenantScopedModel, TimeStampedModel):
    """
    A bed can have at most one *active* allocation at a time — enforced both
    by the partial unique constraint below (the real, DB-level guarantee)
    and by `services.allocate_bed()`'s select_for_update()-then-recheck
    pattern (the same template as Phase 9's payment concurrency), which
    turns a violation into a clean error instead of an IntegrityError.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CHECKED_OUT = "checked_out", "Checked Out"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="hostel_allocations")
    bed = models.ForeignKey(Bed, on_delete=models.CASCADE, related_name="allocations")
    check_in_date = models.DateField()
    check_out_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "hostel_allocations"
        ordering = ["-check_in_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["bed"], condition=models.Q(status="active"), name="unique_active_allocation_per_bed"
            ),
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(status="active"),
                name="unique_active_allocation_per_student",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.bed}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("HostelAllocation.student must belong to the same school")
        if self.bed.school_id != self.school_id:
            raise ValueError("HostelAllocation.bed must belong to the same school")
        super().save(*args, **kwargs)
