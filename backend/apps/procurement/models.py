from decimal import Decimal

from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel

ZERO = Decimal("0.00")


class Supplier(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "suppliers"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_supplier_name_per_school"),
        ]

    def __str__(self):
        return self.name


class PurchaseRequest(TenantScopedModel, TimeStampedModel):
    """
    Lifecycle: draft -> submitted -> approved/rejected, or cancelled from
    draft/submitted. Approval doesn't create a PurchaseOrder automatically —
    a separate, explicit action (PurchaseOrderViewSet.create with
    source_request set) does that, same "no hidden side effects on a status
    transition" shape as Result's submit/review/approve/publish/lock.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    title = models.CharField(max_length=200)
    notes = models.CharField(max_length=1000, blank=True)
    requested_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "purchase_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.requested_by_id and self.requested_by.school_id != self.school_id:
            raise ValueError("PurchaseRequest.requested_by must belong to the same school")
        if self.approved_by_id and self.approved_by.school_id != self.school_id:
            raise ValueError("PurchaseRequest.approved_by must belong to the same school")
        super().save(*args, **kwargs)


class PurchaseRequestItem(TenantScopedModel):
    request = models.ForeignKey(PurchaseRequest, on_delete=models.CASCADE, related_name="items")
    # Optional link for restocking an existing item; free-text `description` works even
    # without one, e.g. requesting something new that isn't in inventory yet.
    inventory_item = models.ForeignKey(
        "inventory.InventoryItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField()
    estimated_unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "purchase_request_items"
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="request_item_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.request.title} - {self.description}"

    def save(self, *args, **kwargs):
        if self.request.school_id != self.school_id:
            raise ValueError("PurchaseRequestItem.request must belong to the same school")
        if self.inventory_item_id and self.inventory_item.school_id != self.school_id:
            raise ValueError("PurchaseRequestItem.inventory_item must belong to the same school")
        super().save(*args, **kwargs)


class PurchaseOrder(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PARTIALLY_RECEIVED = "partially_received", "Partially Received"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    order_number = models.CharField(max_length=30)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name="orders")
    source_request = models.ForeignKey(
        PurchaseRequest, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    created_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    ordered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "purchase_orders"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "order_number"], name="unique_order_number_per_school"),
        ]

    def __str__(self):
        return self.order_number

    def save(self, *args, **kwargs):
        if self.supplier.school_id != self.school_id:
            raise ValueError("PurchaseOrder.supplier must belong to the same school")
        if self.source_request_id and self.source_request.school_id != self.school_id:
            raise ValueError("PurchaseOrder.source_request must belong to the same school")
        if self.created_by_id and self.created_by.school_id != self.school_id:
            raise ValueError("PurchaseOrder.created_by must belong to the same school")
        super().save(*args, **kwargs)

    def recalculate_total(self):
        """Mirrors apps.finance.models.Invoice.recalculate_amounts() — uses
        unscoped_objects since this can be called from a service function with no
        ambient tenant context, filtering explicitly by order=self for correctness."""
        aggregate = PurchaseOrderItem.unscoped_objects.filter(order=self).aggregate(
            total=models.Sum(models.F("quantity_ordered") * models.F("unit_price"))
        )
        self.total_amount = aggregate["total"] or ZERO
        self.save(update_fields=["total_amount", "updated_at"])


class PurchaseOrderItem(TenantScopedModel):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    inventory_item = models.ForeignKey(
        "inventory.InventoryItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    description = models.CharField(max_length=255)
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "purchase_order_items"
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity_ordered__gt=0), name="order_item_quantity_positive"),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="order_item_unit_price_non_negative"),
            models.CheckConstraint(
                condition=models.Q(quantity_received__lte=models.F("quantity_ordered")),
                name="order_item_received_not_over_ordered",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number} - {self.description}"

    @property
    def is_fully_received(self):
        return self.quantity_received >= self.quantity_ordered

    def save(self, *args, **kwargs):
        if self.order.school_id != self.school_id:
            raise ValueError("PurchaseOrderItem.order must belong to the same school")
        if self.inventory_item_id and self.inventory_item.school_id != self.school_id:
            raise ValueError("PurchaseOrderItem.inventory_item must belong to the same school")
        super().save(*args, **kwargs)
