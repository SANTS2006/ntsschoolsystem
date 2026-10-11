from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import NotificationViewSet, PushKeyView, PushSubscribeView

router = DefaultRouter()
router.register("", NotificationViewSet, basename="notification")

app_name = "notifications"

urlpatterns = [
    path("push/key/", PushKeyView.as_view(), name="push-key"),
    path("push/subscription/", PushSubscribeView.as_view(), name="push-subscription"),
] + router.urls
