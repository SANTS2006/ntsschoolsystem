from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet

router = DefaultRouter()
router.register("", NotificationViewSet, basename="notification")

app_name = "notifications"

urlpatterns = router.urls
