from datetime import date
from decimal import Decimal

import pytest

from apps.authorization.models import Permission, Role, RolePermission
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.examinations.models import Result
from apps.inventory.models import InventoryItem
from apps.students.models import Student
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    ExamScheduleFactory,
    InventoryItemFactory,
    InvoiceFactory,
    ResultFactory,
    SchoolFactory,
    StudentAttendanceFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _school_admin():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    school_admin = UserFactory(school=school)
    assign_role(user=school_admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, school_admin


def _user_with_only(school, *, codes):
    """A custom role granting exactly the given permission codes — used to test the
    reports.view/reports.export distinction, which no seeded role currently exercises
    (the School Administrator gets the full `reports.` prefix)."""
    role = Role.objects.create(school=school, slug="report-viewer-only", name="Report Viewer Only")
    for code in codes:
        permission = Permission.objects.get(code=code)
        RolePermission.objects.create(school=school, role=role, permission=permission)
    user = UserFactory(school=school)
    assign_role(user=user, role=role)
    return user


class TestReportsPermissions:
    def test_teacher_dashboard_omits_fields_they_cannot_view(self, api_client):
        school, _ = _school_admin()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/reports/dashboard/")
        assert response.status_code == 200
        dashboard = response.data["dashboard"]
        assert "active_students" in dashboard  # teachers hold students.view
        assert "active_staff" not in dashboard  # ...but not staff.view

    def test_view_only_role_can_see_json_but_not_export_csv(self, api_client):
        school, _ = _school_admin()
        viewer = _user_with_only(school, codes=["reports.view"])
        _login(api_client, viewer)

        json_response = api_client.get("/api/v1/reports/enrollment/")
        assert json_response.status_code == 200

        csv_response = api_client.get("/api/v1/reports/enrollment/?export=csv")
        assert csv_response.status_code == 403

    def test_school_admin_can_export_csv(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/enrollment/?export=csv")
        assert response.status_code == 200
        assert response["Content-Type"] == "text/csv"


class TestDashboardOverview:
    def test_aggregates_across_domains(self, api_client):
        school, school_admin = _school_admin()
        StudentFactory(school=school, status=Student.Status.ACTIVE)
        StudentFactory(school=school, status=Student.Status.ACTIVE)
        StudentFactory(school=school, status=Student.Status.GRADUATED)
        InventoryItemFactory(school=school, quantity_in_stock=2, reorder_level=10, is_active=True)
        InventoryItemFactory(school=school, quantity_in_stock=100, reorder_level=10, is_active=True)
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/dashboard/")

        assert response.status_code == 200
        dashboard = response.data["dashboard"]
        assert dashboard["active_students"] == 2
        assert dashboard["low_stock_items"] == 1


class TestEnrollmentReport:
    def test_counts_by_status_and_class(self, api_client):
        school, school_admin = _school_admin()
        StudentFactory(school=school, status=Student.Status.ACTIVE)
        StudentFactory(school=school, status=Student.Status.ACTIVE)
        StudentFactory(school=school, status=Student.Status.WITHDRAWN)
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/enrollment/")

        assert response.status_code == 200
        report = response.data["report"]
        assert report["total_students"] == 3
        status_counts = {row["status"]: row["count"] for row in report["by_status"]}
        assert status_counts["active"] == 2
        assert status_counts["withdrawn"] == 1


class TestAttendanceReport:
    def test_requires_date_range(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/attendance/")
        assert response.status_code == 400

    def test_rejects_end_date_before_start_date(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.get(
            "/api/v1/reports/attendance/?start_date=2026-02-10&end_date=2026-02-01"
        )
        assert response.status_code == 400

    def test_computes_attendance_rate(self, api_client):
        school, school_admin = _school_admin()
        student_a = StudentFactory(school=school)
        student_b = StudentFactory(school=school)
        StudentAttendanceFactory(school=school, student=student_a, date=date(2026, 2, 5), status="present")
        StudentAttendanceFactory(school=school, student=student_b, date=date(2026, 2, 5), status="absent")
        _login(api_client, school_admin)

        response = api_client.get(
            "/api/v1/reports/attendance/?start_date=2026-02-01&end_date=2026-02-10"
        )

        assert response.status_code == 200
        report = response.data["report"]
        assert report["total_records"] == 2
        assert report["attendance_rate_percent"] == 50.0


class TestAcademicPerformanceReport:
    def test_requires_exam_id(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/academic-performance/")
        assert response.status_code == 400

    def test_only_published_and_locked_results_count(self, api_client):
        school, school_admin = _school_admin()
        schedule = ExamScheduleFactory(school=school)
        published = ResultFactory(
            school=school, exam_schedule=schedule, score=80, status=Result.Status.PUBLISHED
        )
        ResultFactory(school=school, exam_schedule=schedule, score=20, status=Result.Status.DRAFT)
        _login(api_client, school_admin)

        response = api_client.get(
            f"/api/v1/reports/academic-performance/?exam_id={schedule.exam_id}"
        )

        assert response.status_code == 200
        report = response.data["report"]
        assert report["total_results"] == 1
        assert float(report["overall_average_score"]) == float(published.score)


class TestFinanceReport:
    def test_totals_and_overdue(self, api_client):
        school, school_admin = _school_admin()
        InvoiceFactory(
            school=school,
            total="100.00",
            amount_paid="40.00",
            balance="60.00",
            due_date=date(2020, 1, 1),  # long overdue
        )
        InvoiceFactory(school=school, total="50.00", amount_paid="50.00", balance="0.00")
        _login(api_client, school_admin)

        response = api_client.get("/api/v1/reports/finance/")

        assert response.status_code == 200
        report = response.data["report"]
        assert report["total_invoiced"] == Decimal("150.00")
        assert report["total_collected"] == Decimal("90.00")
        assert report["total_outstanding"] == Decimal("60.00")
        assert report["overdue_count"] == 1


class TestReportsTenantIsolation:
    def test_dashboard_only_reflects_own_school(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        StudentFactory(school=school_b, status=Student.Status.ACTIVE)
        StudentFactory(school=school_a, status=Student.Status.ACTIVE)

        _login(api_client, school_admin_a)
        response = api_client.get("/api/v1/reports/dashboard/")

        assert response.status_code == 200
        assert response.data["dashboard"]["active_students"] == 1
