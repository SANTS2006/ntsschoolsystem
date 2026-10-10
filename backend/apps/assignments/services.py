from django.utils import timezone

from apps.notifications.services import notify, notify_bulk

from .models import Assignment, AssignmentSubmission


def _class_student_users(assignment: Assignment):
    from apps.students.models import Student

    qs = Student.unscoped_objects.filter(
        school=assignment.school, current_class=assignment.school_class, user__isnull=False
    )
    if assignment.section_id:
        qs = qs.filter(current_section=assignment.section)
    return [s.user for s in qs.select_related("user")]


def notify_new_assignment(assignment: Assignment):
    """Alerts every enrolled student (with a portal account) that a new assignment was posted."""
    users = _class_student_users(assignment)
    if not users:
        return 0
    notify_bulk(
        recipients=users,
        category="assignment",
        title=f"New assignment: {assignment.title}",
        message=f"{assignment.subject.name} — due {assignment.due_date:%Y-%m-%d %H:%M}",
        link=f"/assignments/{assignment.id}",
    )
    return len(users)


def submit_assignment(assignment: Assignment, *, student, attachment):
    is_late = timezone.now() > assignment.due_date
    submission, created = AssignmentSubmission.objects.update_or_create(
        assignment=assignment,
        student=student,
        defaults={
            "school": assignment.school,
            "attachment": attachment,
            "status": AssignmentSubmission.Status.LATE if is_late else AssignmentSubmission.Status.SUBMITTED,
        },
    )
    if not created:
        submission.submitted_at = timezone.now()
        submission.save(update_fields=["submitted_at"])
    return submission


def grade_submission(submission: AssignmentSubmission, *, score, feedback, graded_by):
    submission.score = score
    submission.feedback = feedback
    submission.graded_by = graded_by
    submission.graded_at = timezone.now()
    submission.status = AssignmentSubmission.Status.GRADED
    submission.save()

    if submission.student.user_id:
        notify(
            recipient=submission.student.user,
            category="assignment_graded",
            title=f"Assignment graded: {submission.assignment.title}",
            message=f"Score: {score}/{submission.assignment.max_score}",
            link=f"/assignments/{submission.assignment_id}/submissions/{submission.id}",
        )
    return submission
