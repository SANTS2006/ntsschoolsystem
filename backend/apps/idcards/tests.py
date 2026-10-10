import datetime

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.tenants.context import set_current_school_id
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

from .models import IdCard

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _tenant_context_cleanup():
    yield
    set_current_school_id(None)


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _world(role_slug="school-administrator"):
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug=role_slug))
    school_class = SchoolClassFactory(school=school)
    student = StudentFactory(school=school, current_class=school_class, status="active", date_of_birth=datetime.date(2012, 3, 4))
    return school, admin, school_class, student


def _issue(api_client, holder_type, holder_id, **extra):
    return api_client.post(
        "/api/v1/idcards/issue/", {"holder_type": holder_type, "holder_id": str(holder_id), **extra}, format="json"
    )


class TestIssue:
    def test_issue_student_card_snapshots_details_and_qr(self, api_client):
        school, admin, school_class, student = _world()
        _login(api_client, admin)

        response = _issue(api_client, "student", student.id)

        assert response.status_code == 201, response.data
        card = response.data["card"]
        assert card["card_number"].startswith("STU-")
        assert card["payload"]["name"] == student.full_name
        assert card["payload"]["number"] == student.admission_number
        assert card["payload"]["class"] == school_class.name
        assert card["qr_svg"].startswith("<svg")
        assert card["verify_url"].endswith(f"/verify-card/{IdCard.unscoped_objects.get(pk=card['id']).verify_token}")
        assert card["is_valid"] is True

    def test_qr_carries_only_a_verification_url_not_personal_data(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        card = _issue(api_client, "student", student.id).data["card"]
        assert student.admission_number not in card["qr_svg"]
        assert "2012" not in card["qr_svg"]

    def test_issue_staff_card(self, api_client):
        school, admin, _, _ = _world()
        staff = StaffFactory(school=school, staff_id="T-001")
        _login(api_client, admin)

        response = _issue(api_client, "staff", staff.id)

        assert response.status_code == 201, response.data
        assert response.data["card"]["card_number"].startswith("STF-")
        assert response.data["card"]["payload"]["number"] == "T-001"

    def test_reissue_replaces_the_previous_card(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        first = _issue(api_client, "student", student.id).data["card"]
        second = _issue(api_client, "student", student.id).data["card"]

        assert first["id"] != second["id"]
        assert IdCard.unscoped_objects.get(pk=first["id"]).status == IdCard.Status.REPLACED
        assert IdCard.unscoped_objects.filter(student=student, status=IdCard.Status.ACTIVE).count() == 1

    def test_withdrawn_student_cannot_get_a_card(self, api_client):
        _, admin, _, student = _world()
        student.status = "withdrawn"
        student.save()
        _login(api_client, admin)
        assert _issue(api_client, "student", student.id).status_code == 400

    def test_teacher_without_permission_is_forbidden(self, api_client):
        _, teacher, _, student = _world(role_slug="teacher")
        _login(api_client, teacher)
        assert _issue(api_client, "student", student.id).status_code == 403

    def test_cannot_issue_for_another_schools_student(self, api_client):
        _, admin, _, _ = _world()
        other_student = StudentFactory(school=SchoolFactory(), status="active")
        _login(api_client, admin)
        assert _issue(api_client, "student", other_student.id).status_code == 404


class TestBulkAndRevoke:
    def test_bulk_issue_skips_students_who_already_have_a_card(self, api_client):
        school, admin, school_class, student = _world()
        second = StudentFactory(school=school, current_class=school_class, status="active")
        other_class_student = StudentFactory(school=school, current_class=SchoolClassFactory(school=school), status="active")
        _login(api_client, admin)
        _issue(api_client, "student", student.id)

        response = api_client.post(
            "/api/v1/idcards/bulk-issue/",
            {"holder_type": "student", "school_class": str(school_class.id)},
            format="json",
        )

        assert response.status_code == 200, response.data
        assert response.data["issued"] == 1
        assert IdCard.unscoped_objects.filter(student=second, status="active").exists()
        assert not IdCard.unscoped_objects.filter(student=other_class_student).exists()

    def test_bulk_issue_for_staff(self, api_client):
        school, admin, _, _ = _world()
        StaffFactory(school=school)
        StaffFactory(school=school)
        _login(api_client, admin)
        response = api_client.post("/api/v1/idcards/bulk-issue/", {"holder_type": "staff"}, format="json")
        assert response.status_code == 200, response.data
        assert response.data["issued"] == 2

    def test_revoke(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        card = _issue(api_client, "student", student.id).data["card"]

        response = api_client.post(f"/api/v1/idcards/{card['id']}/revoke/")
        assert response.status_code == 200, response.data
        assert response.data["card"]["status"] == "revoked"
        assert api_client.post(f"/api/v1/idcards/{card['id']}/revoke/").status_code == 400

    def test_list_is_tenant_scoped(self, api_client):
        _, admin, _, student = _world()
        other_school = SchoolFactory()
        other_student = StudentFactory(school=other_school, status="active")
        from . import services

        set_current_school_id(other_school.id)
        services.issue_card(other_student)
        set_current_school_id(None)
        _login(api_client, admin)
        _issue(api_client, "student", student.id)

        response = api_client.get("/api/v1/idcards/")
        assert response.status_code == 200
        numbers = [row["holder_name"] for row in response.data["results"]]
        assert numbers == [student.full_name]


class TestPublicVerify:
    def test_valid_card_returns_minimal_identity_only(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        token = IdCard.unscoped_objects.get(pk=_issue(api_client, "student", student.id).data["card"]["id"]).verify_token
        api_client.logout()

        response = api_client.get(f"/api/v1/idcards/verify/{token}/")

        assert response.status_code == 200, response.data
        card = response.data["card"]
        assert card["valid"] is True
        assert card["name"] == student.full_name
        assert "date_of_birth" not in card and "address" not in card and "payload" not in card

    def test_revoked_card_reports_invalid(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        card = _issue(api_client, "student", student.id).data["card"]
        api_client.post(f"/api/v1/idcards/{card['id']}/revoke/")
        token = IdCard.unscoped_objects.get(pk=card["id"]).verify_token
        api_client.logout()

        data = api_client.get(f"/api/v1/idcards/verify/{token}/").data["card"]
        assert data["valid"] is False
        assert data["reason"] == "Revoked"

    def test_expired_card_reports_invalid(self, api_client):
        _, admin, _, student = _world()
        _login(api_client, admin)
        yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        card = _issue(api_client, "student", student.id, expires_at=yesterday).data["card"]
        token = IdCard.unscoped_objects.get(pk=card["id"]).verify_token
        api_client.logout()

        data = api_client.get(f"/api/v1/idcards/verify/{token}/").data["card"]
        assert data["valid"] is False
        assert data["reason"] == "Expired"

    def test_unknown_token_is_404(self, api_client):
        assert api_client.get("/api/v1/idcards/verify/not-a-real-token/").status_code == 404


class TestMine:
    def test_student_sees_own_active_card(self, api_client):
        school, admin, _, student = _world()
        student.user = UserFactory(school=school)
        student.save()
        from . import services

        set_current_school_id(school.id)
        services.issue_card(student)
        set_current_school_id(None)
        _login(api_client, student.user)

        response = api_client.get("/api/v1/idcards/mine/")
        assert response.status_code == 200, response.data
        assert response.data["card"]["holder_name"] == student.full_name

    def test_no_card_returns_null(self, api_client):
        school, admin, _, _ = _world()
        _login(api_client, admin)
        assert api_client.get("/api/v1/idcards/mine/").data["card"] is None
