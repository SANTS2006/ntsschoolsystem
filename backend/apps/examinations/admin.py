from django.contrib import admin

from .models import Exam, ExamSchedule, GradeBoundary, GradingScale, Result


class GradeBoundaryInline(admin.TabularInline):
    model = GradeBoundary
    extra = 0


@admin.register(GradingScale)
class GradingScaleAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "is_default")
    list_filter = ("school",)
    inlines = [GradeBoundaryInline]

    def get_queryset(self, request):
        return GradingScale.unscoped_objects.all()


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("name", "exam_type", "term", "start_date", "end_date")
    list_filter = ("term__school", "exam_type")

    def get_queryset(self, request):
        return Exam.unscoped_objects.all()


@admin.register(ExamSchedule)
class ExamScheduleAdmin(admin.ModelAdmin):
    list_display = ("exam", "school_class", "subject", "max_score", "date")
    list_filter = ("exam__term__school",)

    def get_queryset(self, request):
        return ExamSchedule.unscoped_objects.all()


@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ("student", "exam_schedule", "score", "grade", "status")
    list_filter = ("school", "status")
    search_fields = ("student__first_name", "student__last_name")

    def get_queryset(self, request):
        return Result.unscoped_objects.all()

    def has_delete_permission(self, request, obj=None):
        return False
