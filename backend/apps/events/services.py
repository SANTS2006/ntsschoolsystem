from django.utils import timezone

from apps.notifications.services import notify_bulk

from apps.common.audience import resolve_audience

from .models import Event, EventRecipient


def resolve_recipients(event: Event):
    """Same shape as `apps.communications.services.resolve_recipients` — every branch filters by
    `event.school` explicitly and uses `unscoped_objects` throughout (this can run outside request
    context, e.g. from a management command later), not `objects`."""
    from apps.parents.models import Guardian, StudentGuardian
    from apps.students.models import Student
    from apps.users.models import User

    if event.audience_type != "legacy":
        return resolve_audience(event)

    school = event.school
    target = event.target_type
    Target = Event.TargetType

    if target == Target.SCHOOL:
        return list(User.objects.filter(school=school, is_active=True))

    if target == Target.STAFF:
        qs = User.objects.filter(school=school, is_active=True, staff_profile__isnull=False)
        if event.target_department_id:
            qs = qs.filter(staff_profile__department_id=event.target_department_id)
        return list(qs)

    if target == Target.DEPARTMENT:
        return list(
            User.objects.filter(
                school=school, is_active=True, staff_profile__department_id=event.target_department_id
            )
        )

    if target in (Target.STUDENTS, Target.CLASS, Target.SECTION):
        student_qs = Student.unscoped_objects.filter(school=school, user__isnull=False)
        if target == Target.CLASS or event.target_class_id:
            student_qs = student_qs.filter(current_class_id=event.target_class_id)
        if target == Target.SECTION or event.target_section_id:
            student_qs = student_qs.filter(current_section_id=event.target_section_id)
        user_ids = student_qs.values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    if target == Target.PARENTS:
        student_qs = Student.unscoped_objects.filter(school=school)
        if event.target_class_id:
            student_qs = student_qs.filter(current_class_id=event.target_class_id)
        if event.target_section_id:
            student_qs = student_qs.filter(current_section_id=event.target_section_id)
        guardian_ids = StudentGuardian.unscoped_objects.filter(
            school=school, student__in=student_qs
        ).values_list("guardian_id", flat=True)
        user_ids = Guardian.unscoped_objects.filter(
            school=school, id__in=guardian_ids, user__isnull=False
        ).values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    if target == Target.SPECIFIC_USERS:
        user_ids = EventRecipient.unscoped_objects.filter(
            school=school, event=event
        ).values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    return []


def _email_event(event_id) -> int:
    """E-mails everyone an event reaches. Runs in the background: it loads everything fresh because it executes outside
    the request that published the event."""
    from django.utils.html import escape

    from apps.common.email import send_email

    event = Event.unscoped_objects.select_related("school").get(pk=event_id)
    when = f"{event.start_datetime:%A %d %B %Y, %H:%M}"
    where = f"<br>Where: {escape(event.location)}" if event.location else ""
    body = f"<p><strong>{escape(event.title)}</strong></p><p>When: {when}{where}</p><p>{escape(event.description)}</p>"
    sent = 0
    for user in resolve_recipients(event):
        if user.email and send_email(to_email=user.email, to_name=user.full_name, subject=event.title, html_content=body, school=event.school):
            sent += 1
    return sent


def publish_event(event: Event) -> int:
    """Resolves the audience, notifies each person in the app and by e-mail, and writes the audience down so that an
    event restricted to its audience is visible to exactly those people. Returns the recipient count."""
    from django.db import transaction

    from apps.common.background import run_in_background

    recipients = resolve_recipients(event)

    with transaction.atomic():
        if event.audience_type != "legacy":
            EventRecipient.unscoped_objects.filter(event=event).delete()
            EventRecipient.objects.bulk_create([EventRecipient(school=event.school, event=event, user=u) for u in recipients])
        notify_bulk(
            recipients=recipients,
            category="event",
            title=event.title,
            message=f"{event.title} — {event.start_datetime:%b %d, %Y %H:%M}",
            link=f"/events/{event.id}",
            priority="normal",
        )
        event.status = Event.Status.PUBLISHED
        event.save(update_fields=["status", "updated_at"])
    if event.audience_type != "legacy":
        transaction.on_commit(lambda: run_in_background(f"Emailing event {event.id}", _email_event, event.id))
    return len(recipients)
