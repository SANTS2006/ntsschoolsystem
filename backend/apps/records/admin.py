from django.contrib import admin

from .models import Record


@admin.register(Record)
class RecordAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "category", "created_by", "created_at")
    list_filter = ("school", "category")
    search_fields = ("title", "body")

    def get_queryset(self, request):
        return Record.unscoped_objects.all()
