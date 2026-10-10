from django.db import models

from .context import get_current_school_id, is_platform_admin_context


class TenantQuerySet(models.QuerySet):
    pass


class TenantManager(models.Manager):
    """
    Default manager for every tenant-owned model.

    Scoping is derived exclusively from the request-bound context set by
    TenantContextMixin (which in turn is derived from the authenticated
    user's school, or — for a platform admin only — an explicit acting-
    school header, see apps.tenants.mixins.ACTING_SCHOOL_HEADER) — never
    from a client-supplied school id on the model/queryset itself. If no
    tenant context is present, queries return an empty set rather than
    leaking cross-tenant rows. Platform-admin code paths that legitimately
    need cross-tenant access (the Platform console's own school-management
    views) must go through `unscoped_objects` explicitly, or simply not set
    an acting-school header.

    A `school_id` in context always wins, whether it came from a normal
    school user's own account or a platform admin's acting-school header —
    only a platform admin with *no* acting school set falls through to the
    fully unscoped case below.
    """

    def get_queryset(self):
        qs = TenantQuerySet(self.model, using=self._db)
        school_id = get_current_school_id()
        if school_id is not None:
            return qs.filter(school_id=school_id)
        if is_platform_admin_context():
            return qs
        return qs.none()


class UnscopedManager(models.Manager):
    """Explicit, intentional bypass of tenant scoping — platform-admin
    services, management commands, and data migrations only. Never expose
    this manager through a standard school-facing API view."""

    pass
