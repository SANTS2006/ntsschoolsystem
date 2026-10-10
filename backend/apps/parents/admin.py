from django.contrib import admin

from .models import Guardian, StudentGuardian


class StudentGuardianInline(admin.TabularInline):
    model = StudentGuardian
    extra = 0
    fk_name = "guardian"


@admin.register(Guardian)
class GuardianAdmin(admin.ModelAdmin):
    list_display = ("full_name", "school", "email", "phone_number")
    list_filter = ("school",)
    search_fields = ("first_name", "last_name", "email", "phone_number")
    inlines = [StudentGuardianInline]

    def get_queryset(self, request):
        return Guardian.unscoped_objects.all()
