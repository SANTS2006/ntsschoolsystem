import logging
import threading

from django.conf import settings
from django.db import connection

logger = logging.getLogger("apps")


def run_in_background(label: str, fn, *args) -> None:
    """Runs `fn(*args)` without holding up the HTTP response — for work that is a network call per
    recipient (emailing a whole school), which would otherwise outlast the web worker's request
    time limit and get the request killed halfway. There's no task queue in this codebase, so this
    is a daemon thread that closes its own DB connection when done; callers must persist their own
    state *before* dispatching and make `fn` safe to re-run.

    Tests set `settings.BACKGROUND_TASKS_ASYNC = False` so the work happens inline and can be asserted on."""

    def run():
        try:
            fn(*args)
        except Exception:  # noqa: BLE001
            logger.exception("%s failed", label)
        finally:
            connection.close()

    if getattr(settings, "BACKGROUND_TASKS_ASYNC", True):
        threading.Thread(target=run, daemon=True).start()
    else:
        fn(*args)
