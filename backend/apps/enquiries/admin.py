from django.contrib import admin

from .models import Enquiry


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "name", "email", "organization", "email_status", "handled")
    list_filter = ("kind", "handled", "email_status")
    search_fields = ("name", "email", "organization")
    readonly_fields = [f.name for f in Enquiry._meta.fields]
