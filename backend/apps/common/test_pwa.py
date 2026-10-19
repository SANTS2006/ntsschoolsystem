from apps.common.spa import SPA_CONTENT_SECURITY_POLICY, whitenoise_headers


def test_service_worker_and_manifest_are_always_revalidated():
    sw, manifest = {}, {}
    whitenoise_headers(sw, "/srv/dist/sw.js", "/sw.js")
    whitenoise_headers(manifest, "/srv/dist/manifest.webmanifest", "/manifest.webmanifest")
    assert sw["Cache-Control"] == "no-cache" and sw["Service-Worker-Allowed"] == "/"
    assert manifest["Cache-Control"] == "no-cache" and "Service-Worker-Allowed" not in manifest


def test_hashed_assets_stay_immutable():
    headers = {}
    whitenoise_headers(headers, "/srv/dist/assets/index-abc123.js", "/assets/index-abc123.js")
    assert "immutable" in headers["Cache-Control"]


def test_csp_allows_the_manifest_and_worker_but_still_no_inline_script():
    assert "manifest-src 'self'" in SPA_CONTENT_SECURITY_POLICY
    assert "worker-src 'self'" in SPA_CONTENT_SECURITY_POLICY
    assert "script-src 'self' https://accounts.google.com/gsi/client;" in SPA_CONTENT_SECURITY_POLICY


def test_the_shell_lets_the_google_sign_in_popup_talk_back():
    headers = {}
    from apps.common.spa import apply_document_headers

    apply_document_headers(headers)
    assert headers["Cross-Origin-Opener-Policy"] == "same-origin-allow-popups"
