import pytest

from tests.factories import SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/v1/auth/google/"


@pytest.fixture(autouse=True)
def _google_on(settings):
    settings.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"


def _claims(email, verified=True):
    return {"iss": "https://accounts.google.com", "email": email, "email_verified": verified}


def _patch(monkeypatch, claims):
    monkeypatch.setattr("apps.authentication.google.verify_credential", lambda credential: claims)


class TestGoogleSignIn:
    def test_config_says_whether_the_button_is_on(self, api_client, settings):
        assert api_client.get("/api/v1/auth/google/config/").data["enabled"] is True
        settings.GOOGLE_CLIENT_ID = ""
        assert api_client.get("/api/v1/auth/google/config/").data["enabled"] is False

    def test_an_existing_user_signs_in_with_their_google_email(self, api_client, monkeypatch):
        user = UserFactory(school=SchoolFactory(), email="ama@example.com")
        _patch(monkeypatch, _claims("Ama@Example.com"))
        response = api_client.post(URL, {"credential": "x"}, format="json")
        assert response.status_code == 200, response.data
        assert response.data["user"]["email"] == user.email
        assert api_client.get("/api/v1/auth/me/").status_code == 200

    def test_no_account_is_never_created(self, api_client, monkeypatch):
        from apps.users.models import User

        _patch(monkeypatch, _claims("stranger@example.com"))
        response = api_client.post(URL, {"credential": "x"}, format="json")
        assert response.status_code == 403 and response.data["code"] == "GOOGLE_NO_ACCOUNT"
        assert not User.objects.filter(email="stranger@example.com").exists()

    def test_an_invalid_token_is_refused(self, api_client, monkeypatch):
        _patch(monkeypatch, None)
        assert api_client.post(URL, {"credential": "bad"}, format="json").status_code == 401

    def test_google_sign_in_retires_the_default_password(self, api_client, monkeypatch):
        user = UserFactory(school=SchoolFactory(), email="kai@example.com", must_change_password=True)
        _patch(monkeypatch, _claims("kai@example.com"))
        assert api_client.post(URL, {"credential": "x"}, format="json").status_code == 200
        user.refresh_from_db()
        assert user.must_change_password is False
        assert not user.check_password("TestPass123!secure")

    def test_a_revoked_student_cannot_use_google(self, api_client, monkeypatch):
        from apps.students.services import provision_student_account
        from tests.factories import StudentFactory

        school = SchoolFactory()
        student = StudentFactory(school=school, email="stu@example.com")
        provision_student_account(student)
        student.access_revoked = True
        student.save(update_fields=["access_revoked"])
        _patch(monkeypatch, _claims("stu@example.com"))
        response = api_client.post(URL, {"credential": "x"}, format="json")
        assert response.status_code == 403 and response.data["code"] == "ACCESS_REVOKED"

    def test_the_wrong_school_page_is_refused(self, api_client, monkeypatch, settings):
        settings.LOGIN_SCOPE_ENFORCEMENT = True
        school = SchoolFactory(slug="aaa")
        SchoolFactory(slug="bbb")
        UserFactory(school=school, email="x@example.com")
        _patch(monkeypatch, _claims("x@example.com"))
        response = api_client.post(URL, {"credential": "x", "school_slug": "bbb"}, format="json")
        assert response.status_code == 403
