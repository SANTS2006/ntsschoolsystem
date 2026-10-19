from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.authorization.models import UserRole
from apps.authorization.services import active_role_slug, get_user_permission_codes

User = get_user_model()


class SchoolSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    logo = serializers.FileField(use_url=True, allow_null=True)
    school_type = serializers.CharField()
    # Top of the grade-point scale (4.00 / 5.00) — only meaningful for tertiary institutions.
    grade_point_scale = serializers.DecimalField(max_digits=3, decimal_places=2)


class CurrentUserSerializer(serializers.Serializer):
    """Read-only snapshot for the `/auth/me/` endpoint — never accepts input."""

    id = serializers.UUIDField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    full_name = serializers.CharField()
    phone_number = serializers.CharField()
    photo = serializers.FileField(use_url=True)
    user_type = serializers.CharField()
    is_platform_admin = serializers.BooleanField()
    is_email_verified = serializers.BooleanField()
    is_online = serializers.BooleanField()
    school = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    available_roles = serializers.SerializerMethodField()
    active_role_slug = serializers.SerializerMethodField()
    needs_role_choice = serializers.SerializerMethodField()
    is_student = serializers.SerializerMethodField()
    is_staff_member = serializers.SerializerMethodField()
    has_salary = serializers.SerializerMethodField()
    two_factor_enabled = serializers.SerializerMethodField()
    two_factor_required = serializers.SerializerMethodField()
    must_change_password = serializers.BooleanField(read_only=True)

    def get_two_factor_enabled(self, user):
        from . import two_factor

        return two_factor.is_enabled(user)

    def get_two_factor_required(self, user):
        from . import two_factor

        return two_factor.is_required_for(user)

    def get_school(self, user):
        if user.school is None:
            return None
        return SchoolSummarySerializer(user.school).data

    def get_permissions(self, user):
        return sorted(get_user_permission_codes(user))

    def get_roles(self, user):
        # `user.user_roles` (the reverse-FK related manager) resolves through `UserRole`'s
        # default *tenant-scoped* manager, which reads the request-bound ContextVar set by
        # `TenantContextMixin.perform_authentication()`. `LoginView` builds this same serializer
        # before that context ever gets set (the user isn't authenticated at the start of their
        # own login request), so that lookup would silently come back empty there — the sidebar
        # would render with no roles at all until the next `/auth/me/` call (which does run
        # through `TenantContextMixin`) refetches it correctly. `unscoped_objects` filtered
        # explicitly by `user=user` is correct regardless of request context, exactly like
        # `get_permissions` above already does — never rely on ambient tenant scoping in a
        # serializer that may be built from a not-yet-authenticated request.
        # Each role's own permission codes (not the flat cross-role union `permissions` above) —
        # lets the frontend's role switcher (useActiveRole) filter the sidebar down to exactly
        # what one held role alone would grant, purely cosmetic: the backend still authorizes
        # every request against the full union regardless of which role is "active" client-side.
        # Once the user has chosen a role to work as, this lists only that role: the rest of the app (menus, role
        # checks, "who am I") then sees them as holding exactly that one role. Everything they hold is in
        # `available_roles`, which only the role switcher uses.
        active = active_role_slug(user)
        rows = UserRole.unscoped_objects.filter(user=user).select_related("role")
        if active is not None:
            rows = rows.filter(role__slug=active)
        return [
            {
                "id": ur.role_id,
                "name": ur.role.name,
                "slug": ur.role.slug,
                "permissions": sorted(ur.role.permissions.values_list("code", flat=True)),
            }
            for ur in rows
        ]

    def _held_roles(self, user):
        if not hasattr(user, "_held_roles_cache"):
            user._held_roles_cache = list(
                UserRole.unscoped_objects.filter(user=user, role__is_active=True)
                .select_related("role")
                .order_by("role__name")
            )
        return user._held_roles_cache

    def get_available_roles(self, user):
        return [{"id": ur.role_id, "name": ur.role.name, "slug": ur.role.slug} for ur in self._held_roles(user)]

    def get_active_role_slug(self, user):
        return active_role_slug(user)

    def get_needs_role_choice(self, user):
        """A person with more than one role must pick which to work as before they get in."""
        return len(self._held_roles(user)) > 1 and active_role_slug(user) is None

    def get_is_student(self, user):
        # Student portal accounts hold zero RBAC permissions (never assigned a Role), so nothing
        # in `permissions` above can distinguish them — every `My...View` across the backend
        # already keys off this exact same `student_profile` presence check; this just surfaces
        # that same signal to the frontend so the sidebar can gate self-service-only nav items
        # (My Transcript/My Lessons/My Live Sessions/etc.) without a permission code to hang them on.
        #
        # `user.student_profile` is a reverse one-to-one descriptor, which (like `user.user_roles`
        # above) resolves through Student's tenant-scoped manager — same not-yet-authenticated-
        # request pitfall on `LoginView`. Querying `Student.unscoped_objects` directly by `user_id`
        # sidesteps that; it's still exactly one row, scoped by the OneToOne's own uniqueness, not
        # by anything client-controlled.
        from apps.students.models import Student

        return Student.unscoped_objects.filter(user_id=user.pk).exists()

    def get_is_staff_member(self, user):
        from apps.staff.models import Staff

        return Staff.unscoped_objects.filter(user_id=user.pk).exists()

    def get_has_salary(self, user):
        """Whether this person is on a pay plan, which is what puts "My salary" in their sidebar."""
        from apps.salary.models import StaffSalaryAssignment

        return StaffSalaryAssignment.unscoped_objects.filter(staff__user_id=user.pk).exists()


class MeUpdateSerializer(serializers.ModelSerializer):
    """Self-service profile edit — deliberately separate from `CurrentUserSerializer` (that one
    stays read-only) and from `UserSerializer` (that one is permission-gated, admin-facing, and
    scoped to `users.update`; this one is `IsAuthenticated`-only, every user edits only themselves
    via `request.user` in the view, never an arbitrary id). `email`'s `unique=True` gives DRF's
    automatic `UniqueValidator` for free, correctly excluding the caller's own row since the view
    always passes `instance=request.user`."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "phone_number", "photo"]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    # The school whose sign-in page was used (the part of the address after the site name). Left out on the
    # platform's own sign-in page.
    school_slug = serializers.CharField(required=False, allow_blank=True, max_length=255, write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        from apps.tenants.services import is_default_password

        user = self.context["request"].user
        if is_default_password(user, value):
            raise serializers.ValidationError("Choose a password of your own - the school's default password isn't allowed.")
        validate_password(value, user=user)
        return value


class EmailVerificationConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class AcceptInvitationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value


class TwoFactorTokenSerializer(serializers.Serializer):
    two_factor_token = serializers.CharField(max_length=2000)


class TwoFactorCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64, trim_whitespace=True)


class TwoFactorChallengeCodeSerializer(TwoFactorTokenSerializer, TwoFactorCodeSerializer):
    pass


class PasswordConfirmSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class PasswordAndCodeSerializer(PasswordConfirmSerializer, TwoFactorCodeSerializer):
    pass


class TwoFactorAdminResetSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
