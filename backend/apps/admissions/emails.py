from django.utils.html import escape

from apps.common.email import email_button, school_link, send_email


def _send_to_applicant(application, subject: str, body_html: str) -> bool:
    """Every applicant email goes through the same school-branded template (see
    apps.common.email) — applicants have no User account until acceptance, so this can't reuse
    apps.authentication.emails._send (which reads user.email/user.school), it takes the
    application's own submitted contact details and school FK directly instead."""
    return send_email(
        to_email=application.email,
        to_name=application.full_name,
        subject=subject,
        html_content=body_html,
        school=application.school,
    )


def send_interview_invite_email(*, application, request=None) -> bool:
    when = (
        application.interview_datetime.strftime("%A, %d %B %Y at %H:%M")
        if application.interview_datetime
        else "To be confirmed"
    )
    rows = [("Date &amp; time", when)]
    if application.interview_location:
        rows.append(("Location", escape(application.interview_location)))
    table_rows = "".join(
        f'<tr><td style="padding:3px 0;color:#64748b;">{label}</td>'
        f'<td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{value}</td></tr>'
        for label, value in rows
    )
    notes_html = f"<p>{escape(application.interview_notes)}</p>" if application.interview_notes else ""
    body = f"""
        <p>Hi {escape(application.first_name)},</p>
        <p>Thank you for applying to <strong>{escape(application.school.name)}</strong>. We'd like to invite
        you for an interview.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;
               border-radius:10px;padding:14px 18px;width:100%;">
          {table_rows}
        </table>
        {notes_html}
        <p>Please reach out to the school if you have any questions or need to reschedule.</p>
    """
    return _send_to_applicant(application, f"Interview invitation — {application.school.name}", body)


def send_application_accepted_student_email(*, application, user, password: str, request=None) -> bool:
    url = school_link(application.school, "/login", request)
    body = f"""
        <p>Hi {escape(application.first_name)},</p>
        <p>Congratulations — your application to <strong>{escape(application.school.name)}</strong> has been
        accepted and you've been admitted. An account has been created for you; use the details below to
        sign in.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;
               border-radius:10px;padding:14px 18px;width:100%;">
          <tr><td style="padding:3px 0;color:#64748b;">Email</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(user.email)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Temporary password</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(password)}</td></tr>
        </table>
        <p>You'll be asked to choose your own password the first time you sign in.</p>
        {email_button(url, "Sign in", application.school)}
    """
    return _send_to_applicant(application, f"Welcome to {application.school.name} — you've been admitted", body)


def send_application_accepted_staff_email(*, application, user, password: str, role_label: str, request=None) -> bool:
    url = school_link(application.school, "/login", request)
    body = f"""
        <p>Hi {escape(application.first_name)},</p>
        <p>Congratulations — your application to <strong>{escape(application.school.name)}</strong> has been
        accepted. An account has been created for you as <strong>{escape(role_label)}</strong>; use the
        details below to sign in.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;
               border-radius:10px;padding:14px 18px;width:100%;">
          <tr><td style="padding:3px 0;color:#64748b;">Email</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(user.email)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Temporary password</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(password)}</td></tr>
        </table>
        <p>You'll be asked to choose your own password the first time you sign in.</p>
        {email_button(url, "Sign in", application.school)}
    """
    return _send_to_applicant(application, f"Welcome to {application.school.name} — you're hired", body)


def send_application_rejected_email(*, application, request=None) -> bool:
    reason_html = f"<p>{escape(application.rejection_reason)}</p>" if application.rejection_reason else ""
    body = f"""
        <p>Hi {escape(application.first_name)},</p>
        <p>Thank you for your interest in <strong>{escape(application.school.name)}</strong> and for taking
        the time to apply. After careful consideration, we won't be moving forward with your application
        at this time.</p>
        {reason_html}
        <p>We wish you the very best in your search.</p>
    """
    return _send_to_applicant(application, f"Update on your application to {application.school.name}", body)
