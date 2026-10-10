from django.contrib import admin

from .models import Period, Room, TimetableEntry


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "capacity")
    list_filter = ("school",)

    def get_queryset(self, request):
        return Room.unscoped_objects.all()


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "start_time", "end_time", "order", "is_break")
    list_filter = ("school", "is_break")

    def get_queryset(self, request):
        return Period.unscoped_objects.all()


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = ("section", "day_of_week", "period", "subject", "teacher", "room")
    list_filter = ("section__school", "day_of_week")

    def get_queryset(self, request):
        return TimetableEntry.unscoped_objects.all()
