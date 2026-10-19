"""Makes write requests safe to repeat.

The browser attaches a fresh `Idempotency-Key` (a random UUID) to every write and reuses it when it retries that same write
(slow network, timeout, double click). The first request with a key runs normally and its answer is remembered; a repeat
with the same key gets that answer back (header `Idempotent-Replay: true`) and does NOT run the work again, so nothing is
created twice. A repeat that arrives while the first is still running gets 409 `REQUEST_IN_PROGRESS`, which the browser
treats as "wait and ask again".

Only successful (2xx) answers are remembered. A 4xx/5xx means the work did not happen (or the person must sign in or fix the
form first), so a retry with the same key is allowed to run it for real. This middleware can never make a request fail: if its own bookkeeping errors, the request
simply proceeds without protection."""

import logging
import random
import re
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone

from .models import IdempotencyRecord

logger = logging.getLogger("apps")

HEADER = "HTTP_IDEMPOTENCY_KEY"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
# Sign-in/out and token refresh must always really run; client error reports are fire-and-forget.
SKIP_PREFIXES = ("/api/v1/auth/", "/api/v1/client-errors/")
MAX_STORED_BODY = 256 * 1024
STALE_AFTER = timedelta(seconds=180)  # a first request that has been "running" this long is presumed dead
KEEP_FOR = timedelta(hours=24)


class IdempotencyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.META.get(HEADER, "")
        if request.method not in UNSAFE or not key or not KEY_RE.match(key) or not request.path.startswith("/api/") or request.path.startswith(SKIP_PREFIXES):
            return self.get_response(request)

        try:
            claim = self._claim(key, request)
        except Exception:  # noqa: BLE001 - never let bookkeeping break a request
            logger.exception("Idempotency claim failed; continuing without it")
            return self.get_response(request)

        if isinstance(claim, HttpResponse):
            return claim  # a replay, or "still running"

        record_id = claim
        try:
            response = self.get_response(request)
        except Exception:
            self._forget(record_id)
            raise
        self._finish(record_id, response)
        return response

    # -- bookkeeping ----------------------------------------------------------------------------------------------------
    def _claim(self, key, request):
        now = timezone.now()
        try:
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(key=key, method=request.method, path=request.path[:255])
            if random.random() < 0.02:
                IdempotencyRecord.objects.filter(created_at__lt=now - KEEP_FOR).delete()
            return record.pk
        except IntegrityError:
            pass
        record = IdempotencyRecord.objects.get(key=key, method=request.method, path=request.path[:255])
        if record.state == IdempotencyRecord.State.DONE and record.status_code:
            response = HttpResponse(bytes(record.body), status=record.status_code, content_type=record.content_type or "application/json")
            response["Idempotent-Replay"] = "true"
            return response
        if now - record.created_at < STALE_AFTER:
            response = JsonResponse(
                {"success": False, "message": "This request is already being processed. Please wait a moment.", "code": "REQUEST_IN_PROGRESS", "errors": []},
                status=409,
            )
            response["Retry-After"] = "2"
            return response
        # The first attempt never finished (worker died): take it over.
        IdempotencyRecord.objects.filter(pk=record.pk).update(created_at=now, state=IdempotencyRecord.State.IN_PROGRESS)
        return record.pk

    def _finish(self, record_id, response):
        try:
            streaming = getattr(response, "streaming", False)
            if not 200 <= response.status_code < 300 or streaming:
                self._forget(record_id)
                return
            body = response.content
            if len(body) > MAX_STORED_BODY:
                # Too large to keep: remember only that it succeeded, as an empty replay is useless, so drop the guard instead.
                self._forget(record_id)
                return
            IdempotencyRecord.objects.filter(pk=record_id).update(
                state=IdempotencyRecord.State.DONE,
                status_code=response.status_code,
                content_type=response.get("Content-Type", "application/json"),
                body=body,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Idempotency finish failed")
            self._forget(record_id)

    def _forget(self, record_id):
        try:
            IdempotencyRecord.objects.filter(pk=record_id).delete()
        except Exception:  # noqa: BLE001
            logger.exception("Idempotency cleanup failed")
