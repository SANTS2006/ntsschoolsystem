from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.enquiries.admin_views import EnquiryAdminViewSet

from .views import MaintenanceView, PlatformAdminViewSet, PlatformStatsView

router = DefaultRouter()
router.register("admins", PlatformAdminViewSet, basename="platform-admin")
router.register("enquiries", EnquiryAdminViewSet, basename="platform-enquiry")

app_name = "platform_admin"

urlpatterns = [
    path("stats/", PlatformStatsView.as_view(), name="platform-stats"),
    path("maintenance/", MaintenanceView.as_view(), name="platform-maintenance"),
] + router.urls
