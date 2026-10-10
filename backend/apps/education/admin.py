from django.contrib import admin

from .models import Lesson, LessonMaterial


class LessonMaterialInline(admin.TabularInline):
    model = LessonMaterial
    extra = 0


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "school_class", "subject", "teacher", "is_active")
    list_filter = ("school", "school_class", "subject", "is_active")
    search_fields = ("title", "description")
    inlines = [LessonMaterialInline]

    def get_queryset(self, request):
        return Lesson.unscoped_objects.all()


@admin.register(LessonMaterial)
class LessonMaterialAdmin(admin.ModelAdmin):
    list_display = ("title", "lesson", "material_type", "uploaded_by", "created_at")
    list_filter = ("school", "material_type")
    search_fields = ("title", "lesson__title")

    def get_queryset(self, request):
        return LessonMaterial.unscoped_objects.all()
