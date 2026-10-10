from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MyTransportView,
    RouteViewSet,
    StopViewSet,
    StudentTransportAssignmentViewSet,
    VehicleMaintenanceViewSet,
    VehicleViewSet,
)

router = DefaultRouter()
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("routes", RouteViewSet, basename="route")
router.register("stops", StopViewSet, basename="stop")
router.register("maintenance", VehicleMaintenanceViewSet, basename="vehicle-maintenance")
router.register("assignments", StudentTransportAssignmentViewSet, basename="transport-assignment")

app_name = "transport"

urlpatterns = [
    path("my-transport/", MyTransportView.as_view(), name="my-transport"),
] + router.urls
