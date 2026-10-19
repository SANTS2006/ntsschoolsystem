import uuid

import pytest
from django.test import Client, override_settings

from apps.common.models import IdempotencyRecord
from apps.enquiries.models import Enquiry

pytestmark = pytest.mark.django_db

URL = "/api/v1/public/enquiries/"
BODY = {"kind": "contact", "name": "Joe Bangura", "email": "joe@example.com", "message": "How is pricing worked out?", "consent": True}


@pytest.fixture(autouse=True)
def _no_throttle():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


def _post(key=None, body=BODY):
    headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
    return Client().post(URL, body, content_type="application/json", **headers)


def test_a_repeated_write_with_the_same_key_creates_one_record_and_replays_the_answer():
    key = str(uuid.uuid4())
    first = _post(key)
    again = _post(key)
    third = _post(key)
    assert first.status_code == again.status_code == third.status_code == 201
    assert again["Idempotent-Replay"] == "true" and "Idempotent-Replay" not in first
    assert again.json()["reference"] == first.json()["reference"]
    assert Enquiry.objects.count() == 1


def test_different_keys_are_different_requests():
    _post(str(uuid.uuid4()))
    _post(str(uuid.uuid4()))
    assert Enquiry.objects.count() == 2


def test_requests_without_a_key_behave_exactly_as_before():
    _post()
    _post()
    assert Enquiry.objects.count() == 2 and not IdempotencyRecord.objects.exists()


def test_a_failed_request_is_not_remembered_so_the_retry_can_succeed():
    key = str(uuid.uuid4())
    bad = _post(key, {**BODY, "email": "not-an-email"})
    assert bad.status_code == 400
    good = _post(key)  # same key after the person fixed the form
    assert good.status_code == 201 and Enquiry.objects.count() == 1


def test_a_request_still_running_gets_a_wait_answer_not_a_second_run():
    key = str(uuid.uuid4())
    IdempotencyRecord.objects.create(key=key, method="POST", path=URL)  # the first attempt is mid-flight
    response = _post(key)
    assert response.status_code == 409 and response.json()["code"] == "REQUEST_IN_PROGRESS" and response["Retry-After"]
    assert Enquiry.objects.count() == 0


def test_a_dead_first_attempt_is_taken_over():
    from datetime import timedelta

    from django.utils import timezone

    key = str(uuid.uuid4())
    record = IdempotencyRecord.objects.create(key=key, method="POST", path=URL)
    IdempotencyRecord.objects.filter(pk=record.pk).update(created_at=timezone.now() - timedelta(minutes=10))
    assert _post(key).status_code == 201 and Enquiry.objects.count() == 1


def test_sign_in_and_malformed_keys_are_never_guarded():
    for key in ("short", "has spaces in it!!", "x" * 100):
        _post(key)
    assert not IdempotencyRecord.objects.exists()
    Client().post("/api/v1/auth/login/", {"email": "a@b.co", "password": "x"}, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert not IdempotencyRecord.objects.exists()
