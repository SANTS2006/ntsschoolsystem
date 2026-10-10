from django.contrib import admin

from .models import MedicalProfile, MedicalVisit


@admin.register(MedicalProfile)
class MedicalProfileAdmin(admin.ModelAdmin):
    list_display = ("student", "blood_group", "school")
    list_filter = ("school", "blood_group")

    def get_queryset(self, request):
        return MedicalProfile.unscoped_objects.all()


@admin.register(MedicalVisit)
class MedicalVisitAdmin(admin.ModelAdmin):
    list_display = ("student", "visit_type", "visited_at", "attended_by")
    list_filter = ("school", "visit_type")

    def get_queryset(self, request):
        return MedicalVisit.unscoped_objects.all()
