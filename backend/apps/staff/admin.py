from django.contrib import admin

from .models import Staff


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("__str__", "staff_id", "school", "department", "employment_status")
    list_filter = ("school", "department", "employment_status")
    search_fields = ("user__first_name", "user__last_name", "user__email", "staff_id")

    def get_queryset(self, request):
        return Staff.unscoped_objects.all()
