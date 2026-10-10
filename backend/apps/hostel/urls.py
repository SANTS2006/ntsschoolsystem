from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BedViewSet, HostelAllocationViewSet, HostelViewSet, MyHostelView, RoomViewSet

router = DefaultRouter()
router.register("hostels", HostelViewSet, basename="hostel")
router.register("rooms", RoomViewSet, basename="hostel-room")
router.register("beds", BedViewSet, basename="hostel-bed")
router.register("allocations", HostelAllocationViewSet, basename="hostel-allocation")

app_name = "hostel"

urlpatterns = [path("my/", MyHostelView.as_view(), name="my-hostel")] + router.urls
