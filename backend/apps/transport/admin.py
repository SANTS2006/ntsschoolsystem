from django.contrib import admin

from .models import Route, Stop, StudentTransportAssignment, Vehicle, VehicleMaintenance


class StopInline(admin.TabularInline):
    model = Stop
    extra = 0


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("registration_number", "school", "driver", "capacity", "status")
    list_filter = ("school", "status")

    def get_queryset(self, request):
        return Vehicle.unscoped_objects.all()


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "vehicle")
    list_filter = ("school",)
    inlines = [StopInline]

    def get_queryset(self, request):
        return Route.unscoped_objects.all()


@admin.register(VehicleMaintenance)
class VehicleMaintenanceAdmin(admin.ModelAdmin):
    list_display = ("vehicle", "date", "cost", "next_service_date")
    list_filter = ("school",)

    def get_queryset(self, request):
        return VehicleMaintenance.unscoped_objects.all()


@admin.register(StudentTransportAssignment)
class StudentTransportAssignmentAdmin(admin.ModelAdmin):
    list_display = ("student", "route", "stop")
    list_filter = ("school", "route")

    def get_queryset(self, request):
        return StudentTransportAssignment.unscoped_objects.all()
