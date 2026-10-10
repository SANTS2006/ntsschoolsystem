from rest_framework.routers import DefaultRouter

from .views import PermissionViewSet, RoleViewSet

router = DefaultRouter()
router.register("permissions", PermissionViewSet, basename="permission")
router.register("", RoleViewSet, basename="role")

app_name = "authorization"

urlpatterns = router.urls
