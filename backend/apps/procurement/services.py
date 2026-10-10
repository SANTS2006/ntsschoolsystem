from django.db import transaction
from django.utils import timezone

from apps.inventory.services import record_stock_in

from .models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem


class ProcurementError(Exception):
    """Raised for procurement business-rule violations; caught and converted to a
    clean 400 at the view boundary — never allowed to propagate raw."""


def submit_request(request: PurchaseRequest) -> PurchaseRequest:
    if request.status != PurchaseRequest.Status.DRAFT:
        raise ProcurementError("Only a draft request can be submitted.")
    # unscoped_objects, not the `request.items` reverse accessor (which is backed by the
    # tenant-scoped `objects` manager and silently returns empty outside request context)
    # — this function must work whether or not a request is on the call stack.
    if not PurchaseRequestItem.unscoped_objects.filter(request=request).exists():
        raise ProcurementError("Cannot submit a request with no items.")
    request.status = PurchaseRequest.Status.SUBMITTED
    request.save(update_fields=["status", "updated_at"])
    return request


def approve_request(request: PurchaseRequest, *, approved_by) -> PurchaseRequest:
    if request.status != PurchaseRequest.Status.SUBMITTED:
        raise ProcurementError("Only a submitted request can be approved.")
    request.status = PurchaseRequest.Status.APPROVED
    request.approved_by = approved_by
    request.approved_at = timezone.now()
    request.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return request


def reject_request(request: PurchaseRequest, *, rejected_by, reason: str) -> PurchaseRequest:
    if request.status != PurchaseRequest.Status.SUBMITTED:
        raise ProcurementError("Only a submitted request can be rejected.")
    if not reason:
        raise ProcurementError("A rejection reason is required.")
    request.status = PurchaseRequest.Status.REJECTED
    request.approved_by = rejected_by
    request.approved_at = timezone.now()
    request.rejection_reason = reason
    request.save(update_fields=["status", "approved_by", "approved_at", "rejection_reason", "updated_at"])
    return request


def cancel_request(request: PurchaseRequest) -> PurchaseRequest:
    if request.status not in (PurchaseRequest.Status.DRAFT, PurchaseRequest.Status.SUBMITTED):
        raise ProcurementError("Only a draft or submitted request can be cancelled.")
    request.status = PurchaseRequest.Status.CANCELLED
    request.save(update_fields=["status", "updated_at"])
    return request


def send_order(order: PurchaseOrder) -> PurchaseOrder:
    if order.status != PurchaseOrder.Status.DRAFT:
        raise ProcurementError("Only a draft order can be sent.")
    # unscoped_objects — same reverse-accessor pitfall as submit_request() above.
    if not PurchaseOrderItem.unscoped_objects.filter(order=order).exists():
        raise ProcurementError("Cannot send an order with no items.")
    order.status = PurchaseOrder.Status.SENT
    order.ordered_at = timezone.now()
    order.save(update_fields=["status", "ordered_at", "updated_at"])
    return order


def cancel_order(order: PurchaseOrder) -> PurchaseOrder:
    if order.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.SENT):
        raise ProcurementError("Only a draft or sent order (nothing received yet) can be cancelled.")
    order.status = PurchaseOrder.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    return order


def receive_order_items(order: PurchaseOrder, *, receipts, received_by=None) -> PurchaseOrder:
    """
    `receipts`: an iterable of {"item_id": UUID, "quantity": int}. Locks the order and
    each referenced line item, re-checks the remaining-quantity invariant after
    acquiring the lock, and — for any line linked to an InventoryItem — calls
    apps.inventory.services.record_stock_in() so the stock ledger stays in sync with
    what was actually received. Same select_for_update()-then-recheck template as
    finance/library/hostel/inventory (Phase 9-13); this is its fifth application.
    """
    with transaction.atomic():
        locked_order = PurchaseOrder.unscoped_objects.select_for_update().get(pk=order.pk)
        if locked_order.status not in (PurchaseOrder.Status.SENT, PurchaseOrder.Status.PARTIALLY_RECEIVED):
            raise ProcurementError("Only a sent or partially received order can receive items.")

        for receipt in receipts:
            quantity = receipt["quantity"]
            if quantity <= 0:
                raise ProcurementError("Received quantity must be positive.")
            try:
                line_item = PurchaseOrderItem.unscoped_objects.select_for_update().get(
                    pk=receipt["item_id"], order=locked_order
                )
            except PurchaseOrderItem.DoesNotExist:
                raise ProcurementError("One of the given items does not belong to this order.")
            remaining = line_item.quantity_ordered - line_item.quantity_received
            if quantity > remaining:
                raise ProcurementError(
                    f"Cannot receive {quantity} of '{line_item.description}': only {remaining} remaining."
                )
            line_item.quantity_received += quantity
            # No "updated_at" here — PurchaseOrderItem is a plain TenantScopedModel, not
            # TimeStampedModel, same as InvoiceLineItem/FeeStructureItem: line items don't
            # track their own timestamps, only their parent record does.
            line_item.save(update_fields=["quantity_received"])
            if line_item.inventory_item_id:
                record_stock_in(
                    item=line_item.inventory_item,
                    quantity=quantity,
                    reason=f"Received from purchase order {locked_order.order_number}",
                    recorded_by=received_by,
                )

        all_items = list(PurchaseOrderItem.unscoped_objects.filter(order=locked_order))
        if all(i.is_fully_received for i in all_items):
            locked_order.status = PurchaseOrder.Status.RECEIVED
        elif any(i.quantity_received > 0 for i in all_items):
            locked_order.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
        locked_order.save(update_fields=["status", "updated_at"])
        return locked_order
