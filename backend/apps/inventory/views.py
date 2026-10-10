from django.db.models import F
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet, TenantScopedReadOnlyViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import InventoryCategory, InventoryItem, InventoryTransaction
from .serializers import (
    InventoryCategorySerializer,
    InventoryItemSerializer,
    InventoryTransactionSerializer,
    StockActionSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "stock_in": "update",
    "stock_out": "update",
    "low_stock": "view",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status):
    return Response({"success": False, "message": message, "code": code, "errors": [message]}, status=http_status)


class InventoryCategoryViewSet(TenantScopedModelViewSet):
    serializer_class = InventoryCategorySerializer
    summary_stats = {"total": {}}

    def get_permissions(self):
        code = f"inventory.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return InventoryCategory.objects.all()


class InventoryItemViewSet(TenantScopedModelViewSet):
    serializer_class = InventoryItemSerializer
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "sku"]
    summary_stats = {"total": {}, "active": {"is_active": True}}

    def get_permissions(self):
        code = f"inventory.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return InventoryItem.objects.select_related("category").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school())

    @action(detail=True, methods=["post"])
    def stock_in(self, request, pk=None):
        item = self.get_object()
        serializer = StockActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            txn = services.record_stock_in(
                item=item,
                quantity=serializer.validated_data["quantity"],
                reason=serializer.validated_data.get("reason", ""),
                recorded_by=request.user,
            )
        except services.InventoryError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        item.refresh_from_db()
        return _ok(
            "Stock recorded.",
            item=InventoryItemSerializer(item).data,
            transaction=InventoryTransactionSerializer(txn).data,
        )

    @action(detail=True, methods=["post"])
    def stock_out(self, request, pk=None):
        item = self.get_object()
        serializer = StockActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            txn = services.record_stock_out(
                item=item,
                quantity=serializer.validated_data["quantity"],
                reason=serializer.validated_data.get("reason", ""),
                recorded_by=request.user,
            )
        except services.InventoryError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        item.refresh_from_db()
        return _ok(
            "Stock recorded.",
            item=InventoryItemSerializer(item).data,
            transaction=InventoryTransactionSerializer(txn).data,
        )

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        items = self.get_queryset().filter(is_active=True, quantity_in_stock__lte=F("reorder_level"))
        return _ok(items=InventoryItemSerializer(items, many=True).data)


class InventoryTransactionViewSet(TenantScopedReadOnlyViewSet):
    """Read-only ledger — every row is created exclusively by
    services.record_stock_in()/record_stock_out(), never directly through this API."""

    serializer_class = InventoryTransactionSerializer
    filterset_fields = ["item", "transaction_type"]
    summary_stats = {"total": {}, "by_transaction_type": {"groupby": "transaction_type"}}

    def get_permissions(self):
        return [require_permission("inventory.view")()]

    def get_queryset(self):
        return InventoryTransaction.objects.select_related("item", "recorded_by").all()
