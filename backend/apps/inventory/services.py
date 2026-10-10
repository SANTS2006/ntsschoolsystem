from django.db import transaction

from apps.authorization.services import users_with_permission
from apps.notifications.services import notify_bulk

from .models import InventoryItem, InventoryTransaction


class InventoryError(Exception):
    """Raised for stock-movement business-rule violations; caught and converted to a
    clean 400 at the view boundary — never allowed to propagate raw."""


def record_stock_in(*, item, quantity, reason="", recorded_by=None):
    if quantity <= 0:
        raise InventoryError("Quantity must be positive.")
    with transaction.atomic():
        locked_item = InventoryItem.unscoped_objects.select_for_update().get(pk=item.pk)
        locked_item.quantity_in_stock += quantity
        locked_item.save(update_fields=["quantity_in_stock", "updated_at"])
        return InventoryTransaction.objects.create(
            school=locked_item.school,
            item=locked_item,
            transaction_type=InventoryTransaction.TransactionType.STOCK_IN,
            quantity=quantity,
            reason=reason,
            recorded_by=recorded_by,
        )


def record_stock_out(*, item, quantity, reason="", recorded_by=None):
    """
    Locks the item row, re-checks sufficient stock *after* acquiring the lock (not
    before — checking first doesn't protect against a concurrent stock-out that grabs
    the lock first), then mutates + creates the ledger entry in the same atomic block.
    Same select_for_update()-then-recheck template as
    apps.finance.services.record_payment / apps.library.services.checkout_book /
    apps.hostel.services.allocate_bed (Phase 9/10) — "stock must never go negative" is
    the same shape of invariant as "don't double-book a bed."
    """
    if quantity <= 0:
        raise InventoryError("Quantity must be positive.")
    with transaction.atomic():
        locked_item = InventoryItem.unscoped_objects.select_for_update().get(pk=item.pk)
        if locked_item.quantity_in_stock < quantity:
            raise InventoryError(
                f"Insufficient stock: only {locked_item.quantity_in_stock} "
                f"{locked_item.unit or 'unit(s)'} available."
            )
        locked_item.quantity_in_stock -= quantity
        locked_item.save(update_fields=["quantity_in_stock", "updated_at"])
        txn = InventoryTransaction.objects.create(
            school=locked_item.school,
            item=locked_item,
            transaction_type=InventoryTransaction.TransactionType.STOCK_OUT,
            quantity=quantity,
            reason=reason,
            recorded_by=recorded_by,
        )
        if locked_item.is_active and locked_item.quantity_in_stock <= locked_item.reorder_level:
            recipients = list(users_with_permission(locked_item.school, "inventory.update"))
            if recipients:
                notify_bulk(
                    recipients=recipients,
                    category="inventory",
                    title=f"Low stock: {locked_item.name}",
                    message=(
                        f"Only {locked_item.quantity_in_stock} {locked_item.unit or 'unit(s)'} left "
                        f"(reorder level {locked_item.reorder_level})."
                    ),
                    link=f"/inventory/items/{locked_item.id}/edit",
                    priority="high",
                )
        return txn
