from django.contrib import admin

from .models import AcademicYear, Department, SchoolClass, Section, Subject, Term


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "start_date", "end_date", "is_current")
    list_filter = ("school", "is_current")

    def get_queryset(self, request):
        return AcademicYear.unscoped_objects.all()


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ("name", "academic_year", "start_date", "end_date", "is_current")
    list_filter = ("academic_year__school", "is_current")

    def get_queryset(self, request):
        return Term.unscoped_objects.all()


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "school")
    list_filter = ("school",)

    def get_queryset(self, request):
        return Department.unscoped_objects.all()


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "school")
    list_filter = ("school", "departments")
    filter_horizontal = ("departments",)

    def get_queryset(self, request):
        return Subject.unscoped_objects.all()


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ("name", "order", "school")
    list_filter = ("school",)

    def get_queryset(self, request):
        return SchoolClass.unscoped_objects.all()


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "academic_year", "class_teacher", "capacity")
    list_filter = ("school_class__school", "academic_year")

    def get_queryset(self, request):
        return Section.unscoped_objects.all()
