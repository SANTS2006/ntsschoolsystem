import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _local_file_storage(settings, tmp_path):
    """
    Forces plain local disk storage for the whole suite, overriding whatever
    STORAGES["default"] base.py picked (Cloudinary, once real credentials are
    configured in .env) — tests must never make live Cloudinary API calls
    just because a FileField happens to get written to.

    Must set `settings.STORAGES`, not the legacy `DEFAULT_FILE_STORAGE` —
    Django 5.1 removed the compatibility shim that used to translate the
    latter into the former, so setting only `DEFAULT_FILE_STORAGE` here is a
    silent no-op and `django.core.files.storage.default_storage` keeps
    reading whatever `STORAGES["default"]["BACKEND"]` already says (see
    Phase 11's notes in IMPLEMENTATION_STATUS.md — this exact mistake shipped
    once already, briefly making real Cloudinary calls from test runs).
    """
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    }
    settings.MEDIA_ROOT = str(tmp_path)


@pytest.fixture(autouse=True)
def _two_factor_enforcement_off(settings):
    """Most tests sign in as a Principal/platform admin, whose accounts must enrol 2FA in real
    life. Enforcement is switched off for the suite; the 2FA tests turn it back on explicitly."""
    settings.TWO_FACTOR_ENFORCEMENT = False


@pytest.fixture(autouse=True)
def _backups_use_a_temp_folder(settings, tmp_path_factory):
    """Backup tests must never touch Cloudinary or the real backups folder."""
    settings.BACKUP_STORAGE = "local"
    settings.BACKUP_LOCAL_DIR = str(tmp_path_factory.mktemp("backups"))
    settings.BACKUP_AUTO_TRIGGER = False
    settings.BACKUP_ENCRYPTION_KEY = "test-only-backup-encryption-key-not-a-secret"


@pytest.fixture(autouse=True)
def _login_scope_enforcement_off(settings):
    """The sign-in page rules (a school's users only through their own school's page) are tested
    explicitly; the other tests sign in through the plain endpoint without naming a school."""
    settings.LOGIN_SCOPE_ENFORCEMENT = False


@pytest.fixture(autouse=True)
def _reset_throttle_cache():
    """
    DRF's login/password-reset throttle scopes are backed by Django's cache
    (LocMemCache by default), which is a single process-wide object — not
    reset by pytest-django's per-test transaction rollback. Without this,
    a growing suite that calls /auth/login/ many times across many tests
    eventually trips the real 10/min throttle mid-suite, failing an
    unrelated later test with 429 instead of the behavior it's testing.
    """
    cache.clear()
    yield


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def csrf_api_client():
    return APIClient(enforce_csrf_checks=True)
