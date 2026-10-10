from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MyStaffAttendanceView,
    MyStudentAttendanceView,
    StaffAttendanceViewSet,
    StudentAttendanceViewSet,
)

router = DefaultRouter()
router.register("students", StudentAttendanceViewSet, basename="student-attendance")
router.register("staff", StaffAttendanceViewSet, basename="staff-attendance")

app_name = "attendance"

urlpatterns = [
    path("my-attendance/", MyStudentAttendanceView.as_view(), name="my-attendance"),
    path("my-staff-attendance/", MyStaffAttendanceView.as_view(), name="my-staff-attendance"),
] + router.urls
