from django.contrib import admin

from .models import StaffAttendance, StudentAttendance


@admin.register(StudentAttendance)
class StudentAttendanceAdmin(admin.ModelAdmin):
    list_display = ("student", "date", "status", "section", "subject")
    list_filter = ("school", "status", "date")

    def get_queryset(self, request):
        return StudentAttendance.unscoped_objects.all()


@admin.register(StaffAttendance)
class StaffAttendanceAdmin(admin.ModelAdmin):
    list_display = ("staff", "date", "status", "check_in_time", "check_out_time")
    list_filter = ("school", "status", "date")

    def get_queryset(self, request):
        return StaffAttendance.unscoped_objects.all()
