import csv

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView
from apps.tenants.services import get_current_school

from . import services
from .serializers import AcademicPerformanceQuerySerializer, AttendanceReportQuerySerializer, FinanceReportQuerySerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _is_csv_request(request):
    # Deliberately NOT "format" — DRF reserves that query param name for its own
    # content negotiation (settings.URL_FORMAT_OVERRIDE), and since only JSONRenderer
    # is registered, any value other than "json" makes DRF's content negotiation raise
    # Http404 before this view even runs. "export" avoids the collision entirely.
    return request.query_params.get("export") == "csv"


def _csv_response(filename, header, rows):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(header)
    writer.writerows(rows)
    return response


class _ReportView(TenantScopedAPIView):
    """
    Every report is `reports.view` to see as JSON, `reports.export` to
    download as CSV (`?export=csv`) — one endpoint, two permission levels,
    rather than a duplicate endpoint per format.
    """

    def get_permissions(self):
        code = "reports.export" if _is_csv_request(self.request) else "reports.view"
        return [require_permission(code)()]


class DashboardOverviewView(TenantScopedAPIView):
    """
    Deliberately NOT a `_ReportView` (no blanket `reports.view` gate) — every logged-in school
    user should be able to load the dashboard at all, even a teacher or a self-service-only
    account with none of the six `reports.*`/domain `.view` permissions. `services.
    dashboard_overview()` does its own per-field permission check instead, so the response
    simply omits whatever this particular user can't see.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return _ok(dashboard=services.dashboard_overview(get_current_school(), request.user))


class RoleDashboardView(TenantScopedAPIView):
    """The signed-in person's own dashboard — which one is decided server-side from the role they are working as
    (never from a client-supplied role), and every section inside it is gated by that person's own permissions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .dashboards import build_role_dashboard

        return _ok(dashboard=build_role_dashboard(get_current_school(), request.user, request.query_params))


class EnrollmentReportView(_ReportView):
    def get(self, request):
        data = services.enrollment_summary(get_current_school())
        if _is_csv_request(request):
            rows = [(row["current_class__name"] or "Unassigned", row["count"]) for row in data["by_class"]]
            return _csv_response("enrollment_report.csv", ["class", "student_count"], rows)
        return _ok(report=data)


class AttendanceReportView(_ReportView):
    def get(self, request):
        query = AttendanceReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = services.attendance_summary(
            get_current_school(),
            start_date=query.validated_data["start_date"],
            end_date=query.validated_data["end_date"],
            school_class_id=query.validated_data.get("school_class"),
        )
        if _is_csv_request(request):
            rows = [(row["status"], row["count"]) for row in data["by_status"]]
            return _csv_response("attendance_report.csv", ["status", "count"], rows)
        return _ok(report=data)


class AcademicPerformanceReportView(_ReportView):
    def get(self, request):
        query = AcademicPerformanceQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = services.academic_performance_summary(get_current_school(), exam_id=query.validated_data["exam_id"])
        if _is_csv_request(request):
            rows = [
                (row["exam_schedule__subject__name"], row["average_score"], row["result_count"])
                for row in data["by_subject"]
            ]
            return _csv_response("academic_performance_report.csv", ["subject", "average_score", "result_count"], rows)
        return _ok(report=data)


class FinanceReportView(_ReportView):
    def get(self, request):
        query = FinanceReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = services.finance_summary(
            get_current_school(), academic_year_id=query.validated_data.get("academic_year_id")
        )
        if _is_csv_request(request):
            rows = [(row["status"], row["count"]) for row in data["by_status"]]
            return _csv_response("finance_report.csv", ["status", "count"], rows)
        return _ok(report=data)
