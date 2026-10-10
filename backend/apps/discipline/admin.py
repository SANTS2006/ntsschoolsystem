from django.contrib import admin

from .models import DisciplineIncident


@admin.register(DisciplineIncident)
class DisciplineIncidentAdmin(admin.ModelAdmin):
    list_display = ("student", "category", "severity", "incident_date", "status", "action_taken")
    list_filter = ("school", "category", "severity", "status")

    def get_queryset(self, request):
        return DisciplineIncident.unscoped_objects.all()
