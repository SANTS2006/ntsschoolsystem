from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import LiveSessionRecipientViewSet, LiveSessionViewSet, MyLiveSessionsView

router = DefaultRouter()
router.register("live-sessions", LiveSessionViewSet, basename="live-session")
router.register("live-session-recipients", LiveSessionRecipientViewSet, basename="live-session-recipient")

app_name = "live_sessions"

urlpatterns = [
    path("my-live-sessions/", MyLiveSessionsView.as_view(), name="my-live-sessions"),
] + router.urls
