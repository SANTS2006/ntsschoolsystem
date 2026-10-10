from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "category", "priority", "title", "is_read", "created_at")
    list_filter = ("school", "category", "priority", "is_read")

    def get_queryset(self, request):
        return Notification.unscoped_objects.all()
