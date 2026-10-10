from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class InventoryCategory(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "inventory_categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_inventory_category_name_per_school"),
        ]

    def __str__(self):
        return self.name


class InventoryItem(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        InventoryCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="items"
    )
    sku = models.CharField(max_length=50, blank=True)
    unit = models.CharField(max_length=30, blank=True)  # "pcs", "box", "litre", ...
    # Only ever mutated by services.record_stock_in/record_stock_out, inside a locked
    # transaction — never directly writable through the API (see the serializer's
    # read_only_fields) so the InventoryTransaction ledger stays the authoritative history
    # of every change, not just a side effect of it.
    quantity_in_stock = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=0)
    location = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "inventory_items"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "sku"], condition=~models.Q(sku=""), name="unique_inventory_sku_per_school"
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_low_stock(self):
        return self.quantity_in_stock <= self.reorder_level

    def save(self, *args, **kwargs):
        if self.category_id and self.category.school_id != self.school_id:
            raise ValueError("InventoryItem.category must belong to the same school")
        super().save(*args, **kwargs)


class InventoryTransaction(TenantScopedModel, TimeStampedModel):
    """
    Append-only stock-movement ledger. Created exclusively by
    services.record_stock_in()/record_stock_out() — never directly through
    InventoryTransactionViewSet, which is read-only, same shape as
    apps.notifications.Notification.
    """

    class TransactionType(models.TextChoices):
        STOCK_IN = "stock_in", "Stock In"
        STOCK_OUT = "stock_out", "Stock Out"

    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="transactions")
    transaction_type = models.CharField(max_length=10, choices=TransactionType.choices)
    quantity = models.PositiveIntegerField()
    reason = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "inventory_transactions"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="inventory_transaction_quantity_positive"
            ),
        ]

    def __str__(self):
        return f"{self.item.name} {self.transaction_type} {self.quantity}"

    def save(self, *args, **kwargs):
        if self.item.school_id != self.school_id:
            raise ValueError("InventoryTransaction.school must match item.school")
        if self.recorded_by_id and self.recorded_by.school_id != self.school_id:
            raise ValueError("InventoryTransaction.recorded_by must belong to the same school")
        super().save(*args, **kwargs)
