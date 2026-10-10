from django.db import transaction

from apps.audit.services import log_action

from .models import User


@transaction.atomic
def invite_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    school=None,
    user_type: str = User.UserType.SCHOOL_USER,
    invited_by=None,
    role_label: str | None = None,
    request=None,
) -> User:
    """
    Every invited account — platform admin or school user — is active immediately with a
    deterministic default password (a school's, or the shared platform-admin one; see
    apps.tenants.services), flagged `must_change_password`, and emailed those sign-in details.
    The password is knowable/reproducible by design rather than random: an administrator can
    reset any of their users back to this same value later (see the `reset_password` actions on
    Staff/Parent/PlatformAdmin), which only makes sense if the value doesn't move around, and
    it's already knowable to whoever created the account, so putting it in one first email isn't
    disclosing anything new.
    """
    from apps.authentication.emails import send_account_created_email
    from apps.tenants.services import PLATFORM_ADMIN_DEFAULT_PASSWORD, generate_default_password

    if user_type == User.UserType.PLATFORM_ADMIN and school is not None:
        raise ValueError("Platform admins cannot belong to a school.")
    if user_type == User.UserType.SCHOOL_USER and school is None:
        raise ValueError("A school is required to invite a school user.")

    is_platform_admin = user_type == User.UserType.PLATFORM_ADMIN
    password = PLATFORM_ADMIN_DEFAULT_PASSWORD if is_platform_admin else generate_default_password(school)

    user = User.objects.create(
        email=email,
        first_name=first_name,
        last_name=last_name,
        school=school,
        user_type=user_type,
        is_active=True,
    )
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])

    user.invite_email_sent = send_account_created_email(
        user=user,
        password=password,
        role_label=role_label or ("platform administrator" if is_platform_admin else "a school user"),
        request=request,
    )

    log_action(
        action="users.invited",
        actor=invited_by,
        school=school,
        entity_type="User",
        entity_id=str(user.pk),
        after={"email": user.email, "user_type": user.user_type},
    )
    return user
