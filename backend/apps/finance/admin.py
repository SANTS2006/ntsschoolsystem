from django.contrib import admin

from .models import FeeCategory, FeeStructure, FeeStructureItem, Invoice, InvoiceLineItem, Payment, Refund


class FeeStructureItemInline(admin.TabularInline):
    model = FeeStructureItem
    extra = 0


@admin.register(FeeCategory)
class FeeCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "school", "is_recurring")
    list_filter = ("school", "is_recurring")

    def get_queryset(self, request):
        return FeeCategory.unscoped_objects.all()


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "academic_year", "term", "school_class")
    list_filter = ("school", "academic_year")
    inlines = [FeeStructureItemInline]

    def get_queryset(self, request):
        return FeeStructure.unscoped_objects.all()


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = [f.name for f in Payment._meta.fields]
    can_delete = False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "student", "school", "status", "total", "amount_paid", "balance")
    list_filter = ("school", "status")
    search_fields = ("invoice_number", "student__first_name", "student__last_name")
    readonly_fields = ("subtotal", "discount_total", "total", "amount_paid", "balance")
    inlines = [InvoiceLineItemInline, PaymentInline]

    def get_queryset(self, request):
        return Invoice.unscoped_objects.all()


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("receipt_number", "invoice", "amount", "method", "status", "paid_at")
    list_filter = ("school", "method", "status")
    search_fields = ("receipt_number",)

    def get_queryset(self, request):
        return Payment.unscoped_objects.all()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("payment", "amount", "reason", "refunded_at")
    list_filter = ("school",)

    def get_queryset(self, request):
        return Refund.unscoped_objects.all()

    def has_delete_permission(self, request, obj=None):
        return False
