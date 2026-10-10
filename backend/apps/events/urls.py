from rest_framework.routers import DefaultRouter

from .views import EventMediaViewSet, EventRecipientViewSet, EventViewSet

router = DefaultRouter()
router.register("events", EventViewSet, basename="event")
router.register("event-recipients", EventRecipientViewSet, basename="event-recipient")
router.register("event-media", EventMediaViewSet, basename="event-media")

app_name = "events"

urlpatterns = router.urls
