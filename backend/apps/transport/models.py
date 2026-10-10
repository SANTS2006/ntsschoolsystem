from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Vehicle(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        MAINTENANCE = "maintenance", "In Maintenance"
        RETIRED = "retired", "Retired"

    registration_number = models.CharField(max_length=30)
    make_model = models.CharField(max_length=150, blank=True)
    capacity = models.PositiveIntegerField(default=0)
    driver = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="driven_vehicles"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "transport_vehicles"
        ordering = ["registration_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "registration_number"], name="unique_vehicle_registration_per_school"
            ),
        ]

    def __str__(self):
        return self.registration_number

    def save(self, *args, **kwargs):
        if self.driver_id and self.driver.school_id != self.school_id:
            raise ValueError("Vehicle.driver must belong to the same school")
        super().save(*args, **kwargs)


class Route(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=500, blank=True)
    vehicle = models.ForeignKey(
        Vehicle, null=True, blank=True, on_delete=models.SET_NULL, related_name="routes"
    )

    class Meta:
        db_table = "transport_routes"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_route_name_per_school"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.vehicle_id and self.vehicle.school_id != self.school_id:
            raise ValueError("Route.vehicle must belong to the same school")
        super().save(*args, **kwargs)


class Stop(TenantScopedModel, TimeStampedModel):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="stops")
    name = models.CharField(max_length=150)
    order = models.PositiveIntegerField(default=0)
    pickup_time = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = "transport_stops"
        ordering = ["route", "order"]
        constraints = [
            models.UniqueConstraint(fields=["route", "order"], name="unique_stop_order_per_route"),
        ]

    def __str__(self):
        return f"{self.route.name} - {self.name}"

    def save(self, *args, **kwargs):
        if self.route.school_id != self.school_id:
            raise ValueError("Stop.route must belong to the same school")
        super().save(*args, **kwargs)


class VehicleMaintenance(TenantScopedModel, TimeStampedModel):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="maintenance_records")
    date = models.DateField()
    description = models.CharField(max_length=500)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    next_service_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "transport_vehicle_maintenance"
        ordering = ["-date"]

    def __str__(self):
        return f"{self.vehicle} - {self.date}"

    def save(self, *args, **kwargs):
        if self.vehicle.school_id != self.school_id:
            raise ValueError("VehicleMaintenance.vehicle must belong to the same school")
        super().save(*args, **kwargs)


class StudentTransportAssignment(TenantScopedModel, TimeStampedModel):
    student = models.OneToOneField(
        "students.Student", on_delete=models.CASCADE, related_name="transport_assignment"
    )
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="student_assignments")
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE, related_name="student_assignments")

    class Meta:
        db_table = "transport_student_assignments"

    def __str__(self):
        return f"{self.student} -> {self.route.name}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("StudentTransportAssignment.student must belong to the same school")
        if self.route.school_id != self.school_id:
            raise ValueError("StudentTransportAssignment.route must belong to the same school")
        if self.stop.route_id != self.route_id:
            raise ValueError("StudentTransportAssignment.stop must belong to the assigned route")
        super().save(*args, **kwargs)
