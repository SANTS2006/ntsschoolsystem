from django.contrib import admin

from .models import LiveSession


@admin.register(LiveSession)
class LiveSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "school_class", "subject", "teacher", "status", "scheduled_start")
    list_filter = ("school", "status")
    search_fields = ("title",)

    def get_queryset(self, request):
        return LiveSession.unscoped_objects.all()
