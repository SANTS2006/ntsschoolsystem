from django.utils import timezone

from apps.notifications.services import notify_bulk

from apps.common.audience import resolve_audience

from .models import Announcement, AnnouncementRecipient


def resolve_recipients(announcement: Announcement):
    """
    Every branch filters by `announcement.school` explicitly — targeting
    must remain tenant-scoped no matter how it's sliced (spec's explicit
    requirement). Uses `unscoped_objects` throughout (with that explicit
    school filter as the real scoping), not `objects`, since this can be
    called from a request-scoped view *or* directly (tests, future
    management commands) — see the Phase 9/10 "outside request context"
    rule: `objects` on a TenantScopedModel silently returns nothing without
    ambient tenant context, so relying on it here would work in the view
    and quietly break everywhere else.
    """
    from apps.parents.models import Guardian, StudentGuardian
    from apps.students.models import Student
    from apps.users.models import User

    if announcement.audience_type != "legacy":
        return resolve_audience(announcement)

    school = announcement.school
    target = announcement.target_type
    Target = Announcement.TargetType

    if target == Target.SCHOOL:
        return list(User.objects.filter(school=school, is_active=True))

    if target == Target.STAFF:
        qs = User.objects.filter(school=school, is_active=True, staff_profile__isnull=False)
        if announcement.target_department_id:
            qs = qs.filter(staff_profile__department_id=announcement.target_department_id)
        return list(qs)

    if target == Target.DEPARTMENT:
        return list(
            User.objects.filter(
                school=school, is_active=True, staff_profile__department_id=announcement.target_department_id
            )
        )

    if target in (Target.STUDENTS, Target.CLASS, Target.SECTION):
        student_qs = Student.unscoped_objects.filter(school=school, user__isnull=False)
        if target == Target.CLASS or announcement.target_class_id:
            student_qs = student_qs.filter(current_class_id=announcement.target_class_id)
        if target == Target.SECTION or announcement.target_section_id:
            student_qs = student_qs.filter(current_section_id=announcement.target_section_id)
        user_ids = student_qs.values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    if target == Target.PARENTS:
        student_qs = Student.unscoped_objects.filter(school=school)
        if announcement.target_class_id:
            student_qs = student_qs.filter(current_class_id=announcement.target_class_id)
        if announcement.target_section_id:
            student_qs = student_qs.filter(current_section_id=announcement.target_section_id)
        guardian_ids = StudentGuardian.unscoped_objects.filter(
            school=school, student__in=student_qs
        ).values_list("guardian_id", flat=True)
        user_ids = Guardian.unscoped_objects.filter(
            school=school, id__in=guardian_ids, user__isnull=False
        ).values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    if target == Target.SPECIFIC_USERS:
        user_ids = AnnouncementRecipient.unscoped_objects.filter(
            school=school, announcement=announcement
        ).values_list("user_id", flat=True)
        return list(User.objects.filter(id__in=user_ids, is_active=True))

    return []


def _email_announcement(announcement_id) -> int:
    """Emails every resolved recipient of an already-published announcement. Runs in the
    background (see publish_announcement); loads everything fresh because it executes outside the
    request that triggered it, where there is no tenant context."""
    from django.utils.html import escape
    from django.template.defaultfilters import linebreaks_filter

    from apps.common.email import send_email

    announcement = Announcement.unscoped_objects.select_related("school").get(pk=announcement_id)
    sent = 0
    for user in resolve_recipients(announcement):
        if user.email and send_email(
            to_email=user.email,
            to_name=user.full_name,
            subject=announcement.title,
            html_content=linebreaks_filter(escape(announcement.body)),
            school=announcement.school,
        ):
            sent += 1
    return sent


def publish_announcement(announcement: Announcement) -> int:
    """Resolves the audience, creates one Notification per recipient and marks the announcement
    published — all quickly, inside one transaction — then, only if it opted in, emails each
    recipient in the background. Returns the recipient count.

    The email loop used to run inline *before* `published_at` was saved: with a school-sized
    audience (one Brevo call per person) it outlasted the web worker's request time limit, which
    killed the request after the in-app notifications had been created but before the announcement
    was marked published — "notification received, error shown, still a draft"."""
    from django.db import transaction

    from apps.common.background import run_in_background

    recipients = resolve_recipients(announcement)

    with transaction.atomic():
        if announcement.audience_type != "legacy":
            AnnouncementRecipient.unscoped_objects.filter(announcement=announcement).delete()
            AnnouncementRecipient.objects.bulk_create(
                [AnnouncementRecipient(school=announcement.school, announcement=announcement, user=u) for u in recipients]
            )
        notify_bulk(
            recipients=recipients,
            category="announcement",
            title=announcement.title,
            message=announcement.body,
            link=f"/announcements/{announcement.id}",
            priority="normal",
        )
        announcement.published_at = timezone.now()
        announcement.save(update_fields=["published_at", "published_by", "updated_at"])

    # An announcement for a chosen audience is always e-mailed too; older ones keep their own switch.
    if announcement.send_email or announcement.audience_type != "legacy":
        transaction.on_commit(
            lambda: run_in_background(f"Emailing announcement {announcement.id}", _email_announcement, announcement.id)
        )
    return len(recipients)
