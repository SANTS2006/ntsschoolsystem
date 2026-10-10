from django.contrib import admin

from .models import Assignment, AssignmentSubmission


class AssignmentSubmissionInline(admin.TabularInline):
    model = AssignmentSubmission
    extra = 0


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "school_class", "subject", "teacher", "due_date", "is_active")
    list_filter = ("school", "school_class", "subject", "is_active")
    search_fields = ("title", "description")
    inlines = [AssignmentSubmissionInline]

    def get_queryset(self, request):
        return Assignment.unscoped_objects.all()


@admin.register(AssignmentSubmission)
class AssignmentSubmissionAdmin(admin.ModelAdmin):
    list_display = ("assignment", "student", "status", "score", "submitted_at")
    list_filter = ("school", "status")
    search_fields = ("assignment__title", "student__first_name", "student__last_name")

    def get_queryset(self, request):
        return AssignmentSubmission.unscoped_objects.all()
