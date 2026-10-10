"""Storage providers. Cloudflare R2 and S3 share one implementation; R2 only differs in where it points and which
credentials it reads. The real upload/download/delete round trip runs against an in-memory S3 (moto), so no network,
account or money is involved — but it does exercise the same boto3 calls that talk to R2."""

from pathlib import Path

import pytest
from django.conf import settings as django_settings

from . import service
from .models import BackupRecord, BackupSettings
from .storage import BackupStorageError, R2BackupStorage, S3BackupStorage, get_storage


@pytest.fixture
def r2(settings):
    settings.BACKUP_R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef"
    settings.BACKUP_R2_BUCKET = "nts-backups"
    settings.BACKUP_R2_ACCESS_KEY_ID = "AKIATESTKEYID"
    settings.BACKUP_R2_SECRET_ACCESS_KEY = "super-secret-test-value"


class TestR2Configuration:
    def test_it_points_at_the_accounts_r2_endpoint_with_the_auto_region(self, r2):
        client = R2BackupStorage()._client()
        assert client.meta.endpoint_url == "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
        assert client.meta.region_name == "auto"

    def test_it_is_selected_by_name(self, r2):
        assert isinstance(get_storage("r2"), R2BackupStorage)
        assert isinstance(get_storage("s3"), S3BackupStorage)
        with pytest.raises(BackupStorageError):
            get_storage("ftp")

    @pytest.mark.parametrize("missing", ["BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_BUCKET", "BACKUP_R2_ACCESS_KEY_ID", "BACKUP_R2_SECRET_ACCESS_KEY"])
    def test_a_missing_setting_is_reported_not_guessed(self, r2, settings, missing):
        setattr(settings, missing, "")
        with pytest.raises(BackupStorageError, match="not fully configured"):
            R2BackupStorage().exists("anything")

    def test_errors_never_contain_the_secret(self, r2):
        try:
            R2BackupStorage().exists("anything")  # no network in tests: fails to connect
        except BackupStorageError as exc:
            assert "super-secret-test-value" not in str(exc)
        except Exception as exc:  # a connection error type is fine too, as long as the secret isn't in it
            assert "super-secret-test-value" not in str(exc)


@pytest.fixture
def fake_bucket(settings):
    """An in-memory S3 with a bucket, reached through the generic S3 provider (the code R2 inherits)."""
    from moto import mock_aws

    settings.BACKUP_S3_BUCKET = "test-backups"
    settings.BACKUP_S3_ENDPOINT_URL = ""
    settings.BACKUP_S3_REGION = "us-east-1"
    settings.BACKUP_S3_ACCESS_KEY_ID = "testing"
    settings.BACKUP_S3_SECRET_ACCESS_KEY = "testing"
    with mock_aws():
        import boto3

        boto3.client("s3", region_name="us-east-1", aws_access_key_id="testing", aws_secret_access_key="testing").create_bucket(
            Bucket="test-backups"
        )
        yield


class TestObjectStorageRoundTrip:
    def test_put_stream_exists_delete(self, fake_bucket, tmp_path):
        storage = S3BackupStorage()
        source = tmp_path / "payload.bin"
        payload = b"0123456789" * 200_000  # 2 MB
        source.write_bytes(payload)

        assert storage.exists("backups/one.ntsbak") is False
        storage.put("backups/one.ntsbak", source)
        assert storage.exists("backups/one.ntsbak") is True
        assert b"".join(storage.stream("backups/one.ntsbak")) == payload
        storage.delete("backups/one.ntsbak")
        assert storage.exists("backups/one.ntsbak") is False

    @pytest.mark.django_db
    def test_a_whole_backup_is_stored_verified_and_removed_through_it(self, fake_bucket, settings):
        settings.BACKUP_STORAGE = "s3"
        settings.BACKGROUND_TASKS_ASYNC = False

        record = service.create_backup(BackupRecord.Kind.MANUAL)

        assert record.status == "completed" and record.verification == "valid", record.error_message
        assert record.storage_backend == "s3"
        assert S3BackupStorage().exists(record.storage_key)
        # nothing readable ended up in the bucket: it is the encrypted container
        assert next(S3BackupStorage().stream(record.storage_key)).startswith(b"NTSBK1")
        # the file really lives in object storage, not on this machine's disk
        assert not list(Path(django_settings.BACKUP_LOCAL_DIR).rglob("*.ntsbak"))

        # a second valid backup, so the first is allowed to be deleted
        BackupRecord.objects.filter(pk=record.pk).update(created_at=record.created_at.replace(year=2020))
        newer = service.create_backup(BackupRecord.Kind.MANUAL)
        assert newer.is_restorable
        cfg = BackupSettings.get_solo()
        cfg.min_valid_to_keep = 1  # keep only the newest valid backup, so the older one may go
        cfg.save()
        service.delete_backup(BackupRecord.objects.get(pk=record.pk), reason="test")
        assert not S3BackupStorage().exists(record.storage_key)
