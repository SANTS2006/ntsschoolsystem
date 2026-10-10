from django.contrib import admin

from .models import InventoryCategory, InventoryItem, InventoryTransaction


@admin.register(InventoryCategory)
class InventoryCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "school")
    list_filter = ("school",)
    search_fields = ("name",)

    def get_queryset(self, request):
        return InventoryCategory.unscoped_objects.all()


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "category", "quantity_in_stock", "reorder_level", "is_active")
    list_filter = ("school", "category", "is_active")
    search_fields = ("name", "sku")

    def get_queryset(self, request):
        return InventoryItem.unscoped_objects.all()


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(admin.ModelAdmin):
    list_display = ("item", "transaction_type", "quantity", "recorded_by", "created_at")
    list_filter = ("school", "transaction_type")

    def get_queryset(self, request):
        return InventoryTransaction.unscoped_objects.all()
