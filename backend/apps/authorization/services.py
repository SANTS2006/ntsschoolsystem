from django.db import transaction

from .catalog import DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSION_PREFIXES, PERMISSION_CATALOG
from .models import Permission, Role, RolePermission, SuppressedSystemRole, UserRole

ALL_PERMISSIONS_SENTINEL = "*"


def seed_permission_catalog():
    """
    Idempotent. Safe to re-run whenever PERMISSION_CATALOG changes. Bulk
    create/update rather than one update_or_create per entry — same
    network-round-trip-count reasoning as seed_default_roles_for_school.
    """
    existing = {p.code: p for p in Permission.objects.all()}
    to_create, to_update = [], []
    for code, name, module in PERMISSION_CATALOG:
        perm = existing.get(code)
        if perm is None:
            to_create.append(Permission(code=code, name=name, module=module))
        elif perm.name != name or perm.module != module:
            perm.name, perm.module = name, module
            to_update.append(perm)

    with transaction.atomic():
        if to_create:
            Permission.objects.bulk_create(to_create)
        if to_update:
            Permission.objects.bulk_update(to_update, ["name", "module"])


def _normalize_spec(spec) -> tuple[list[str], list[str]]:
    """A `DEFAULT_ROLE_PERMISSION_PREFIXES` entry is either a plain list of prefixes (shorthand
    for "include these, exclude nothing") or an explicit `{"include": [...], "exclude": [...]}`
    dict, for a role that needs to grant a broad prefix and then take a few specific codes back
    (e.g. Principal: `""` minus a handful of narrowed/removed modules) — a plain prefix allow-list
    has no subtraction operator on its own."""
    if isinstance(spec, dict):
        return spec["include"], spec.get("exclude", [])
    return spec, []


def seed_default_roles_for_school(school):
    """
    Creates/updates the standard system roles for a school, syncing each one's permissions to
    exactly match its catalog spec — both granting what's newly included and revoking what's no
    longer included. Called at school-creation time (Phase 5) and by every re-run of
    `resync_role_permissions` (needed whenever `DEFAULT_ROLE_PERMISSION_PREFIXES` changes, not
    just when new permission codes are added — narrowing a role's prefixes must actually revoke
    the permissions it no longer lists, not just leave them in place forever).

    Deliberately scoped to `is_system=True` roles only: `update_or_create(..., defaults={
    "is_system": True, ...})` only ever fires for the known slugs in this dict, so a school's
    own custom role (a different `Role` row under a different slug) is never touched — full sync
    here can never reach into a role a school admin built and customized themselves.

    Bulk-creates/deletes RolePermission rows rather than looping get_or_create/delete per
    permission — with N roles x M permissions that was O(N*M) individual round trips (real
    network latency against Neon, not just local SQLite), which turned a handful of test calls
    into a multi-minute test run.
    """
    all_permissions = list(Permission.objects.all())

    with transaction.atomic():
        suppressed = set(
            SuppressedSystemRole.unscoped_objects.filter(school=school).values_list("slug", flat=True)
        )
        for slug, spec in DEFAULT_ROLE_PERMISSION_PREFIXES.items():
            if slug in suppressed:
                continue  # the school deleted this standard role on purpose; don't bring it back
            include, exclude = _normalize_spec(spec)
            role = Role.unscoped_objects.filter(school=school, slug=slug).first()
            if role is None:
                role = Role.unscoped_objects.create(
                    school=school, slug=slug, name=DEFAULT_ROLE_NAMES[slug], is_system=True, is_active=True
                )
            elif not role.customized:
                # An untouched default role is re-pinned to the code's version of it.
                role.name, role.is_system, role.is_active = DEFAULT_ROLE_NAMES[slug], True, True
                role.save(update_fields=["name", "is_system", "is_active", "updated_at"])
            desired_ids = {
                p.id
                for p in all_permissions
                if any(p.code.startswith(prefix) for prefix in include)
                and not any(p.code == ex or p.code.startswith(ex) for ex in exclude)
            }
            existing_ids = set(
                RolePermission.unscoped_objects.filter(role=role).values_list("permission_id", flat=True)
            )
            to_add = desired_ids - existing_ids
            if role.customized:
                # Keep exactly what the school chose. Only permissions introduced since it was last
                # customized/synced are offered (added if the code's defaults include them).
                known = set(role.known_permission_codes)
                code_by_id = {p.id: p.code for p in all_permissions}
                to_add = {pid for pid in to_add if code_by_id[pid] not in known}
                to_remove = set()
                role.known_permission_codes = sorted(code_by_id.values())
                role.save(update_fields=["known_permission_codes", "updated_at"])
            else:
                to_remove = existing_ids - desired_ids
            if to_add:
                RolePermission.unscoped_objects.bulk_create(
                    [RolePermission(school=school, role=role, permission_id=pid) for pid in to_add]
                )
            if to_remove:
                RolePermission.unscoped_objects.filter(role=role, permission_id__in=to_remove).delete()

        # A system role dropped from the catalog (e.g. Registrar, IT Administrator) must not linger
        # in existing schools — remove it (and, by cascade, its permissions and assignments) — unless
        # the school customized it. A school's own custom roles (is_system=False) are never touched.
        Role.unscoped_objects.filter(school=school, is_system=True, customized=False).exclude(
            slug__in=DEFAULT_ROLE_PERMISSION_PREFIXES.keys()
        ).delete()


def active_role_slug(user) -> str | None:
    """The role a multi-role user has chosen to work as, or None.

    The web app sends it on every request (`X-Active-Role`; see CookieJWTAuthentication, which stores it on the user
    object for the duration of the request). It is only honoured if the user really holds that role and it is active —
    a made-up or someone-else's slug is ignored, so it can only ever narrow what the user can do to one of their own
    roles, never widen it."""
    slug = getattr(user, "active_role_slug", None)
    if not slug or user is None or not user.is_authenticated:
        return None
    cached = getattr(user, "_active_role_checked", None)
    if cached is not None and cached[0] == slug:
        return cached[1]
    held = UserRole.unscoped_objects.filter(user=user, role__slug=slug, role__is_active=True).exists()
    user._active_role_checked = (slug, slug if held else None)
    return slug if held else None


def user_has_active_role(user, slug: str) -> bool:
    """Does the user count as holding `slug` right now? With an active role chosen, only that role counts — someone
    working as an Accountant is not a Teacher for the purposes of what they see, even if they also hold that role."""
    active = active_role_slug(user)
    if active is not None:
        return active == slug
    return UserRole.unscoped_objects.filter(user=user, role__slug=slug).exists()


def get_user_permission_codes(user) -> set[str]:
    if user is None or not user.is_authenticated:
        return set()
    if getattr(user, "is_platform_admin", False) or user.is_superuser:
        return {ALL_PERMISSIONS_SENTINEL}

    cached = getattr(user, "_permission_codes_cache", None)
    if cached is not None:
        return cached

    query = Permission.objects.filter(
        role_permissions__role__user_roles__user=user,
        role_permissions__role__is_active=True,
    )
    active = active_role_slug(user)
    if active is not None:
        # Working as one role: that role's permissions and nothing from the user's other roles.
        query = query.filter(role_permissions__role__slug=active)
    codes = set(query.values_list("code", flat=True))
    user._permission_codes_cache = codes
    return codes


def user_has_permission(user, code: str) -> bool:
    codes = get_user_permission_codes(user)
    return ALL_PERMISSIONS_SENTINEL in codes or code in codes


def users_with_permission(school, code: str):
    """All active users in `school` who currently hold `code` via any active role — for
    system-generated notifications that need to reach "whoever manages X" (e.g. an inventory
    low-stock alert) rather than one record's own owner. Not for authorization checks — use
    `user_has_permission` for those; this does one join query, not a per-user cache lookup."""
    from apps.users.models import User

    return User.objects.filter(
        school=school,
        is_active=True,
        user_roles__role__is_active=True,
        user_roles__role__role_permissions__permission__code=code,
    ).distinct()


def assign_role(*, user, role, assigned_by=None):
    """
    Uses `unscoped_objects` deliberately: this function is called from
    request-scoped views (tenant context set) *and* from management
    commands/services with no ambient context at all. The explicit
    `role.school_id != user.school_id` check above is what makes that safe
    — get_or_create on the tenant-scoped `objects` manager would silently
    return an empty match under no context and then try to re-insert an
    already-existing row, raising a duplicate-key IntegrityError.
    """
    if role.school_id != user.school_id:
        raise ValueError("Cannot assign a role from a different school.")
    return UserRole.unscoped_objects.get_or_create(
        school=user.school,
        user=user,
        role=role,
        defaults={"assigned_by": assigned_by},
    )


def unassign_role(*, user, role):
    """The `assign_role` counterpart — removes a single role from a user, a no-op if they didn't
    hold it. `unscoped_objects` for the same reason as `assign_role`: safe to call from both
    request-scoped views and no-ambient-context management commands/services."""
    UserRole.unscoped_objects.filter(user=user, role=role).delete()


@transaction.atomic
def set_user_roles(*, user, roles, assigned_by=None):
    """Replaces a user's full set of held roles with exactly `roles` (an iterable of Role
    instances, all already confirmed to belong to `user.school`) — adds whatever's newly
    included via `assign_role`, removes whatever's no longer included via `unassign_role`. The
    higher-level primitive behind the staff "manage roles" multi-select UI; `assign_role`/
    `unassign_role` remain the right calls for a single add/remove elsewhere (e.g. invite-time,
    where a brand-new user has no prior roles to reconcile against)."""
    desired = {role.id: role for role in roles}
    current_ids = set(UserRole.unscoped_objects.filter(user=user).values_list("role_id", flat=True))

    for role_id, role in desired.items():
        if role_id not in current_ids:
            assign_role(user=user, role=role, assigned_by=assigned_by)

    stale_ids = current_ids - set(desired.keys())
    if stale_ids:
        UserRole.unscoped_objects.filter(user=user, role_id__in=stale_ids).delete()
