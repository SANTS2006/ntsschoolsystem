import logging
from datetime import timedelta
from html import escape
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.audit.services import log_action
from apps.common.background import run_in_background
from apps.common.email import email_button, send_email
from apps.live_sessions.daily_client import create_room
from apps.notifications.services import notify_bulk
from apps.parents.models import Guardian, StudentGuardian
from apps.staff.models import Staff
from apps.students.models import Student

from .models import Meeting, MeetingInvitee

logger = logging.getLogger("apps")

# How long the Daily room outlives the scheduled end, so a meeting that overruns isn't cut off.
ROOM_EXPIRY_BUFFER_MINUTES = 60


class MeetingError(Exception):
    pass


def audience_label(meeting: Meeting) -> str:
    if meeting.include_all_staff and meeting.include_all_parents and meeting.include_all_students:
        return "Everybody — staff, parents and students"
    picked_kinds = set(meeting.invitees.values_list("kind", flat=True))
    parts = []
    for kind, plural, everyone in (
        ("staff", "staff", meeting.include_all_staff),
        ("parent", "parents", meeting.include_all_parents),
        ("student", "students", meeting.include_all_students),
    ):
        if everyone:
            parts.append(f"all {plural}")
        elif kind in picked_kinds:
            parts.append(f"selected {plural}")
    return (", ".join(parts) or "Invited guests").capitalize()


def resolve_invitees(*, school, include_all_staff=False, include_all_parents=False, include_all_students=False,
                     staff_ids=(), guardian_ids=(), student_ids=()) -> list[dict]:
    """The de-duplicated list of people a meeting's audience settings add up to. Active staff/
    students only for the "all" groups; parents are "all guardians of an active student". Explicit
    ids are honoured as given (but must belong to this school). A person appearing twice — by
    email — is kept once, under the first kind that claimed them (staff, then parent, then
    student), so a parent who also works at the school gets a single invitation."""
    people: list[dict] = []

    staff_qs = Staff.unscoped_objects.filter(school=school).select_related("user")
    if include_all_staff:
        staff_qs = staff_qs.filter(employment_status=Staff.EmploymentStatus.ACTIVE)
    else:
        staff_qs = staff_qs.filter(pk__in=list(staff_ids))
    if include_all_staff or staff_ids:
        for s in staff_qs:
            people.append({"kind": "staff", "staff": s, "user": s.user, "name": s.user.full_name, "email": s.user.email})

    guardian_qs = Guardian.unscoped_objects.filter(school=school).select_related("user")
    if include_all_parents:
        active_guardian_ids = StudentGuardian.unscoped_objects.filter(
            school=school, student__status=Student.Status.ACTIVE
        ).values_list("guardian_id", flat=True)
        guardian_qs = guardian_qs.filter(pk__in=active_guardian_ids)
    else:
        guardian_qs = guardian_qs.filter(pk__in=list(guardian_ids))
    if include_all_parents or guardian_ids:
        for g in guardian_qs:
            email = g.email or (g.user.email if g.user else "")
            people.append({"kind": "parent", "guardian": g, "user": g.user, "name": g.full_name, "email": email})

    student_qs = Student.unscoped_objects.filter(school=school).select_related("user")
    if include_all_students:
        student_qs = student_qs.filter(status=Student.Status.ACTIVE)
    else:
        student_qs = student_qs.filter(pk__in=list(student_ids))
    if include_all_students or student_ids:
        for st in student_qs:
            people.append({
                "kind": "student", "student": st, "user": st.user, "name": st.full_name,
                "email": st.user.email if st.user else "",
            })

    seen: set[str] = set()
    unique = []
    for person in people:
        key = person["email"].lower() if person["email"] else f"{person['kind']}:{(person.get('staff') or person.get('guardian') or person.get('student')).pk}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(person)
    return unique


def _room_expiry_minutes(scheduled_start, duration_minutes) -> int:
    end = scheduled_start + timedelta(minutes=duration_minutes + ROOM_EXPIRY_BUFFER_MINUTES)
    return max(int((end - timezone.now()).total_seconds() // 60), ROOM_EXPIRY_BUFFER_MINUTES)


@transaction.atomic
def create_meeting(*, school, host, title, agenda, scheduled_start, duration_minutes, include_all_staff=False,
                   include_all_parents=False, include_all_students=False, staff_ids=(), guardian_ids=(),
                   student_ids=()) -> Meeting:
    invitees = resolve_invitees(
        school=school, include_all_staff=include_all_staff, include_all_parents=include_all_parents,
        include_all_students=include_all_students, staff_ids=staff_ids, guardian_ids=guardian_ids,
        student_ids=student_ids,
    )
    if not invitees:
        raise MeetingError("Choose at least one person or group to invite.")

    meeting = Meeting.objects.create(
        school=school, host=host, title=title, agenda=agenda, scheduled_start=scheduled_start,
        duration_minutes=duration_minutes, include_all_staff=include_all_staff,
        include_all_parents=include_all_parents, include_all_students=include_all_students,
    )
    room = create_room(
        name=f"meeting-{meeting.id}", expiry_minutes=_room_expiry_minutes(scheduled_start, duration_minutes)
    )
    if room is None:
        # Raising rolls back the meeting row — nobody gets an invitation to a call that can't exist.
        raise MeetingError("Live video isn't configured for this school yet, so a meeting can't be created.")
    meeting.daily_room_url, meeting.daily_room_name = room
    meeting.save(update_fields=["daily_room_url", "daily_room_name", "updated_at"])

    MeetingInvitee.objects.bulk_create([
        MeetingInvitee(
            school=school, meeting=meeting, kind=p["kind"], staff=p.get("staff"), guardian=p.get("guardian"),
            student=p.get("student"), user=p["user"], name=p["name"], email=p["email"],
            email_status=MeetingInvitee.EmailStatus.PENDING if p["email"] else MeetingInvitee.EmailStatus.NO_EMAIL,
        )
        for p in invitees
    ])
    log_action(
        action="meetings.meeting_created", actor=host, school=school, entity_type="Meeting",
        entity_id=str(meeting.id), after={"title": title, "invitees": len(invitees)},
    )
    return meeting


def _format_when(meeting: Meeting) -> str:
    try:
        tz = ZoneInfo(meeting.school.timezone or "UTC")
    except Exception:  # noqa: BLE001 - a bad tz string must not stop invitations going out
        tz = ZoneInfo("UTC")
    local = meeting.scheduled_start.astimezone(tz)
    return f"{local:%A, %d %B %Y at %H:%M} ({tz.key})"


def _details_table(meeting: Meeting, host_name: str) -> str:
    rows = [
        ("When", escape(_format_when(meeting))),
        ("Duration", f"{meeting.duration_minutes} minutes"),
        ("Called by", escape(host_name)),
        ("Invited", escape(audience_label(meeting))),
    ]
    cells = "".join(
        f'<tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">{label}</td>'
        f'<td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{value}</td></tr>'
        for label, value in rows
    )
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;'
        f'border-radius:10px;padding:14px 18px;width:100%;">{cells}</table>'
    )


def _invitation_html(meeting: Meeting, invitee: MeetingInvitee, host_name: str) -> str:
    agenda = f"<p><strong>Agenda</strong><br>{escape(meeting.agenda).replace(chr(10), '<br>')}</p>" if meeting.agenda else ""
    return f"""
        <p>Hello {escape(invitee.name)},</p>
        <p>You are invited to a live online meeting at <strong>{escape(meeting.school.name)}</strong>:
        <strong>{escape(meeting.title)}</strong>.</p>
        {_details_table(meeting, host_name)}
        {agenda}
        <p>When it's time, use the button below to join from any device with a browser — no sign-in is needed.</p>
        <p style="text-align:center;">{email_button(meeting.daily_room_url, "Join the meeting", meeting.school)}</p>
        <p style="font-size:12px;color:#64748b;">Or copy this link: {escape(meeting.daily_room_url)}</p>
    """


def send_invitations(meeting_id, *, only_unsent: bool = True) -> dict:
    """Emails every invitee (and drops an in-app notification for those with an account). Safe to
    re-run: by default it skips anyone already marked sent, so "Resend" after a provider hiccup only
    retries the failures. Uses unscoped managers on purpose — it runs outside a request (in a
    background thread) where there is no tenant context."""
    meeting = Meeting.unscoped_objects.select_related("school", "host").get(pk=meeting_id)
    if meeting.status == Meeting.Status.CANCELLED:
        return {"sent": 0, "failed": 0, "no_email": 0}
    host_name = meeting.host.full_name if meeting.host else meeting.school.name

    invitees = list(MeetingInvitee.unscoped_objects.filter(meeting=meeting).select_related("user"))
    pending = [i for i in invitees if not only_unsent or i.email_status != MeetingInvitee.EmailStatus.SENT]

    # In-app notice only the first time round — a "Resend" that retries failed emails shouldn't re-notify.
    users = [
        i.user for i in pending
        if i.user and i.email_status in (MeetingInvitee.EmailStatus.PENDING, MeetingInvitee.EmailStatus.NO_EMAIL)
    ]
    if users:
        notify_bulk(
            recipients=users, category="meeting", title=f"Meeting invitation: {meeting.title}",
            message=f"{_format_when(meeting)} — {meeting.duration_minutes} minutes.",
            link=f"/meetings/{meeting.id}/room", priority="high",
        )

    counts = {"sent": 0, "failed": 0, "no_email": 0}
    for invitee in pending:
        if not invitee.email:
            invitee.email_status = MeetingInvitee.EmailStatus.NO_EMAIL
            counts["no_email"] += 1
        else:
            ok = send_email(
                to_email=invitee.email, to_name=invitee.name, subject=f"Meeting invitation: {meeting.title}",
                html_content=_invitation_html(meeting, invitee, host_name), school=meeting.school,
            )
            invitee.email_status = MeetingInvitee.EmailStatus.SENT if ok else MeetingInvitee.EmailStatus.FAILED
            invitee.emailed_at = timezone.now() if ok else invitee.emailed_at
            counts["sent" if ok else "failed"] += 1
        invitee.save(update_fields=["email_status", "emailed_at"])
    logger.info("Meeting %s invitations: %s", meeting_id, counts)
    return counts


def dispatch_invitations(meeting: Meeting) -> None:
    run_in_background(f"Sending invitations for meeting {meeting.id}", send_invitations, meeting.id)


def dispatch_cancellation_notices(meeting: Meeting) -> None:
    run_in_background(f"Cancellation notices for meeting {meeting.id}", send_cancellation_notices, meeting.id)


def start_meeting(meeting: Meeting) -> Meeting:
    if meeting.status != Meeting.Status.SCHEDULED:
        raise MeetingError(f"Cannot start a meeting with status '{meeting.status}'.")
    meeting.status = Meeting.Status.LIVE
    meeting.started_at = timezone.now()
    meeting.save(update_fields=["status", "started_at", "updated_at"])
    return meeting


def end_meeting(meeting: Meeting) -> Meeting:
    if meeting.status != Meeting.Status.LIVE:
        raise MeetingError(f"Cannot end a meeting with status '{meeting.status}'.")
    meeting.status = Meeting.Status.ENDED
    meeting.ended_at = timezone.now()
    meeting.save(update_fields=["status", "ended_at", "updated_at"])
    return meeting


def cancel_meeting(meeting: Meeting, *, actor=None) -> Meeting:
    if meeting.status not in (Meeting.Status.SCHEDULED, Meeting.Status.LIVE):
        raise MeetingError(f"Cannot cancel a meeting with status '{meeting.status}'.")
    meeting.status = Meeting.Status.CANCELLED
    meeting.cancelled_at = timezone.now()
    meeting.save(update_fields=["status", "cancelled_at", "updated_at"])
    log_action(
        action="meetings.meeting_cancelled", actor=actor, school=meeting.school, entity_type="Meeting",
        entity_id=str(meeting.id),
    )
    return meeting


def send_cancellation_notices(meeting_id) -> int:
    """Tells everyone who was already emailed an invitation that the meeting is off."""
    meeting = Meeting.unscoped_objects.select_related("school").get(pk=meeting_id)
    sent = 0
    for invitee in MeetingInvitee.unscoped_objects.filter(
        meeting=meeting, email_status=MeetingInvitee.EmailStatus.SENT
    ):
        body = (
            f"<p>Hello {escape(invitee.name)},</p><p>The meeting <strong>{escape(meeting.title)}</strong> "
            f"scheduled for {escape(_format_when(meeting))} has been <strong>cancelled</strong>. "
            "Please disregard the earlier invitation.</p>"
        )
        if send_email(
            to_email=invitee.email, to_name=invitee.name, subject=f"Meeting cancelled: {meeting.title}",
            html_content=body, school=meeting.school,
        ):
            sent += 1
    return sent
