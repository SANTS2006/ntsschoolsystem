"""The e-mail the NTS team receives when someone fills in the website's demo-request or contact form.

A complete, self-contained HTML document (inline styles only, as mail clients require). Everything the visitor typed is
escaped; nothing in here is trusted markup except what this module builds."""

from html import escape

from django.conf import settings
from django.utils import timezone

from apps.common.email import PLATFORM_NAME

from .models import Enquiry

NAVY = "#0b2545"
BLUE = "#1d4ed8"
TEAL = "#0f9f92"

LABELS = {
    "school_type": {
        "nursery_primary": "Nursery / primary", "secondary": "Secondary", "tertiary": "College / university",
        "vocational": "Vocational / training", "group": "Group of schools", "other": "Other",
    },
    "interests": {
        "students": "Student records", "admissions": "Admissions", "academics": "Academics & timetables",
        "attendance": "Attendance", "exams": "Exams & results", "finance": "Fees & finance",
        "communication": "Communication", "library_hostel_transport": "Library, hostel & transport",
        "reports": "Reports", "administration": "Roles & administration", "other": "Other",
    },
    "preferred_contact": {"email": "E-mail", "phone": "Phone call", "whatsapp": "WhatsApp"},
    "topic": {"general": "General question", "pricing": "Pricing", "support": "Support", "partnership": "Partnership", "other": "Something else"},
}


def _label(group: str, value: str) -> str:
    return LABELS[group].get(value, value.replace("_", " ").capitalize())


def _digits(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _button(url: str, label: str, background: str, color: str = "#ffffff") -> str:
    return (
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 22px;'
        f"background:{background};color:{color};text-decoration:none;border-radius:8px;font-size:14px;"
        f'font-weight:600;">{escape(label)}</a>'
    )


def enquiry_subject(enquiry: Enquiry) -> str:
    who = enquiry.organization or enquiry.name
    if enquiry.kind == Enquiry.Kind.DEMO:
        return f"New demo request — {who}"
    return f"New website message — {enquiry.name}" + (f" ({_label('topic', enquiry.topic)})" if enquiry.topic else "")


def render_enquiry_email(enquiry: Enquiry) -> str:
    is_demo = enquiry.kind == Enquiry.Kind.DEMO
    heading = "New demo request" if is_demo else "New message from the website"
    accent = BLUE if is_demo else TEAL
    reference = str(enquiry.pk)[:8].upper()
    received = timezone.localtime(enquiry.created_at).strftime("%d %B %Y, %H:%M")

    rows = [("Name", enquiry.name), ("E-mail", enquiry.email), ("Phone / WhatsApp", enquiry.phone)]
    if is_demo:
        rows += [
            ("School / organisation", enquiry.organization),
            ("Type of school", _label("school_type", enquiry.school_type) if enquiry.school_type else ""),
            ("Number of students", enquiry.student_count),
            ("Interested in", ", ".join(_label("interests", i) for i in enquiry.interests)),
            ("Best way to reach them", _label("preferred_contact", enquiry.preferred_contact) if enquiry.preferred_contact else ""),
        ]
    else:
        rows += [("Topic", _label("topic", enquiry.topic) if enquiry.topic else "")]

    table = "".join(
        f'<tr><td style="padding:9px 14px 9px 0;width:38%;vertical-align:top;color:#64748b;font-size:13px;'
        f'border-bottom:1px solid #eef2f7;">{escape(label)}</td>'
        f'<td style="padding:9px 0;vertical-align:top;color:#0f172a;font-size:14px;font-weight:500;'
        f'border-bottom:1px solid #eef2f7;">{escape(value)}</td></tr>'
        for label, value in rows
        if value
    )

    message = ""
    if enquiry.message.strip():
        message = (
            '<div style="margin-top:22px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;'
            f'color:{accent};">Their message</div>'
            '<div style="margin-top:8px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;'
            f'border-left:4px solid {accent};border-radius:8px;color:#1e293b;font-size:14px;line-height:1.7;">'
            f'{escape(enquiry.message).replace(chr(10), "<br>")}</div>'
        )

    buttons = _button(f"mailto:{enquiry.email}?subject=Re: {escape(heading)}", "Reply by e-mail", accent)
    if enquiry.phone:
        buttons += _button(f"tel:+{_digits(enquiry.phone)}" if enquiry.phone.strip().startswith("+") else f"tel:{_digits(enquiry.phone)}", "Call", NAVY)
        buttons += _button(f"https://wa.me/{_digits(enquiry.phone)}", "WhatsApp", "#16a34a")

    console = f"{settings.FRONTEND_URL.rstrip('/')}/platform/enquiries"
    preheader = f"{enquiry.name} — {enquiry.organization or enquiry.email}"

    return f"""<!doctype html>
<html lang="en">
  <body style="margin:0;padding:28px 12px;background:#eef2f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;
           border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 8px 30px rgba(11,37,69,.12);">
      <tr>
        <td style="background:{NAVY};padding:26px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9fb6d8;">{escape(PLATFORM_NAME)} · Website enquiry</div>
          <div style="margin-top:8px;font-size:23px;font-weight:700;line-height:1.25;">{escape(heading)}</div>
          <div style="margin-top:12px;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:{accent};
               color:#ffffff;font-size:12px;font-weight:600;">{"Demo request" if is_demo else "Contact message"}</span>
               <span style="margin-left:8px;font-size:12px;color:#9fb6d8;">Reference {escape(reference)}</span></div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{accent};">Contact details</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">{table}</table>
          {message}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 32px 28px;">{buttons}</td>
      </tr>
      <tr>
        <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
          Received {escape(received)} through the public website form. It is stored in the platform and can be marked as handled in the
          <a href="{escape(console, quote=True)}" style="color:{BLUE};text-decoration:none;font-weight:600;">Platform console → Website enquiries</a>.
          <div style="margin-top:6px;color:#94a3b8;">{escape(PLATFORM_NAME)} by NTS Digital Solutions · hello@ntsdigitalsolutions.com · +232 31 034 604</div>
        </td>
      </tr>
    </table>
  </body>
</html>"""
