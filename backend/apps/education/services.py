from apps.notifications.services import notify_bulk

from .models import Lesson, LessonMaterial


def _class_student_users(lesson: Lesson):
    from apps.students.models import Student

    qs = Student.unscoped_objects.filter(
        school=lesson.school, current_class=lesson.school_class, user__isnull=False
    )
    if lesson.section_id:
        qs = qs.filter(current_section=lesson.section)
    return [s.user for s in qs.select_related("user")]


def notify_new_material(material: LessonMaterial):
    """Alerts every enrolled student (with a portal account) that new lesson material was
    posted. No email leg by design — frequent, not urgent, matching how routine lifecycle
    events elsewhere in this app stay in-app-only unless genuinely time-sensitive."""
    users = _class_student_users(material.lesson)
    if not users:
        return 0
    notify_bulk(
        recipients=users,
        category="lesson_material",
        title=f"New material: {material.lesson.title}",
        message=f"{material.lesson.subject.name} — {material.title}",
        link=f"/education/lessons/{material.lesson_id}",
    )
    return len(users)
