from django.contrib import admin

from .models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem, Supplier


class PurchaseRequestItemInline(admin.TabularInline):
    model = PurchaseRequestItem
    extra = 0


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "contact_person", "is_active")
    list_filter = ("school", "is_active")
    search_fields = ("name",)

    def get_queryset(self, request):
        return Supplier.unscoped_objects.all()


@admin.register(PurchaseRequest)
class PurchaseRequestAdmin(admin.ModelAdmin):
    list_display = ("title", "school", "status", "requested_by", "approved_by")
    list_filter = ("school", "status")
    search_fields = ("title",)
    inlines = [PurchaseRequestItemInline]

    def get_queryset(self, request):
        return PurchaseRequest.unscoped_objects.all()


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "school", "supplier", "status", "total_amount")
    list_filter = ("school", "status")
    search_fields = ("order_number",)
    inlines = [PurchaseOrderItemInline]

    def get_queryset(self, request):
        return PurchaseOrder.unscoped_objects.all()
