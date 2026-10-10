#!/bin/sh
# Container entrypoint. On Render's free plan there is no "pre-deploy command", so the schema
# migration and permission-catalog seed run here, before the web server starts. A failing
# migration stops the container (and Render keeps serving the previous version).
set -e
python manage.py migrate --noinput
python manage.py seed_permissions
# The free plan has no shell, so a change to a system role's permissions (apps/authorization/
# catalog.py) has no other way to reach an already-created school — this re-syncs every school's
# system roles (Principal, Teacher, ...) to the current catalog spec on every deploy. Idempotent
# when nothing changed; only touches system roles, never a school's own custom ones.
python manage.py resync_role_permissions
python manage.py provision_student_accounts
exec gunicorn config.wsgi:application -c deploy/gunicorn.conf.py
