from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AddressableStaffView, ComplaintResponseViewSet, ComplaintViewSet

router = DefaultRouter()
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("complaint-responses", ComplaintResponseViewSet, basename="complaint-response")

app_name = "complaints"

# The static path is listed before the router's bare ""-registered {pk} detail route so it
# always matches first — the same DRF routing-collision avoidance documented in Phase G/J.
urlpatterns = [
    path("complaints/addressable-staff/", AddressableStaffView.as_view(), name="addressable-staff"),
] + router.urls
