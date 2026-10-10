from apps.notifications.services import notify

from .models import StudentGuardian


def notify_student_guardians(student, *, category, title, message, link="", email_subject=None, email_html=None):
    """Notifies every guardian linked to `student` who has a portal account — the shared
    recipient-resolution for "reach this student's family", used by every domain that needs it
    (medical, discipline, hostel, finance) instead of each duplicating the same
    StudentGuardian join. `unscoped_objects` since this can run from both request-scoped views
    and directly (services/tests), same reasoning as apps.assignments.services._class_student_users.
    Returns the number of guardians notified.
    """
    guardians = [
        rel.guardian.user
        for rel in StudentGuardian.unscoped_objects.filter(student=student).select_related("guardian__user")
        if rel.guardian.user_id
    ]
    for user in guardians:
        notify(
            recipient=user,
            category=category,
            title=title,
            message=message,
            link=link,
            email_subject=email_subject,
            email_html=email_html,
        )
    return len(guardians)
