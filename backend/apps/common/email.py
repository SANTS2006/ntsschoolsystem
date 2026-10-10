import logging
from html import escape

from django.conf import settings

logger = logging.getLogger("apps")

PLATFORM_NAME = "NTS School System"
BRAND_COLOR = "#1565c0"


def frontend_base_url(request=None) -> str:
    """The origin to build emailed links against. In production the backend serves the built
    frontend from the same origin it's answering API requests on (see apps.common.spa) — the
    school currently has both a custom domain and Render's own onrender.com address pointed at
    it, and only one may actually be resolving/certified at a given moment (see
    deploy/README.md). Building the link from whichever host the request itself came in on means
    it always matches a domain that's known to be working right now, rather than a fixed setting
    that could be pointing at the one that isn't. Falls back to `settings.FRONTEND_URL` when
    there's no request to read (a management command, or local dev where the frontend runs on
    its own Vite origin rather than being served by Django)."""
    if request is not None and not settings.DEBUG:
        scheme = "https" if request.is_secure() else "http"
        return f"{scheme}://{request.get_host()}"
    return settings.FRONTEND_URL


def school_link(school, path: str, request=None) -> str:
    """A link into one school's own part of the app: `<origin>/<school slug><path>`. Every link emailed to
    a school's users goes through this, so it lands on that school's pages (and branded login) rather than
    on the generic one. With no school (a platform administrator) it is the plain origin."""
    base = frontend_base_url(request).rstrip("/")
    path = path if path.startswith("/") else f"/{path}"
    return f"{base}/{school.slug}{path}" if school is not None else f"{base}{path}"


def brand_color(school) -> str:
    """The colour that stands for this school in an email — the one the platform admin picked for it, or
    the platform's own blue."""
    return (getattr(school, "primary_color", "") or BRAND_COLOR) if school is not None else BRAND_COLOR


def _absolute_url(url: str, request=None) -> str:
    if not url or url.startswith(("http://", "https://")):
        return url
    return f"{frontend_base_url(request).rstrip('/')}/{url.lstrip('/')}"


def _school_logo_url(school) -> str:
    if school is None:
        return ""
    if school.logo_url:
        return school.logo_url
    try:
        return _absolute_url(school.logo.url) if school.logo else ""
    except Exception:  # a missing/misconfigured storage backend must never block an email
        return ""


def email_button(url: str, label: str, school=None) -> str:
    return (
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;margin-top:18px;padding:12px 26px;'
        f"background:{brand_color(school)};color:#ffffff;text-decoration:none;border-radius:8px;"
        f'font-size:14px;font-weight:600;">{escape(label)}</a>'
    )


def render_email(*, school=None, title: str, body_html: str, preheader: str = "") -> str:
    """The one HTML template every email the system sends goes through: the school's logo and name
    on top, the message in the middle, and the school's contact details underneath — or the
    platform's own name when there is no school (e.g. a platform administrator's emails).
    `body_html` is trusted markup built by the caller (escape any user-supplied text in it)."""
    name = school.name if school else PLATFORM_NAME
    logo_url = _school_logo_url(school)
    logo = (
        f'<img src="{escape(logo_url, quote=True)}" alt="" width="56" height="56" '
        'style="display:block;margin:0 auto 10px;border-radius:12px;object-fit:cover;">'
        if logo_url
        else ""
    )
    motto = (
        f'<div style="margin-top:4px;font-size:12px;color:#dbeafe;font-style:italic;">{escape(school.motto)}</div>'
        if school and school.motto
        else ""
    )
    contact_bits = []
    if school:
        contact_bits = [bit for bit in (school.address, school.phone_number, school.email) if bit]
    contact = f'<div style="margin-top:6px;">{escape(" · ".join(contact_bits))}</div>' if contact_bits else ""

    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#f1f5f9;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;
           background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
      <tr>
        <td style="background:{brand_color(school)};padding:24px 28px;text-align:center;color:#ffffff;">
          {logo}
          <div style="font-size:19px;font-weight:700;line-height:1.3;">{escape(name)}</div>
          {motto}
        </td>
      </tr>
      <tr>
        <td style="padding:28px;color:#334155;font-size:14px;line-height:1.65;">
          <h2 style="margin:0 0 14px;font-size:18px;color:#0f172a;">{escape(title)}</h2>
          {body_html}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
          <div>If you didn't expect this email, you can safely ignore it.</div>
          {contact}
          <div style="margin-top:6px;">Sent via {PLATFORM_NAME}</div>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def send_email(
    *, to_email: str, to_name: str, subject: str, html_content: str, school=None, branded: bool = True
) -> bool:
    """
    Thin wrapper around Brevo's transactional email API. Returns True/False
    rather than raising, so a flaky email provider never breaks a request
    that also needs to persist a DB change — callers should log/audit the
    outcome, not depend on it for control flow.

    With `branded` (the default) `html_content` is the message body and is placed inside the
    school-branded template (see `render_email`); pass `branded=False` for a complete document.
    """
    if not settings.BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not configured; skipping email to %s (subject=%r)", to_email, subject)
        return False

    if branded:
        html_content = render_email(school=school, title=subject, body_html=html_content, preheader=subject)

    try:
        import sib_api_v3_sdk

        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key["api-key"] = settings.BREVO_API_KEY
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))
        email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": to_name}],
            sender={"email": settings.BREVO_SENDER_EMAIL, "name": settings.BREVO_SENDER_NAME},
            subject=subject,
            html_content=html_content,
        )
        api_instance.send_transac_email(email)
        return True
    except Exception as exc:  # network errors, SDK errors, and Brevo's own ApiException alike
        body = getattr(exc, "body", "")
        logger.error(
            "Email send failed to %s (subject=%r, sender=%s): %s %s",
            to_email,
            subject,
            settings.BREVO_SENDER_EMAIL,
            exc.__class__.__name__,
            body or exc,
            exc_info=True,
        )
        return False
