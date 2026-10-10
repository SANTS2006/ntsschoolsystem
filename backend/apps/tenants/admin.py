from django.contrib import admin

from .models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "school_type", "country", "created_at")
    list_filter = ("status", "school_type", "ownership_type")
    search_fields = ("name", "slug", "email")
    prepopulated_fields = {"slug": ("name",)}
