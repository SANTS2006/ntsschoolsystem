from django.contrib import admin

from .models import Bed, Hostel, HostelAllocation, Room


class RoomInline(admin.TabularInline):
    model = Room
    extra = 0


class BedInline(admin.TabularInline):
    model = Bed
    extra = 0


@admin.register(Hostel)
class HostelAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "gender_restriction", "warden")
    list_filter = ("school", "gender_restriction")
    inlines = [RoomInline]

    def get_queryset(self, request):
        return Hostel.unscoped_objects.all()


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("room_number", "hostel", "capacity")
    list_filter = ("hostel__school",)
    inlines = [BedInline]

    def get_queryset(self, request):
        return Room.unscoped_objects.all()


@admin.register(HostelAllocation)
class HostelAllocationAdmin(admin.ModelAdmin):
    list_display = ("student", "bed", "check_in_date", "check_out_date", "status")
    list_filter = ("school", "status")

    def get_queryset(self, request):
        return HostelAllocation.unscoped_objects.all()
