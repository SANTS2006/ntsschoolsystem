from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.notifications.services import notify
from apps.tenants.services import get_current_school

from . import services
from .models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem, Supplier
from .serializers import (
    PurchaseOrderItemSerializer,
    PurchaseOrderSerializer,
    PurchaseRequestItemSerializer,
    PurchaseRequestSerializer,
    ReceiveOrderSerializer,
    RejectRequestSerializer,
    SupplierSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "submit": "update",
    "approve": "approve",
    "reject": "approve",
    "cancel": "update",
    "send": "update",
    "receive": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status):
    return Response({"success": False, "message": message, "code": code, "errors": [message]}, status=http_status)


class SupplierViewSet(TenantScopedModelViewSet):
    serializer_class = SupplierSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "contact_person", "email"]
    summary_stats = {"total": {}, "active": {"is_active": True}}

    def get_permissions(self):
        code = f"procurement.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return Supplier.objects.all()


class PurchaseRequestViewSet(TenantScopedModelViewSet):
    serializer_class = PurchaseRequestSerializer
    filterset_fields = ["status"]
    search_fields = ["title"]
    summary_stats = {"total": {}, "by_status": {"groupby": "status"}}

    def get_permissions(self):
        code = f"procurement.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return PurchaseRequest.objects.select_related("requested_by", "approved_by").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), requested_by=self.request.user)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        purchase_request = self.get_object()
        try:
            services.submit_request(purchase_request)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok("Request submitted.", request=PurchaseRequestSerializer(purchase_request).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        purchase_request = self.get_object()
        try:
            services.approve_request(purchase_request, approved_by=request.user)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        if purchase_request.requested_by_id:
            notify(
                recipient=purchase_request.requested_by,
                category="procurement",
                title="Purchase request approved",
                message=f"\"{purchase_request.title}\" was approved.",
                link=f"/procurement/requests/{purchase_request.id}",
                email_subject=f"Purchase request approved: {purchase_request.title}",
                email_html=f"<p>Your purchase request \"{purchase_request.title}\" has been approved.</p>",
            )
        return _ok("Request approved.", request=PurchaseRequestSerializer(purchase_request).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        purchase_request = self.get_object()
        serializer = RejectRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        try:
            services.reject_request(purchase_request, rejected_by=request.user, reason=reason)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        if purchase_request.requested_by_id:
            notify(
                recipient=purchase_request.requested_by,
                category="procurement",
                title="Purchase request rejected",
                message=f"\"{purchase_request.title}\" was rejected: {reason}",
                link=f"/procurement/requests/{purchase_request.id}",
                email_subject=f"Purchase request rejected: {purchase_request.title}",
                email_html=f"<p>Your purchase request \"{purchase_request.title}\" was rejected.</p><p>Reason: {reason}</p>",
            )
        return _ok("Request rejected.", request=PurchaseRequestSerializer(purchase_request).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        purchase_request = self.get_object()
        try:
            services.cancel_request(purchase_request)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok("Request cancelled.", request=PurchaseRequestSerializer(purchase_request).data)


class PurchaseRequestItemViewSet(TenantScopedModelViewSet):
    serializer_class = PurchaseRequestItemSerializer
    filterset_fields = ["request"]
    summary_stats = {"total": {}}

    def get_permissions(self):
        code = f"procurement.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return PurchaseRequestItem.objects.select_related("request", "inventory_item").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school())


class PurchaseOrderViewSet(TenantScopedModelViewSet):
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ["status", "supplier"]
    search_fields = ["order_number"]
    summary_stats = {"total": {}, "by_status": {"groupby": "status"}}

    def get_permissions(self):
        code = f"procurement.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return PurchaseOrder.objects.select_related("supplier", "source_request", "created_by").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        order = self.get_object()
        try:
            services.send_order(order)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok("Order sent.", order=PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        try:
            services.cancel_order(order)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok("Order cancelled.", order=PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        order = self.get_object()
        serializer = ReceiveOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receipts = [
            {"item_id": line["item_id"], "quantity": line["quantity"]}
            for line in serializer.validated_data["receipts"]
        ]
        try:
            services.receive_order_items(order, receipts=receipts, received_by=request.user)
        except services.ProcurementError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        return _ok("Receipt recorded.", order=PurchaseOrderSerializer(order).data)


class PurchaseOrderItemViewSet(TenantScopedModelViewSet):
    serializer_class = PurchaseOrderItemSerializer
    filterset_fields = ["order"]
    summary_stats = {"total": {}}

    def get_permissions(self):
        code = f"procurement.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return PurchaseOrderItem.objects.select_related("order", "inventory_item").all()

    def perform_create(self, serializer):
        instance = serializer.save(school=get_current_school())
        instance.order.recalculate_total()

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.order.recalculate_total()

    def perform_destroy(self, instance):
        order = instance.order
        instance.delete()
        order.recalculate_total()
