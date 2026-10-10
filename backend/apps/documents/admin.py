from django.contrib import admin

from .models import Document, DocumentCategory


@admin.register(DocumentCategory)
class DocumentCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "school")
    list_filter = ("school",)
    search_fields = ("name",)

    def get_queryset(self, request):
        return DocumentCategory.unscoped_objects.all()


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "owner_type", "category", "is_confidential", "expiry_date")
    list_filter = ("school", "owner_type", "is_confidential", "category")
    search_fields = ("title", "description")

    def get_queryset(self, request):
        return Document.unscoped_objects.all()
