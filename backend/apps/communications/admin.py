from django.contrib import admin

from .models import Announcement, AnnouncementRecipient


class AnnouncementRecipientInline(admin.TabularInline):
    model = AnnouncementRecipient
    extra = 0


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "target_type", "published_at", "is_active")
    list_filter = ("school", "target_type", "is_active")
    search_fields = ("title", "body")
    inlines = [AnnouncementRecipientInline]

    def get_queryset(self, request):
        return Announcement.unscoped_objects.all()
