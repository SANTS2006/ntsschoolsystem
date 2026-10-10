import re

from django.db import transaction

from apps.audit.services import log_action
from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school

from .context import get_current_school_id
from .models import School


# Platform admins have no school to derive a per-school default password from, so they share
# this one fixed default instead. Same handling as a school's default everywhere else: it's set
# on invite, forces a change at next sign-in, and can never be *chosen* as the new password.
PLATFORM_ADMIN_DEFAULT_PASSWORD = "ntsschoolsystem@2026"


def get_current_school() -> School | None:
    """The school for the current request's tenant context — a normal school user's own school,
    or (for a platform admin) whichever school they're currently "viewing" via the acting-school
    header (see apps.tenants.mixins.ACTING_SCHOOL_HEADER). `None` if there's no school in context
    at all (e.g. a platform admin browsing the Platform console itself, not viewing any school).

    Views that need "the current school" as an object — not just for tenant-scoped queryset
    filtering, which `TenantManager` already handles automatically — should use this instead of
    reading `request.user.school` directly, since that's always `None` for a platform admin
    regardless of any acting-school header they've set."""
    school_id = get_current_school_id()
    if school_id is None:
        return None
    return School.objects.filter(pk=school_id).first()


def generate_default_password(school: School) -> str:
    """Every school-scoped user is provisioned with this same, deterministic password —
    initials of each word in the school's name (uppercased) + `@` + the year the school itself
    was created (never the individual user's own invite date, so "reset to default" always
    recomputes the exact same value regardless of when a given user was added). E.g. "Demo
    Academy" created in 2026 -> "DA@2026"."""
    initials = "".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", school.name)).upper()
    return f"{initials}@{school.created_at.year}"


def is_default_password(user, raw_password: str) -> bool:
    """True if `raw_password` is the guessable default for this account: the per-school default
    for a school user, or the shared platform-admin default. Such a password must never be
    *chosen*: it is public knowledge to anyone who knows the school's name (or, for a platform
    admin, to anyone who has read this codebase)."""
    from apps.users.models import User

    if not raw_password:
        return False
    raw = raw_password.strip().lower()
    if user.user_type == User.UserType.PLATFORM_ADMIN:
        return raw == PLATFORM_ADMIN_DEFAULT_PASSWORD.lower()
    if user.school_id is None:
        return False
    return raw == generate_default_password(user.school).lower()


@transaction.atomic
def create_school(
    *,
    name: str,
    slug: str,
    admin_email: str,
    admin_first_name: str,
    admin_last_name: str,
    created_by=None,
    request=None,
    **school_fields,
) -> School:
    """
    Creates the school (status=pending — a platform admin must explicitly
    activate it), seeds its default roles, and invites the first school
    administrator. The school stays inactive (so its users cannot log in —
    see apps.authentication.views.LoginView) until activated.
    """
    from apps.users.models import User
    from apps.users.services import invite_user

    school = School.objects.create(
        name=name, slug=slug, status=School.Status.PENDING, **school_fields
    )
    seed_default_roles_for_school(school)

    admin_user = invite_user(
        email=admin_email,
        first_name=admin_first_name,
        last_name=admin_last_name,
        school=school,
        user_type=User.UserType.SCHOOL_USER,
        invited_by=created_by,
        role_label="School Administrator",
        request=request,
    )
    admin_role = Role.unscoped_objects.get(school=school, slug="school-administrator")
    assign_role(user=admin_user, role=admin_role, assigned_by=created_by)

    log_action(
        action="platform.school_created",
        actor=created_by,
        school=school,
        entity_type="School",
        entity_id=str(school.pk),
        after={"name": school.name, "slug": school.slug},
    )
    return school


def activate_school(*, school: School, actor=None) -> School:
    school.status = School.Status.ACTIVE
    school.suspended_reason = ""
    school.save(update_fields=["status", "suspended_reason"])
    log_action(
        action="platform.school_activated",
        actor=actor,
        school=school,
        entity_type="School",
        entity_id=str(school.pk),
    )
    return school


def suspend_school(*, school: School, reason: str = "", actor=None) -> School:
    school.status = School.Status.SUSPENDED
    school.suspended_reason = reason
    school.save(update_fields=["status", "suspended_reason"])
    log_action(
        action="platform.school_suspended",
        actor=actor,
        school=school,
        entity_type="School",
        entity_id=str(school.pk),
        severity="warning",
        metadata={"reason": reason},
    )
    return school


class SchoolDeletionBlocked(Exception):
    """Raised when something still references the school in a way that must be removed by hand first."""


def delete_school(*, school: School, actor=None) -> None:
    """Permanently deletes a *suspended* school and everything it owns (people, academic, finance and other records).

    A school's users are removed first (they are protected references), then the school, which cascades the rest, all in
    one transaction: either everything goes or nothing does. The audit entry is kept (its school link is cleared) with the
    name and slug recorded so there is still a trace of what was removed and by whom."""
    from django.db import transaction
    from django.db.models import ProtectedError

    from apps.users.models import User

    if school.status != School.Status.SUSPENDED:
        raise SchoolDeletionBlocked("Suspend the school before deleting it.")
    snapshot = {"name": school.name, "slug": school.slug, "id": str(school.pk)}
    try:
        with transaction.atomic():
            User._base_manager.filter(school=school).delete()
            school.delete()
    except ProtectedError as exc:
        raise SchoolDeletionBlocked("Some of this school's records are still referenced elsewhere, so it could not be deleted.") from exc
    log_action(
        action="platform.school_deleted",
        actor=actor,
        entity_type="School",
        entity_id=snapshot["id"],
        severity="critical",
        metadata=snapshot,
    )
