from django.db.models import Q

from apps.notifications.services import notify

from .models import LiveSession


def scope_for_student(queryset, user):
    """A student may only see sessions actually meant for them: a class/section broadcast to
    their own class (and, when the session also targets a section, their own section), or a
    specific-students session that explicitly names them — never the whole school's live
    sessions. A user with no student profile at all sees nothing (this is only ever called once
    the caller already knows the viewer is a student)."""
    student_profile = getattr(user, "student_profile", None)
    if student_profile is None:
        return queryset.none()

    class_section_match = Q(
        target_type=LiveSession.TargetType.CLASS_SECTION, school_class_id=student_profile.current_class_id
    ) & (Q(section__isnull=True) | Q(section_id=student_profile.current_section_id))
    specific_match = Q(
        target_type=LiveSession.TargetType.SPECIFIC_STUDENTS, recipients__student=student_profile
    )
    return queryset.filter(class_section_match | specific_match).distinct()


def _class_student_users(session: LiveSession):
    from apps.students.models import Student

    qs = Student.unscoped_objects.filter(
        school=session.school, current_class=session.school_class, user__isnull=False
    )
    if session.section_id:
        qs = qs.filter(current_section=session.section)
    return [s.user for s in qs.select_related("user")]


def _resolve_recipient_users(session: LiveSession):
    """Class/section broadcast for `target_type=class_section` (every session created before
    this field existed behaves identically to before); the explicit `LiveSessionRecipient` list
    for `target_type=specific_students`. Only students with a portal account (`user__isnull=False`)
    can be notified either way."""
    if session.target_type == LiveSession.TargetType.SPECIFIC_STUDENTS:
        return [
            r.student.user
            for r in session.recipients.select_related("student__user").filter(student__user__isnull=False)
        ]
    return _class_student_users(session)


def _notify_invitee(session: LiveSession, user, *, title: str, message: str):
    """Singular `notify()`, not `notify_bulk()` — bulk has zero email parameters, and an
    invitation to a specific-students session (like the "live now" alert below) is worth an
    email, not just an in-app row."""
    notify(
        recipient=user,
        category="live_session",
        title=title,
        message=message,
        link=f"/live-sessions/{session.id}",
        priority="high",
        email_subject=title,
        email_html=f"<p>{message}</p>",
    )


def notify_new_recipient(recipient):
    """Called once per `LiveSessionRecipient` at creation time (see
    `LiveSessionRecipientViewSet.perform_create`) — invites that one student to a
    `specific_students` session, in-app + email, with the schedule and a link to join."""
    session = recipient.session
    user = recipient.student.user
    if user is None:
        return
    _notify_invitee(
        session, user,
        title=f"You're invited: {session.title}",
        message=(
            f"{session.subject.name} with {session.teacher.user.full_name}, scheduled for "
            f"{session.scheduled_start:%Y-%m-%d %H:%M}."
        ),
    )


def notify_session_started(session: LiveSession):
    """Alerts every recipient (with a portal account) that the live session has started, with a
    link straight to the join page — time-sensitive, so unlike routine lesson-material
    notifications this one is worth surfacing prominently the moment it happens. Resolves
    recipients via `_resolve_recipient_users` — the whole class/section by default, or just the
    explicit invitee list for a `specific_students` session."""
    users = _resolve_recipient_users(session)
    for user in users:
        _notify_invitee(
            session, user,
            title=f"Live now: {session.title}",
            message=f"{session.subject.name} with {session.teacher.user.full_name} is live now.",
        )
    return len(users)


def send_reminder(session: LiveSession):
    """Manual, on-demand re-run of the same recipient-resolution + notify used at start —
    there's no scheduled-task infrastructure in this codebase yet (no Celery, no cron beyond
    manually-run management commands), so an automatic "15 minutes before" reminder is out of
    scope for this pass; see `LiveSessionViewSet.remind`, triggered by a "Send reminder now"
    button instead."""
    users = _resolve_recipient_users(session)
    for user in users:
        _notify_invitee(
            session, user,
            title=f"Reminder: {session.title}",
            message=(
                f"{session.subject.name} with {session.teacher.user.full_name} is scheduled for "
                f"{session.scheduled_start:%Y-%m-%d %H:%M}."
            ),
        )
    return len(users)


def works_as_teacher(user) -> bool:
    """A teacher (in the role they are working as) — as opposed to the principal, an administrator, etc."""
    from apps.authorization.services import user_has_active_role

    return getattr(user, "staff_profile", None) is not None and user_has_active_role(user, "teacher")


def teaching_pairs(user) -> set[tuple]:
    """The (subject, class) combinations this person is assigned to teach."""
    from apps.academics.models import SubjectOffering
    from django.db.models import Q

    staff = user.staff_profile
    rows = SubjectOffering.unscoped_objects.filter(school_id=user.school_id).filter(
        Q(main_teacher=staff) | Q(assistant_teacher=staff)
    ).values_list("subject_id", "school_class_id")
    return set(rows)
