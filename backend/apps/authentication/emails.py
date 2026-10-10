from django.utils.html import escape

from apps.common.email import email_button, school_link, send_email


def _send(user, subject: str, body: str) -> bool:
    """Every account email goes out in the school-branded template (see apps.common.email)."""
    return send_email(
        to_email=user.email,
        to_name=user.full_name,
        subject=subject,
        html_content=body,
        school=user.school,
    )


def send_invitation_email(*, user, uidb64: str, token: str, request=None) -> bool:
    url = school_link(user.school, f"/accept-invitation?uid={uidb64}&token={token}", request)
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>You've been invited to join {escape(user.school.name) if user.school else 'the platform'}.
        Set your password to activate your account.</p>
        {email_button(url, "Accept invitation", user.school)}
        <p style="margin-top:16px;">This link expires in 3 days.</p>
    """
    return _send(user, "You're invited — set up your account", body)


def send_account_created_email(*, user, password: str, role_label: str, request=None) -> bool:
    """Tells a newly-provisioned account holder how to sign in: their email plus the default
    password they were given (a school's default, or the platform-admin default) — both are
    already knowable to whoever created the account, so putting the password in this one email
    isn't disclosing a secret. The account is flagged `must_change_password`, so this password
    only ever works for the first sign-in.
    """
    url = school_link(user.school, "/login", request)
    school_bit = f" at <strong>{escape(user.school.name)}</strong>" if user.school else ""
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>An account has been created for you{school_bit} as <strong>{escape(role_label)}</strong>.
        Use the details below to sign in.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;
               border-radius:10px;padding:14px 18px;width:100%;">
          <tr><td style="padding:3px 0;color:#64748b;">Email</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(user.email)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Temporary password</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(password)}</td></tr>
        </table>
        <p>You'll be asked to choose your own password the first time you sign in.</p>
        {email_button(url, "Sign in", user.school)}
    """
    return _send(user, "Your account is ready — sign-in details inside", body)


def send_verification_email(*, user, uidb64: str, token: str, request=None) -> bool:
    url = school_link(user.school, f"/verify-email?uid={uidb64}&token={token}", request)
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>Please confirm your email address.</p>
        {email_button(url, "Verify email", user.school)}
    """
    return _send(user, "Verify your email address", body)


def send_password_reset_email(*, user, uidb64: str, token: str, request=None) -> bool:
    url = school_link(user.school, f"/reset-password?uid={uidb64}&token={token}", request)
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>We received a request to reset your password. This link expires shortly and can
        only be used once.</p>
        {email_button(url, "Reset password", user.school)}
        <p style="margin-top:16px;">If you didn't request this, your password is still safe —
        no changes have been made.</p>
    """
    return _send(user, "Reset your password", body)


def send_staff_terminated_email(*, user) -> bool:
    """Tells a just-terminated staff member their employment has ended and their account no
    longer has access — sent before the account is deactivated so the email itself still goes
    through the normal (branded, school-identified) channel."""
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>This is to inform you that your employment{f" at {escape(user.school.name)}" if user.school else ""}
        has ended. Your account no longer has access to the system.</p>
        <p>If you believe this is a mistake, please contact your school administrator.</p>
    """
    return _send(user, "Your employment has ended", body)


def send_password_changed_email(*, user) -> bool:
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>Your password was just changed. If this wasn't you, contact your school
        administrator immediately.</p>
    """
    return _send(user, "Your password was changed", body)


def send_account_locked_email(*, user, minutes: int) -> bool:
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>There were several failed sign-in attempts on your account, so we've temporarily
        locked it for {minutes} minutes as a precaution.</p>
        <p>If this was you, wait and try again. If it wasn't, someone may be guessing your
        password &mdash; we recommend resetting it once the lock ends.</p>
    """
    return _send(user, "Your account was temporarily locked", body)


def send_security_notice_email(*, user, subject: str, message: str) -> bool:
    """Tell the account owner about a security-relevant change, so a takeover can't go unnoticed."""
    body = f"""
        <p>Hi {escape(user.first_name)},</p>
        <p>{escape(message)}</p>
        <p>If you did not do this, contact your administrator straight away and change your password.</p>
    """
    return _send(user, subject, body)
