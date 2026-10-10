from decimal import Decimal

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    InvoiceFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = "/api/v1/reports/dashboard/me/"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


def _person(school, slug):
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


@pytest.fixture
def school():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    return school


@pytest.mark.parametrize("slug", ["principal", "school-administrator", "accountant", "exams-director"])
def test_every_staff_role_gets_its_own_dashboard(api_client, school, slug):
    user = _person(school, slug)
    _login(api_client, user)
    response = api_client.get(URL)
    assert response.status_code == 200, response.data
    data = response.data["dashboard"]
    assert data["role"] == slug
    assert data["kpis"], "a role with the permissions should see key figures"


def test_teacher_dashboard_uses_their_staff_record(api_client, school):
    staff = StaffFactory(school=school)
    assign_role(user=staff.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    _login(api_client, staff.user)
    data = api_client.get(URL).data["dashboard"]
    assert data["role"] == "teacher"
    assert {k["key"] for k in data["kpis"]} >= {"classes", "lessons", "marking"}


def test_student_dashboard_is_their_own(api_client, school):
    student = StudentFactory(school=school)
    student.user = _person(school, "student")
    student.save(update_fields=["user"])
    _login(api_client, student.user)
    data = api_client.get(URL).data["dashboard"]
    assert data["role"] == "student"
    assert {k["key"] for k in data["kpis"]} == {"attendance", "average", "pending", "exams"}


def test_finance_numbers_ignore_other_schools(api_client, school):
    other = SchoolFactory()
    seed_default_roles_for_school(other)
    InvoiceFactory(school=other, total=Decimal("900"), balance=Decimal("900"))
    mine = InvoiceFactory(school=school, total=Decimal("100"), balance=Decimal("100"))
    _login(api_client, _person(school, "accountant"))
    kpis = {k["key"]: k["value"] for k in api_client.get(URL).data["dashboard"]["kpis"]}
    assert kpis["billed"] == float(mine.total) == 100.0
    assert kpis["outstanding"] == 100.0


def test_role_without_finance_permission_gets_no_finance_figures(api_client, school):
    _login(api_client, _person(school, "teacher"))
    # a teacher's dashboard has no money in it, whatever the school has billed
    InvoiceFactory(school=school, total=Decimal("100"), balance=Decimal("100"))
    keys = {k["key"] for k in api_client.get(URL).data["dashboard"]["kpis"]}
    assert not keys & {"billed", "outstanding", "collected"}


def test_dashboard_requires_sign_in(api_client):
    assert api_client.get(URL).status_code in (401, 403)


# ---- filters and term comparison -------------------------------------------------------------------


def _two_terms(school):
    from datetime import date

    from tests.factories import AcademicYearFactory, TermFactory

    year = AcademicYearFactory(school=school)
    t1 = TermFactory(school=school, academic_year=year, name="Term 1", sequence=1, start_date=date(2025, 9, 1), end_date=date(2025, 12, 15))
    t2 = TermFactory(school=school, academic_year=year, name="Term 2", sequence=2, start_date=date(2026, 1, 5), end_date=date(2026, 4, 10), is_current=True)
    return t1, t2


def test_comparison_sets_the_term_against_the_one_before(api_client, school):
    t1, t2 = _two_terms(school)
    InvoiceFactory(school=school, term=t1, total=Decimal("100"), amount_paid=Decimal("40"), balance=Decimal("60"))
    InvoiceFactory(school=school, term=t2, total=Decimal("100"), amount_paid=Decimal("80"), balance=Decimal("20"))
    _login(api_client, _person(school, "accountant"))
    data = api_client.get(URL).data["dashboard"]  # no term chosen -> the current term (Term 2) vs Term 1
    block = data["comparison"]
    assert block["current"]["name"] == "Term 2" and block["previous"]["name"] == "Term 1"
    rate = next(r for r in block["rows"] if r["key"] == "collection")
    assert (rate["current"], rate["previous"], rate["delta"]) == (80.0, 40.0, 40.0)
    assert rate["delta_pct"] == 100.0
    # numbers must travel as numbers (a Decimal would be sent as a string and not format as a percentage)
    assert all(type(rate[k]) is float for k in ("current", "previous", "delta", "delta_pct"))


def test_term_filter_narrows_the_finance_figures(api_client, school):
    t1, t2 = _two_terms(school)
    InvoiceFactory(school=school, term=t1, total=Decimal("100"), balance=Decimal("100"))
    InvoiceFactory(school=school, term=t2, total=Decimal("300"), balance=Decimal("300"))
    _login(api_client, _person(school, "accountant"))
    kpis = {k["key"]: k["value"] for k in api_client.get(URL, {"term": str(t1.id)}).data["dashboard"]["kpis"]}
    assert kpis["billed"] == 100.0
    assert kpis["outstanding"] == 100.0


def test_another_schools_term_id_is_ignored(api_client, school):
    other = SchoolFactory()
    seed_default_roles_for_school(other)
    foreign_term, _ = _two_terms(other)
    InvoiceFactory(school=school, total=Decimal("100"), balance=Decimal("100"))
    _login(api_client, _person(school, "accountant"))
    data = api_client.get(URL, {"term": str(foreign_term.id), "school_class": "not-a-uuid"}).data["dashboard"]
    assert data["filters"]["applied"] == {"term": None, "school_class": None}
    assert {k["key"]: k["value"] for k in data["kpis"]}["billed"] == 100.0


def test_students_and_teachers_get_no_filters(api_client, school):
    staff = StaffFactory(school=school)
    assign_role(user=staff.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    _login(api_client, staff.user)
    data = api_client.get(URL).data["dashboard"]
    assert data["filters"]["options"] is None and data["comparison"] is None


def test_a_role_the_school_created_gets_a_dashboard_from_its_permissions(api_client, school):
    from apps.authorization.models import Permission, Role, RolePermission

    role = Role.unscoped_objects.create(school=school, name="Matron", slug="matron", is_system=False)
    for code in ("library.view", "hostel.view"):
        RolePermission.unscoped_objects.create(school=school, role=role, permission=Permission.objects.get(code=code))
    user = UserFactory(school=school)
    assign_role(user=user, role=role)
    _login(api_client, user)
    data = api_client.get(URL).data["dashboard"]
    assert data["role"] == "custom" and data["title"] == "Matron overview"
    keys = {k["key"] for k in data["kpis"]}
    assert {"books", "loans", "reservations", "hostel"} <= keys
    assert not keys & {"students", "outstanding", "staff"}  # nothing it has no permission for
    # give it another permission and the dashboard grows by itself
    RolePermission.unscoped_objects.create(school=school, role=role, permission=Permission.objects.get(code="students.view"))
    user.__dict__.pop("_permission_codes_cache", None)
    _login(api_client, user)
    assert "students" in {k["key"] for k in api_client.get(URL).data["dashboard"]["kpis"]}
