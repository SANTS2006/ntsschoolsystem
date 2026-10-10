from rest_framework.routers import DefaultRouter

from .views import InventoryCategoryViewSet, InventoryItemViewSet, InventoryTransactionViewSet

router = DefaultRouter()
router.register("categories", InventoryCategoryViewSet, basename="inventory-category")
router.register("items", InventoryItemViewSet, basename="inventory-item")
router.register("transactions", InventoryTransactionViewSet, basename="inventory-transaction")

app_name = "inventory"

urlpatterns = router.urls
