from django.contrib import admin

from .models import Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("full_name", "admission_number", "school", "status", "current_class", "current_section")
    list_filter = ("school", "status", "current_class")
    search_fields = ("first_name", "last_name", "admission_number")

    def get_queryset(self, request):
        return Student.unscoped_objects.all()
