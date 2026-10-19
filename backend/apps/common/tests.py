import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.common.validators import validate_image_file, validate_upload_file
from tests.factories import DEFAULT_TEST_PASSWORD, UserFactory

pytestmark = pytest.mark.django_db


class TestSecurityHeaders:
    def test_api_responses_are_never_cacheable_and_carry_a_locked_down_csp(self, api_client):
        response = api_client.get("/api/v1/health/")

        assert "no-store" in response["Cache-Control"]
        assert "default-src 'none'" in response["Content-Security-Policy"]
        assert "frame-ancestors 'none'" in response["Content-Security-Policy"]
        assert response["X-Content-Type-Options"] == "nosniff"
        assert response["X-Frame-Options"] == "DENY"
        assert "geolocation=()" in response["Permissions-Policy"]

    def test_authenticated_api_responses_are_also_no_store(self, api_client):
        user = UserFactory()
        api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")
        response = api_client.get("/api/v1/auth/me/")

        assert response.status_code == 200
        assert "no-store" in response["Cache-Control"]


class TestRequestSizeLimit:
    def test_oversized_json_body_is_rejected_before_parsing(self, api_client):
        huge = {"email": "a@example.test", "password": "x" * (3 * 1024 * 1024)}
        response = api_client.post("/api/v1/auth/login/", huge, format="json")

        assert response.status_code == 413
        assert response.json()["code"] == "REQUEST_TOO_LARGE"


class TestUploadContentSniffing:
    @pytest.mark.parametrize(
        "name,content",
        [
            ("report.pdf", bytes.fromhex("4d5a9000")),  # Windows executable renamed to .pdf
            ("photo.png", b"<svg onload=alert(1)>"),
            ("notes.txt", b"#!/bin/sh\nrm -rf /"),
            ("scan.jpg", b"<html><script>steal()</script>"),
            ("data.csv", bytes.fromhex("7f454c46")),  # ELF binary
        ],
    )
    def test_disguised_executables_and_markup_are_rejected(self, name, content):
        with pytest.raises(ValidationError):
            validate_upload_file(SimpleUploadedFile(name, content))

    def test_ordinary_files_still_pass_and_stream_position_is_preserved(self):
        upload = SimpleUploadedFile("policy.pdf", b"%PDF-1.4 ordinary document")
        validate_upload_file(upload)
        assert upload.read() == b"%PDF-1.4 ordinary document"

    def test_image_validator_also_sniffs(self):
        with pytest.raises(ValidationError):
            validate_image_file(SimpleUploadedFile("avatar.png", b"<svg/onload=1>"))


class TestClientIp:
    def _request(self, forwarded_for, remote="10.0.0.9"):
        from django.test import RequestFactory

        request = RequestFactory().get("/")
        request.META["REMOTE_ADDR"] = remote
        if forwarded_for is not None:
            request.META["HTTP_X_FORWARDED_FOR"] = forwarded_for
        return request

    def test_forged_forwarded_for_is_ignored_when_no_proxy_is_trusted(self, settings):
        from apps.common.net import get_client_ip

        settings.TRUSTED_PROXY_COUNT = 0
        assert get_client_ip(self._request("1.2.3.4")) == "10.0.0.9"

    def test_only_the_entry_our_own_proxy_appended_is_trusted(self, settings):
        from apps.common.net import get_client_ip

        settings.TRUSTED_PROXY_COUNT = 1
        # The attacker sent "6.6.6.6"; our proxy appended the address it actually saw.
        assert get_client_ip(self._request("6.6.6.6, 203.0.113.7")) == "203.0.113.7"

    def test_falls_back_to_remote_addr_without_the_header(self, settings):
        from apps.common.net import get_client_ip

        settings.TRUSTED_PROXY_COUNT = 1
        assert get_client_ip(self._request(None)) == "10.0.0.9"


class TestSingleOriginSpaServing:
    def _dist(self, tmp_path, settings):
        (tmp_path / "index.html").write_text("<!doctype html><title>NTS</title>")
        settings.FRONTEND_DIST_DIR = tmp_path

    def test_client_side_routes_get_the_html_shell_with_a_strict_csp(self, api_client, tmp_path, settings):
        self._dist(tmp_path, settings)
        response = api_client.get("/students/123/edit")

        assert response.status_code == 200
        assert response["Content-Type"].startswith("text/html")
        csp = response["Content-Security-Policy"]
        assert "script-src 'self'" in csp and "unsafe-inline'" not in csp.split("style-src-attr")[0]
        assert "frame-ancestors 'none'" in csp
        # uploaded files (Cloudinary) must be fetchable for downloads and embeddable for the PDF viewer
        assert "https://res.cloudinary.com" in csp.split("connect-src")[1].split(";")[0]
        assert "https://res.cloudinary.com" in csp.split("frame-src")[1].split(";")[0]
        assert "manifest-src 'self'" in csp and "worker-src 'self'" in csp
        assert "no-cache" in response["Cache-Control"]
        assert "camera=(self" in response["Permissions-Policy"]

    def test_unknown_api_paths_stay_a_real_404_not_the_html_shell(self, api_client, tmp_path, settings):
        self._dist(tmp_path, settings)
        response = api_client.get("/api/v1/definitely-not-a-route/")

        assert response.status_code == 404
        assert not response["Content-Type"].startswith("text/html")

    def test_non_get_requests_to_spa_paths_are_rejected(self, api_client, tmp_path, settings):
        self._dist(tmp_path, settings)
        assert api_client.post("/students/123", {}, format="json").status_code == 404


class TestExportMixin:
    """Exercises `ExportMixin` (apps.common.views) against a real, already-registered ViewSet
    (Rooms, under the Timetable module) rather than a throwaway test-only view — the mixin is
    meant to work identically for every ViewSet built on TenantScopedModelViewSet with zero
    per-app code, so proving it against one real one is a faithful test of all of them."""

    def _principal(self):
        from apps.authorization.models import Role
        from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
        from tests.factories import SchoolFactory, UserFactory

        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        return school, principal

    def _login(self, api_client, user):
        from tests.factories import DEFAULT_TEST_PASSWORD

        return api_client.post(
            "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
        )

    @pytest.mark.django_db
    def test_export_csv_streams_every_matching_row_with_a_header(self, api_client):
        from tests.factories import RoomFactory

        school, principal = self._principal()
        RoomFactory(school=school, name="Lab 1", capacity=20)
        RoomFactory(school=school, name="Lab 2", capacity=25)
        self._login(api_client, principal)

        response = api_client.get("/api/v1/timetable/rooms/?export=csv")

        assert response.status_code == 200
        assert response["Content-Type"] == "text/csv"
        assert response["Content-Disposition"] == 'attachment; filename="room_list.csv"'
        body = b"".join(response.streaming_content).decode()
        rows = body.strip().splitlines()
        assert rows[0] == "id,name,capacity,created_at,updated_at"
        assert any("Lab 1" in row for row in rows[1:])
        assert any("Lab 2" in row for row in rows[1:])
        assert len(rows) == 3  # header + 2 rooms

    @pytest.mark.django_db
    def test_export_xlsx_is_a_workbook_of_the_filtered_rows(self, api_client):
        from io import BytesIO

        from openpyxl import load_workbook
        from tests.factories import RoomFactory

        school, principal = self._principal()
        RoomFactory(school=school, name="Lab 1", capacity=20)
        RoomFactory(school=school, name="Gym", capacity=50)
        self._login(api_client, principal)

        response = api_client.get("/api/v1/timetable/rooms/?export=xlsx&search=Lab")

        assert response.status_code == 200
        assert "spreadsheetml" in response["Content-Type"]
        assert response["Content-Disposition"] == 'attachment; filename="room_list.xlsx"'
        rows = list(load_workbook(BytesIO(response.content)).active.iter_rows(values_only=True))
        assert rows[0][:3] == ("id", "name", "capacity")
        assert len(rows) == 2 and rows[1][1] == "Lab 1" and rows[1][2] == 20

    @pytest.mark.django_db
    def test_export_csv_respects_the_same_filters_as_a_normal_list(self, api_client):
        from tests.factories import RoomFactory

        school, principal = self._principal()
        RoomFactory(school=school, name="Lab 1")
        RoomFactory(school=school, name="Gym")
        self._login(api_client, principal)

        response = api_client.get("/api/v1/timetable/rooms/?export=csv&search=Lab")

        body = b"".join(response.streaming_content).decode()
        assert "Lab 1" in body
        assert "Gym" not in body

    @pytest.mark.django_db
    def test_export_csv_never_leaks_another_schools_rows(self, api_client):
        from tests.factories import RoomFactory, SchoolFactory

        school, principal = self._principal()
        other_school = SchoolFactory()
        RoomFactory(school=school, name="Mine")
        RoomFactory(school=other_school, name="Not Mine")
        self._login(api_client, principal)

        response = api_client.get("/api/v1/timetable/rooms/?export=csv")

        body = b"".join(response.streaming_content).decode()
        assert "Mine" in body
        assert "Not Mine" not in body

    @pytest.mark.django_db
    def test_export_requires_the_same_permission_as_list(self, api_client):
        from apps.authorization.models import Role
        from apps.authorization.services import assign_role
        from tests.factories import UserFactory

        school, _ = self._principal()
        # "accountant" holds no timetable.* permission at all (see authorization/catalog.py) —
        # a role that genuinely can't list rooms either, so a 403 here is the same check the
        # plain (non-export) list action already enforces, not something export-specific.
        outsider = UserFactory(school=school)
        assign_role(user=outsider, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        self._login(api_client, outsider)

        response = api_client.get("/api/v1/timetable/rooms/?export=csv")

        assert response.status_code == 403

    @pytest.mark.django_db
    def test_plain_list_is_unaffected(self, api_client):
        from tests.factories import RoomFactory

        school, principal = self._principal()
        RoomFactory(school=school)
        self._login(api_client, principal)

        response = api_client.get("/api/v1/timetable/rooms/")

        assert response.status_code == 200
        assert response["Content-Type"] == "application/json"
        assert "results" in response.data


class TestBrandedEmail:
    def test_template_carries_the_schools_details_and_escapes_them(self):
        from types import SimpleNamespace

        from apps.common.email import render_email

        school = SimpleNamespace(
            name="Riverside <Academy>", motto="Learn", logo_url="https://cdn.example/logo.png", logo=None,
            address="1 Main St", phone_number="123", email="office@riverside.test",
        )
        html = render_email(school=school, title="Welcome", body_html="<p>Hello</p>")
        assert "Riverside &lt;Academy&gt;" in html
        assert "https://cdn.example/logo.png" in html
        assert "1 Main St · 123 · office@riverside.test" in html
        assert "<p>Hello</p>" in html

    def test_falls_back_to_platform_name_without_a_school(self):
        from apps.common.email import PLATFORM_NAME, render_email

        assert PLATFORM_NAME in render_email(school=None, title="Hi", body_html="<p>x</p>")

    def test_provider_failure_returns_false_instead_of_raising(self, settings, monkeypatch):
        import sys
        import types

        from apps.common.email import send_email

        settings.BREVO_API_KEY = "test-key"
        fake = types.ModuleType("sib_api_v3_sdk")

        def boom(*args, **kwargs):
            raise RuntimeError("network down")

        fake.Configuration = boom
        monkeypatch.setitem(sys.modules, "sib_api_v3_sdk", fake)
        assert send_email(to_email="a@b.test", to_name="A", subject="s", html_content="<p>x</p>") is False


class TestStoredFileProxy:
    """PDFs/ZIPs can't be fetched from Cloudinary's public URL, so signed-in users get them through
    /api/v1/files/, which only ever fetches this project's own Cloudinary uploads."""

    URL = "https://res.cloudinary.com/democloud/raw/upload/v1/lesson_materials/notes_ab12.pdf"

    @staticmethod
    def _login(api_client):
        from tests.factories import UserFactory

        user = UserFactory()
        api_client.force_authenticate(user=user)

    def test_requires_a_signed_in_user(self, api_client):
        assert api_client.get("/api/v1/files/", {"url": self.URL}).status_code in (401, 403)

    def test_refuses_anything_that_is_not_our_cloudinary_account(self, api_client, settings):
        settings.CLOUDINARY_STORAGE = {"CLOUD_NAME": "democloud", "API_KEY": "k", "API_SECRET": "s"}
        self._login(api_client)
        for bad in (
            "https://evil.example.com/raw/upload/v1/a.pdf",
            "https://res.cloudinary.com/othercloud/raw/upload/v1/a.pdf",
            "http://169.254.169.254/latest/meta-data",
            "",
        ):
            response = api_client.get("/api/v1/files/", {"url": bad})
            assert response.status_code == 400, bad

    def test_streams_the_file_with_the_right_headers(self, api_client, settings, monkeypatch):
        settings.CLOUDINARY_STORAGE = {"CLOUD_NAME": "democloud", "API_KEY": "k", "API_SECRET": "s"}
        self._login(api_client)
        seen = {}

        class FakeUpstream:
            status_code = 200
            headers = {"Content-Length": "9"}

            def iter_content(self, size):
                yield b"%PDF-1.4 x"

            def close(self):
                pass

        def fake_get(link, **kwargs):
            seen["link"] = link
            return FakeUpstream()

        monkeypatch.setattr("apps.common.files.requests.get", fake_get)
        response = api_client.get("/api/v1/files/", {"url": self.URL, "download": "1", "name": "Term notes.pdf"})

        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert response["Content-Disposition"].startswith("attachment")
        assert "Term notes.pdf" in response["Content-Disposition"]
        assert b"".join(response.streaming_content) == b"%PDF-1.4 x"
        assert "lesson_materials" in seen["link"] and "notes_ab12.pdf" in seen["link"]


class TestResilience:
    def test_a_missing_script_is_a_404_not_the_apps_html(self, client, settings, tmp_path):
        (tmp_path / "index.html").write_text("<html>app</html>")
        settings.FRONTEND_DIST_DIR = str(tmp_path)
        for path in ("/assets/index-OLDHASH.js", "/assets/chunk-abc.css", "/some/missing/logo.png"):
            assert client.get(path).status_code == 404, path
        # ...while real app routes still get the shell, so direct links and refreshes keep working.
        for path in ("/", "/dashboard", "/demo-academy/students/3f2a"):
            response = client.get(path)
            assert response.status_code == 200 and b"app" in b"".join(response.streaming_content), path

    def test_every_response_carries_a_request_id_and_errors_quote_it(self, api_client):
        response = api_client.get("/api/v1/health/")
        assert len(response["X-Request-ID"]) >= 8
        mine = api_client.get("/api/v1/health/", HTTP_X_REQUEST_ID="trace-1234567890")
        assert mine["X-Request-ID"] == "trace-1234567890"
        bad = api_client.get("/api/v1/auth/me/", HTTP_X_REQUEST_ID="trace-abcdef123456")
        assert bad.status_code == 401 and bad.data["requestId"] == "trace-abcdef123456"
        # an unsafe id is replaced rather than echoed into logs and headers
        assert api_client.get("/api/v1/health/", HTTP_X_REQUEST_ID="bad id\r\nX: y")["X-Request-ID"] != "bad id\r\nX: y"

    def test_browser_error_reports_are_accepted_logged_and_validated(self, api_client, caplog):
        import logging

        with caplog.at_level(logging.WARNING, logger="apps.client"):
            ok = api_client.post(
                "/api/v1/client-errors/",
                {"kind": "chunk", "message": "Failed to fetch dynamically imported module\nforged line", "url": "/students"},
                format="json",
            )
        assert ok.status_code == 202
        assert "forged line" in caplog.text and "\nforged line" not in caplog.text  # collapsed onto one log line
        assert api_client.post("/api/v1/client-errors/", {"kind": "bogus", "message": "x"}, format="json").status_code == 400
        assert api_client.post("/api/v1/client-errors/", {"kind": "render", "message": "x" * 501}, format="json").status_code == 400
