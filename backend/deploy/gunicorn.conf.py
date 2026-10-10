"""Gunicorn settings for production (loaded with `-c deploy/gunicorn.conf.py`)."""

import multiprocessing
import os

# Render tells the service which port to listen on via $PORT (10000 by default).
bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"

# Sized for a small Render instance; raise WEB_CONCURRENCY on bigger plans. Threads let one worker serve
# several slow requests (e.g. a lesson-video upload) without blocking the others.
workers = int(os.environ.get("WEB_CONCURRENCY", min(multiprocessing.cpu_count() * 2 + 1, 5)))
threads = int(os.environ.get("GUNICORN_THREADS", 2))
worker_class = "gthread"

# 300s: the largest legitimate request is a 200MB lesson video on a slow school connection.
timeout = 300
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically so a slow memory leak can never accumulate for weeks.
max_requests = 1000
max_requests_jitter = 100

# Refuse absurd request lines/headers (a classic resource-exhaustion trick).
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Render's load balancer is the only thing that can reach this port, so trusting its
# X-Forwarded-* headers (scheme, client IP chain) is safe here.
forwarded_allow_ips = "*"

# Keep worker heartbeat files on tmpfs, not the (possibly network/overlay) container disk.
worker_tmp_dir = "/dev/shm"

accesslog = "-"
errorlog = "-"
# Method + path only (%(m)s %(U)s), never the raw request line %(r)s: that includes the query
# string, which must not end up in logs in case it ever carries a token.
access_log_format = '%(h)s "%(m)s %(U)s" %(s)s %(b)s "%(a)s" %(D)sus'
