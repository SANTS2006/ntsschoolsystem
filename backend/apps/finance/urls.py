from rest_framework.routers import DefaultRouter

from .views import (
    FeeCategoryViewSet,
    FeeStructureItemViewSet,
    FeeStructureViewSet,
    InvoiceLineItemViewSet,
    InvoiceViewSet,
    PaymentViewSet,
)

router = DefaultRouter()
router.register("fee-categories", FeeCategoryViewSet, basename="fee-category")
router.register("fee-structures", FeeStructureViewSet, basename="fee-structure")
router.register("fee-structure-items", FeeStructureItemViewSet, basename="fee-structure-item")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("invoice-line-items", InvoiceLineItemViewSet, basename="invoice-line-item")
router.register("payments", PaymentViewSet, basename="payment")

app_name = "finance"

urlpatterns = router.urls
