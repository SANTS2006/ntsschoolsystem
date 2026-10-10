from rest_framework.routers import DefaultRouter

from .views import (
    PurchaseOrderItemViewSet,
    PurchaseOrderViewSet,
    PurchaseRequestItemViewSet,
    PurchaseRequestViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("requests", PurchaseRequestViewSet, basename="purchase-request")
router.register("request-items", PurchaseRequestItemViewSet, basename="purchase-request-item")
router.register("orders", PurchaseOrderViewSet, basename="purchase-order")
router.register("order-items", PurchaseOrderItemViewSet, basename="purchase-order-item")

app_name = "procurement"

urlpatterns = router.urls
