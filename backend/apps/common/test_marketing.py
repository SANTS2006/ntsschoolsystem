import json

import pytest
from django.test import Client, override_settings

from apps.common.spa import whitenoise_headers


@pytest.fixture
def website(tmp_path):
    (tmp_path / "features").mkdir()
    (tmp_path / "index.html").write_text("<html><title>Marketing home</title></html>", encoding="utf-8")
    (tmp_path / "features" / "index.html").write_text("<html><title>Marketing features</title></html>", encoding="utf-8")
    (tmp_path / "routes.json").write_text(json.dumps(["/", "/features"]), encoding="utf-8")
    with override_settings(WEBSITE_DIST_DIR=tmp_path):
        yield tmp_path


def test_listed_marketing_routes_are_served_with_the_marketing_marker(website):
    for path, title in (("/", "Marketing home"), ("/features", "Marketing features"), ("/features/", "Marketing features")):
        response = Client().get(path)
        assert response.status_code == 200, path
        assert title in b"".join(response.streaming_content).decode()
        assert response["X-NTS-Surface"] == "marketing"
        assert "script-src 'self'" in response["Content-Security-Policy"]


def test_unlisted_paths_never_read_the_website_directory(website):
    (website / "secret").mkdir()
    (website / "secret" / "index.html").write_text("nope", encoding="utf-8")
    response = Client().get("/secret")
    assert response.get("X-NTS-Surface") != "marketing"


def test_without_a_website_build_the_app_still_answers(settings, tmp_path):
    settings.WEBSITE_DIST_DIR = tmp_path / "missing"
    response = Client().get("/")
    assert response.get("X-NTS-Surface") != "marketing"


def test_missing_site_assets_are_404_not_html(website):
    assert Client().get("/site-assets/nope.js").status_code == 404


def test_site_assets_are_cached_as_immutable():
    headers = {}
    whitenoise_headers(headers, "/srv/dist/site-assets/style-abc.css", "/site-assets/style-abc.css")
    assert "immutable" in headers["Cache-Control"]
