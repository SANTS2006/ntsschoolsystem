from django.urls import path

from .views import (
    AcademicPerformanceReportView,
    AttendanceReportView,
    DashboardOverviewView,
    EnrollmentReportView,
    FinanceReportView,
    RoleDashboardView,
)

app_name = "reports"

urlpatterns = [
    path("dashboard/me/", RoleDashboardView.as_view(), name="role-dashboard"),
    path("dashboard/", DashboardOverviewView.as_view(), name="dashboard"),
    path("enrollment/", EnrollmentReportView.as_view(), name="enrollment"),
    path("attendance/", AttendanceReportView.as_view(), name="attendance"),
    path("academic-performance/", AcademicPerformanceReportView.as_view(), name="academic-performance"),
    path("finance/", FinanceReportView.as_view(), name="finance"),
]
