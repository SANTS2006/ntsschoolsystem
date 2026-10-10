from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet

router = DefaultRouter()
router.register("", AuditLogViewSet, basename="audit-log")

app_name = "audit"

urlpatterns = router.urls
