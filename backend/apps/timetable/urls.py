from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MyTimetableView, PeriodViewSet, RoomViewSet, TimetableEntryViewSet

router = DefaultRouter()
router.register("rooms", RoomViewSet, basename="room")
router.register("periods", PeriodViewSet, basename="period")
router.register("entries", TimetableEntryViewSet, basename="timetable-entry")

app_name = "timetable"

urlpatterns = [
    path("me/", MyTimetableView.as_view(), name="my-timetable"),
] + router.urls
