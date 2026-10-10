from datetime import timedelta
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.utils import timezone

from apps.tenants.models import School
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

from . import service
from .models import BackupRecord, BackupSettings, RestoreRecord

pytestmark = pytest.mark.django_db

BASE = "/api/v1/platform/backups/"


@pytest.fixture(autouse=True)
def _inline_background(settings):
    settings.BACKGROUND_TASKS_ASYNC = False


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _valid_backup() -> BackupRecord:
    record = service.create_backup(BackupRecord.Kind.MANUAL)
    assert record.status == "completed" and record.verification == "valid", record.error_message
    return record


def _stored_file(record: BackupRecord) -> Path:
    return Path(django_settings.BACKUP_LOCAL_DIR) / record.storage_key


class TestCreatingBackups:
    def test_a_backup_is_encrypted_checksummed_stored_and_verified(self):
        SchoolFactory(name="Zebra Secret Academy")
        record = _valid_backup()

        assert record.size_bytes > 0 and len(record.checksum_sha256) == 64
        assert record.record_counts["tenants.school"] >= 1
        raw = _stored_file(record).read_bytes()
        assert raw.startswith(b"NTSBK1")
        assert b"Zebra Secret Academy" not in raw  # the file is encrypted, not just compressed
        assert record.verified_at is not None

    def test_a_damaged_file_fails_verification_and_is_not_a_recovery_point(self):
        record = _valid_backup()
        path = _stored_file(record)
        data = bytearray(path.read_bytes())
        data[len(data) // 2] ^= 0xFF
        path.write_bytes(bytes(data))

        assert service.verify_backup(record) is False
        record.refresh_from_db()
        assert record.verification == "invalid" and record.status == "failed" and not record.is_restorable

    def test_a_missing_file_fails_verification(self):
        record = _valid_backup()
        _stored_file(record).unlink()
        assert service.verify_backup(record) is False

    def test_two_backups_can_not_overlap(self):
        first = service.start_backup(BackupRecord.Kind.MANUAL)
        with pytest.raises(service.BackupInProgress):
            service.start_backup(BackupRecord.Kind.MANUAL)
        # once that one has finished, the next may start
        BackupRecord.objects.filter(pk=first.pk).update(status="completed")
        assert service.start_backup(BackupRecord.Kind.MANUAL)

    def test_a_backup_that_died_does_not_block_forever(self):
        stuck = service.start_backup(BackupRecord.Kind.MANUAL)
        BackupRecord.objects.filter(pk=stuck.pk).update(status="running", created_at=timezone.now() - timedelta(hours=3))
        assert service.start_backup(BackupRecord.Kind.MANUAL)

    def test_production_refuses_to_back_up_without_an_encryption_key(self, settings):
        settings.DEBUG = False
        settings.BACKUP_ENCRYPTION_KEY = ""
        record = service.create_backup(BackupRecord.Kind.MANUAL)
        assert record.status == "failed" and "BACKUP_ENCRYPTION_KEY" in record.error_message


class TestRetention:
    def _make(self, age_days, **fields):
        record = BackupRecord.objects.create(kind="automatic", status="completed", verification="valid", **fields)
        BackupRecord.objects.filter(pk=record.pk).update(created_at=timezone.now() - timedelta(days=age_days))
        return record

    def test_old_backups_go_but_the_newest_valid_ones_always_stay(self):
        cfg = BackupSettings.get_solo()
        cfg.retention_days, cfg.min_valid_to_keep = 7, 2
        cfg.save()
        newest, newer = self._make(1), self._make(2)
        self._make(30)
        self._make(40)

        removed = service.apply_retention()

        assert removed == 2
        assert set(BackupRecord.objects.values_list("id", flat=True)) == {newest.id, newer.id}

    def test_when_everything_is_old_the_newest_valid_backup_survives(self):
        cfg = BackupSettings.get_solo()
        cfg.retention_days, cfg.min_valid_to_keep = 7, 1
        cfg.save()
        only = self._make(100)
        service.apply_retention()
        assert BackupRecord.objects.filter(pk=only.pk).exists()

    def test_a_backup_a_restore_is_using_is_never_deleted(self):
        cfg = BackupSettings.get_solo()
        cfg.retention_days, cfg.min_valid_to_keep = 7, 1
        cfg.save()
        self._make(1)
        in_use = self._make(60, in_use_by_restore=True)
        service.apply_retention()
        assert BackupRecord.objects.filter(pk=in_use.pk).exists()

    def test_manual_deletion_is_refused_for_the_newest_valid_backup(self):
        only = self._make(1)
        with pytest.raises(service.BackupError):
            service.delete_backup(only)


class TestSchedule:
    def test_the_daily_backup_runs_once_when_due_and_not_again(self):
        cfg = BackupSettings.get_solo()
        cfg.schedule_hour_utc = 0  # due from midnight, i.e. always due today
        cfg.save()

        first = service.run_scheduled_backup_if_due()
        assert first is not None and first.kind == "automatic" and first.status == "completed"
        assert service.run_scheduled_backup_if_due() is None
        assert BackupRecord.objects.filter(kind="automatic").count() == 1
        assert service.next_scheduled_at() > timezone.now()

    def test_it_waits_for_its_hour_and_can_be_switched_off(self):
        cfg = BackupSettings.get_solo()
        now = timezone.now().replace(hour=1, minute=0, second=0, microsecond=0)
        cfg.schedule_hour_utc = 5
        cfg.save()
        # at 01:00 with the slot at 05:00, today's backup isn't due yet — but yesterday's slot never ran, so it is
        assert service.is_scheduled_backup_due(now) is True
        BackupRecord.objects.create(kind="automatic", status="completed", verification="valid")
        assert service.is_scheduled_backup_due(now) is False
        cfg.automatic_enabled = False
        cfg.save()
        assert service.is_scheduled_backup_due(now + timedelta(days=3)) is False

    def test_a_failed_attempt_is_retried_but_not_in_a_tight_loop(self):
        cfg = BackupSettings.get_solo()
        cfg.schedule_hour_utc = 0
        cfg.save()
        BackupRecord.objects.create(kind="automatic", status="failed", error_message="boom")
        assert service.is_scheduled_backup_due() is False  # failed a moment ago
        BackupRecord.objects.all().update(created_at=timezone.now() - timedelta(hours=2))
        assert service.is_scheduled_backup_due() is True


class TestAdminApi:
    def test_only_platform_admins_can_use_it(self, api_client):
        _login(api_client, UserFactory(school=SchoolFactory()))
        for method, path in (("get", BASE), ("get", BASE + "overview/"), ("post", BASE), ("get", BASE + "restores/")):
            assert getattr(api_client, method)(path).status_code in (401, 403), path

    def test_listing_is_paginated_and_never_exposes_storage_internals(self, api_client):
        _login(api_client, PlatformAdminFactory())
        for _ in range(3):
            BackupRecord.objects.create(kind="manual", status="completed", storage_key="secret/path.ntsbak", storage_backend="local")
        body = api_client.get(BASE, {"page_size": 2}).data
        assert body["count"] == 3 and len(body["results"]) == 2
        assert "storage_key" not in str(body) and "secret/path" not in str(body)
        assert len(api_client.get(BASE, {"page_size": 9999}).data["results"]) == 3  # capped, not unlimited

    def test_a_manual_backup_records_who_asked_and_lands_in_the_audit_log(self, api_client):
        from apps.audit.models import AuditLog

        admin = PlatformAdminFactory()
        _login(api_client, admin)
        response = api_client.post(BASE)
        assert response.status_code == 202
        record = BackupRecord.objects.get(pk=response.data["backup"]["id"])
        assert record.created_by_email == admin.email and record.status == "completed"
        events = set(AuditLog.objects.filter(entity_id=str(record.id)).values_list("metadata__event", flat=True))
        assert {"BACKUP_STARTED", "BACKUP_VERIFIED"} <= events

    def test_overview_and_settings(self, api_client):
        _login(api_client, PlatformAdminFactory())
        _valid_backup()
        overview = api_client.get(BASE + "overview/").data["overview"]
        assert overview["last_valid_backup"] and overview["valid_backup_count"] == 1 and overview["next_scheduled_at"]
        saved = api_client.put(BASE + "settings/", {"retention_days": 30, "schedule_hour_utc": 3}, format="json")
        assert saved.status_code == 200 and saved.data["settings"]["retention_days"] == 30
        assert api_client.put(BASE + "settings/", {"retention_days": 0}, format="json").status_code == 400
        assert api_client.put(BASE + "settings/", {"schedule_hour_utc": 25}, format="json").status_code == 400

    def test_download_gives_the_encrypted_file_only_to_admins(self, api_client):
        record = _valid_backup()
        _login(api_client, UserFactory(school=SchoolFactory()))
        assert api_client.get(f"{BASE}{record.id}/download/").status_code in (401, 403)
        api_client.cookies.clear()
        _login(api_client, PlatformAdminFactory())
        response = api_client.get(f"{BASE}{record.id}/download/")
        assert response.status_code == 200
        assert b"".join(response.streaming_content).startswith(b"NTSBK1")

    def test_the_scheduler_tick_needs_its_secret(self, api_client, settings):
        settings.BACKUP_TICK_TOKEN = ""
        assert api_client.post(BASE + "tick/", HTTP_X_BACKUP_TOKEN="anything").status_code == 403  # disabled
        settings.BACKUP_TICK_TOKEN = "s3cret-tick-token"
        assert api_client.post(BASE + "tick/", HTTP_X_BACKUP_TOKEN="wrong").status_code == 403
        cfg = BackupSettings.get_solo()
        cfg.automatic_enabled = False
        cfg.save()
        ok = api_client.post(BASE + "tick/", HTTP_X_BACKUP_TOKEN="s3cret-tick-token")
        assert ok.status_code == 200 and ok.data["started"] is False


class TestRestore:
    def _admin_session(self, api_client):
        admin = PlatformAdminFactory()
        _login(api_client, admin)
        return admin

    def _restore(self, api_client, record, *, password=DEFAULT_TEST_PASSWORD, phrase=None):
        prepared = api_client.post(f"{BASE}{record.id}/restore/prepare/")
        assert prepared.status_code == 200, prepared.data
        info = prepared.data["restore"]
        return api_client.post(
            f"{BASE}{record.id}/restore/",
            {"token": info["token"], "confirmation": phrase or info["required_phrase"], "password": password},
            format="json",
        )

    def test_a_restore_puts_the_data_back_and_takes_a_safety_backup_first(self, api_client):
        admin = self._admin_session(api_client)
        kept = SchoolFactory(name="Kept School")
        record = _valid_backup()
        SchoolFactory(name="Created After The Backup")
        School.objects.filter(pk=kept.pk).update(name="Changed After The Backup")

        response = self._restore(api_client, record)

        assert response.status_code == 202, response.data
        restore = RestoreRecord.objects.get(pk=response.data["restore"]["id"])
        assert restore.status == "completed", restore.error_message
        names = set(School.objects.values_list("name", flat=True))
        assert "Kept School" in names
        assert "Created After The Backup" not in names and "Changed After The Backup" not in names
        # a safety backup of the pre-restore state exists and is valid, and the original backup survived
        safety = BackupRecord.objects.get(pk=restore.safety_backup_id)
        assert safety.kind == "pre_restore" and safety.is_restorable
        assert BackupRecord.objects.filter(pk=record.pk, in_use_by_restore=False).exists()
        assert admin.email == restore.started_by_email

    def test_the_safety_backup_can_undo_the_restore(self, api_client):
        self._admin_session(api_client)
        SchoolFactory(name="Before")
        record = _valid_backup()
        SchoolFactory(name="After")
        restore = RestoreRecord.objects.get(pk=self._restore(api_client, record).data["restore"]["id"])
        assert "After" not in set(School.objects.values_list("name", flat=True))

        restore.refresh_from_db()
        safety = BackupRecord.objects.get(pk=restore.safety_backup_id)
        service.begin_restore(
            safety,
            PlatformAdminFactory.build(pk=restore.started_by_id, email=restore.started_by_email),
            token=service.prepare_restore(safety, type("U", (), {"pk": restore.started_by_id})())["token"],
            confirmation=service.restore_phrase(safety),
            background=False,
        )
        assert "After" in set(School.objects.values_list("name", flat=True))

    def test_it_needs_the_password_the_phrase_and_a_fresh_token(self, api_client):
        self._admin_session(api_client)
        record = _valid_backup()
        marker = SchoolFactory(name="Must Survive")
        assert self._restore(api_client, record, password="wrong").data["code"] == "INVALID_PASSWORD"
        assert self._restore(api_client, record, phrase="RESTORE").status_code == 400
        bad_token = api_client.post(
            f"{BASE}{record.id}/restore/",
            {"token": "forged", "confirmation": service.restore_phrase(record), "password": DEFAULT_TEST_PASSWORD},
            format="json",
        )
        assert bad_token.status_code == 400
        assert RestoreRecord.objects.count() == 0
        assert School.objects.filter(pk=marker.pk).exists()  # nothing happened

    def test_only_a_valid_verified_backup_can_be_restored(self, api_client):
        self._admin_session(api_client)
        record = BackupRecord.objects.create(kind="manual", status="completed", verification="unverified")
        assert api_client.post(f"{BASE}{record.id}/restore/prepare/").status_code == 400

    def test_a_backup_from_a_different_schema_is_refused(self, api_client):
        self._admin_session(api_client)
        record = _valid_backup()
        BackupRecord.objects.filter(pk=record.pk).update(schema_state={"tenants": "0001_initial"})
        record.refresh_from_db()
        response = api_client.post(f"{BASE}{record.id}/restore/prepare/")
        assert response.status_code == 400 and "different database version" in response.data["message"]

    def test_a_corrupted_backup_fails_safely_and_changes_nothing(self, api_client):
        self._admin_session(api_client)
        keep = SchoolFactory(name="Untouched")
        record = _valid_backup()
        path = _stored_file(record)
        data = bytearray(path.read_bytes())
        data[len(data) // 2] ^= 0xFF
        path.write_bytes(bytes(data))
        BackupRecord.objects.filter(pk=record.pk).update(verification="valid", status="completed")  # as if it had been verified before the damage

        response = self._restore(api_client, record)

        restore = RestoreRecord.objects.get(pk=response.data["restore"]["id"])
        assert restore.status == "failed" and restore.error_message
        assert School.objects.filter(pk=keep.pk).exists()
        assert not BackupRecord.objects.filter(pk=record.pk, in_use_by_restore=True).exists()

    def test_restore_can_be_switched_off(self, api_client, settings):
        self._admin_session(api_client)
        record = _valid_backup()
        settings.BACKUP_ALLOW_RESTORE = False
        assert api_client.post(f"{BASE}{record.id}/restore/prepare/").status_code == 400

    def test_history_lists_restores(self, api_client):
        self._admin_session(api_client)
        record = _valid_backup()
        self._restore(api_client, record)
        history = api_client.get(BASE + "restores/").data
        assert history["count"] == 1 and history["results"][0]["status"] == "completed"


class TestInterruptedWork:
    def test_unfinished_work_from_a_dead_process_is_marked_failed_not_running_forever(self):
        old = timezone.now() - timedelta(hours=3)
        stuck = BackupRecord.objects.create(kind="manual", status="running")
        BackupRecord.objects.filter(pk=stuck.pk).update(created_at=old)
        source = BackupRecord.objects.create(kind="manual", status="completed", verification="valid", in_use_by_restore=True)
        restore = RestoreRecord.objects.create(backup_id=source.id, status="restoring")
        RestoreRecord.objects.filter(pk=restore.pk).update(created_at=old)

        assert service.reap_stale() == 2

        stuck.refresh_from_db(), restore.refresh_from_db(), source.refresh_from_db()
        assert stuck.status == "failed" and "Interrupted" in stuck.error_message
        assert restore.status == "failed" and source.in_use_by_restore is False


@pytest.mark.django_db(transaction=True)
def test_simultaneous_backup_starts_only_one_wins():
    """Eight 'instances' try to start a backup at the same moment: exactly one gets the lock."""
    from concurrent.futures import ThreadPoolExecutor

    from django.db import connection

    def attempt(_):
        try:
            service.start_backup(BackupRecord.Kind.MANUAL)
            return "started"
        except service.BackupInProgress:
            return "refused"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(attempt, range(8)))
    assert outcomes.count("started") == 1 and outcomes.count("refused") == 7
    assert BackupRecord.objects.count() == 1
