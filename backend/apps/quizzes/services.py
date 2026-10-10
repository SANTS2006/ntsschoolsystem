import random
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Quiz, QuizAnswer, QuizAttempt, QuizOption, QuizQuestion, QuizViolation
from .parsing import parse_quiz_file

# After this many detected violations (fullscreen exit / tab switch / window blur) in one
# attempt, it's auto-submitted with whatever answers were already saved — the honest, buildable
# version of "restrict them until the quiz ends": no web page can truly block a tab switch or an
# OS-level app switch, only notice it happened and end the attempt in response.
VIOLATION_AUTO_SUBMIT_THRESHOLD = 3


class QuizAttemptError(ValueError):
    """Raised for an attempt action that isn't currently valid (quiz not open yet, already
    submitted, ...) — the message is shown to the student/teacher as-is."""


@transaction.atomic
def create_quiz_from_file(
    *, subject_offering, title, instructions, start_time, end_time, duration_minutes, file, created_by
):
    questions_data = parse_quiz_file(file)
    file.seek(0)  # parse_quiz_file consumed the stream; rewind so it can still be saved as-is

    quiz = Quiz.objects.create(
        school=subject_offering.school,
        subject_offering=subject_offering,
        title=title,
        instructions=instructions,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=duration_minutes,
        source_file=file,
        created_by=created_by,
    )
    for q_index, question_data in enumerate(questions_data):
        question = QuizQuestion.objects.create(
            school=quiz.school, quiz=quiz, order=q_index, text=question_data["text"],
            points=question_data.get("points", 1),
        )
        for o_index, option_data in enumerate(question_data["options"]):
            QuizOption.objects.create(
                school=quiz.school, question=question, order=o_index,
                text=option_data["text"], is_correct=option_data["is_correct"],
            )
    return quiz


def cancel_quiz(quiz, *, actor):
    if quiz.cancelled_at is not None:
        raise QuizAttemptError("This quiz is already cancelled.")
    quiz.cancelled_at = timezone.now()
    quiz.cancelled_by = actor
    quiz.save(update_fields=["cancelled_at", "cancelled_by"])

    for attempt in quiz.attempts.filter(status=QuizAttempt.Status.IN_PROGRESS):
        _finalize_attempt(attempt, status=QuizAttempt.Status.AUTO_SUBMITTED)
    return quiz


def roster_for_quiz(quiz):
    """Every student "registered for" the quiz's subject — enrolled students if any are
    explicitly enrolled, else the offering's whole class, the same fallback
    apps.academics.views.SubjectOfferingViewSet.ca_summary already uses."""
    from apps.students.models import Student

    offering = quiz.subject_offering
    enrolled_ids = list(offering.enrollments.values_list("student_id", flat=True))
    if enrolled_ids:
        return Student.objects.filter(pk__in=enrolled_ids).order_by("last_name", "first_name")
    return Student.objects.filter(
        current_class=offering.school_class, status=Student.Status.ACTIVE
    ).order_by("last_name", "first_name")


def _deadline(attempt) -> "timezone.datetime | None":
    if attempt.started_at is None:
        return None
    return attempt.started_at + timedelta(minutes=attempt.quiz.duration_minutes)


def finalize_if_expired(attempt) -> "QuizAttempt":
    """The server-side safety net for a student who closes their laptop mid-quiz: called at the
    top of every attempt-touching endpoint (see views.py), so an abandoned IN_PROGRESS attempt
    gets scored and closed out the next time anyone (the student resuming, or the teacher
    checking results) looks at it — never left "in progress" forever just because nobody's
    browser JS was still running to submit it on time."""
    if attempt.status != QuizAttempt.Status.IN_PROGRESS:
        return attempt
    deadline = _deadline(attempt)
    if deadline is not None and timezone.now() > deadline:
        return _finalize_attempt(attempt, status=QuizAttempt.Status.AUTO_SUBMITTED)
    if attempt.quiz.cancelled_at is not None:
        return _finalize_attempt(attempt, status=QuizAttempt.Status.AUTO_SUBMITTED)
    return attempt


@transaction.atomic
def start_attempt(quiz, student) -> "QuizAttempt":
    if quiz.status == Quiz.Status.CANCELLED:
        raise QuizAttemptError("This quiz was cancelled.")
    if quiz.status == Quiz.Status.SCHEDULED:
        raise QuizAttemptError("This quiz hasn't started yet.")

    attempt, created = QuizAttempt.objects.get_or_create(
        school=quiz.school, quiz=quiz, student=student
    )
    attempt = finalize_if_expired(attempt)
    if attempt.status != QuizAttempt.Status.IN_PROGRESS:
        raise QuizAttemptError("You've already completed this quiz.")

    if attempt.started_at is None:
        if quiz.status == Quiz.Status.ENDED:
            raise QuizAttemptError("This quiz's window has closed.")
        # Deterministic per (quiz, student): a page reload before the attempt's own timer runs
        # out reuses the exact same shuffle rather than reshuffling mid-attempt.
        rng = random.Random(f"{quiz.id}:{student.id}")
        questions = list(quiz.questions.prefetch_related("options"))
        rng.shuffle(questions)

        option_order: dict[str, list[str]] = {}
        for question in questions:
            option_ids = [str(option.id) for option in question.options.all()]
            rng.shuffle(option_ids)
            option_order[str(question.id)] = option_ids
            QuizAnswer.objects.get_or_create(
                school=quiz.school, attempt=attempt, question=question
            )

        attempt.question_order = [str(question.id) for question in questions]
        attempt.option_order = option_order
        attempt.started_at = timezone.now()
        attempt.save(update_fields=["question_order", "option_order", "started_at"])

    return attempt


def record_question_shown(attempt, question_id: str):
    QuizAnswer.objects.filter(attempt=attempt, question_id=question_id, shown_at__isnull=True).update(
        shown_at=timezone.now()
    )


def record_answer(attempt, *, question_id: str, option_id: str | None):
    try:
        answer = QuizAnswer.objects.get(attempt=attempt, question_id=question_id)
    except QuizAnswer.DoesNotExist as exc:
        raise QuizAttemptError("That question isn't part of this attempt.") from exc

    selected_option = None
    if option_id:
        try:
            selected_option = QuizOption.objects.get(pk=option_id, question_id=question_id)
        except QuizOption.DoesNotExist as exc:
            raise QuizAttemptError("That option isn't part of this question.") from exc

    answer.selected_option = selected_option
    answer.answered_at = timezone.now()
    if answer.shown_at is None:
        answer.shown_at = answer.answered_at
    answer.save(update_fields=["selected_option", "answered_at", "shown_at"])
    return answer


def record_violation(attempt, *, kind: str) -> "QuizAttempt":
    if attempt.status != QuizAttempt.Status.IN_PROGRESS:
        return attempt
    QuizViolation.objects.create(school=attempt.school, attempt=attempt, kind=kind)
    attempt.violation_count = attempt.violation_count + 1
    attempt.save(update_fields=["violation_count"])
    if attempt.violation_count >= VIOLATION_AUTO_SUBMIT_THRESHOLD:
        attempt = _finalize_attempt(attempt, status=QuizAttempt.Status.AUTO_SUBMITTED)
    return attempt


def submit_attempt(attempt) -> "QuizAttempt":
    if attempt.status != QuizAttempt.Status.IN_PROGRESS:
        raise QuizAttemptError("This attempt was already submitted.")
    return _finalize_attempt(attempt, status=QuizAttempt.Status.SUBMITTED)


@transaction.atomic
def _finalize_attempt(attempt, *, status: str) -> "QuizAttempt":
    answers = list(attempt.answers.select_related("selected_option", "question"))
    score = 0
    max_score = 0
    for answer in answers:
        max_score += answer.question.points
        is_correct = bool(answer.selected_option and answer.selected_option.is_correct)
        if answer.is_correct != is_correct:
            answer.is_correct = is_correct
            answer.save(update_fields=["is_correct"])
        if is_correct:
            score += answer.question.points

    attempt.score = score
    attempt.max_score = max_score
    attempt.status = status
    attempt.submitted_at = timezone.now()
    attempt.save(update_fields=["score", "max_score", "status", "submitted_at"])
    return attempt


def build_quiz_results(quiz) -> dict:
    """Teacher-facing: one row per registered student (with their score, completion time, and
    violation count) plus a per-question breakdown (average time spent, percent correct) — the
    "detailed analysis" the spec asks for, visible only to the quiz's own teacher (see
    views.py's ownership check; there's no admin bypass here, unlike most other academics data)."""
    students = list(roster_for_quiz(quiz))
    attempts_by_student = {
        attempt.student_id: attempt
        for attempt in quiz.attempts.select_related("student").prefetch_related("answers")
    }
    for attempt in attempts_by_student.values():
        finalize_if_expired(attempt)

    rows = []
    for student in students:
        attempt = attempts_by_student.get(student.id)
        if attempt is None:
            rows.append(
                {
                    "student_id": str(student.id), "student_name": student.full_name,
                    "status": "not_started", "score": None, "max_score": None, "percentage": None,
                    "time_taken_seconds": None, "violation_count": 0,
                }
            )
            continue
        time_taken = None
        if attempt.started_at and attempt.submitted_at:
            time_taken = int((attempt.submitted_at - attempt.started_at).total_seconds())
        percentage = None
        if attempt.score is not None and attempt.max_score:
            percentage = round(float(attempt.score) / float(attempt.max_score) * 100, 1)
        rows.append(
            {
                "student_id": str(student.id), "student_name": student.full_name,
                "status": attempt.status, "score": attempt.score, "max_score": attempt.max_score,
                "percentage": percentage, "time_taken_seconds": time_taken,
                "violation_count": attempt.violation_count,
            }
        )

    completed = [a for a in attempts_by_student.values() if a.status != QuizAttempt.Status.IN_PROGRESS]
    completion_times = [
        int((a.submitted_at - a.started_at).total_seconds())
        for a in completed
        if a.started_at and a.submitted_at
    ]
    scores = [float(a.score) for a in completed if a.score is not None]

    summary = {
        "registered": len(students),
        "attempted": len(attempts_by_student),
        "completed": len(completed),
        "average_score": round(sum(scores) / len(scores), 2) if scores else None,
        "fastest_completion_seconds": min(completion_times) if completion_times else None,
        "slowest_completion_seconds": max(completion_times) if completion_times else None,
        "average_completion_seconds": (
            round(sum(completion_times) / len(completion_times)) if completion_times else None
        ),
    }

    question_breakdown = []
    questions = list(quiz.questions.prefetch_related("options"))
    for question in questions:
        answers = QuizAnswer.objects.filter(question=question, attempt__in=attempts_by_student.values())
        answered = [a for a in answers if a.shown_at and a.answered_at]
        times = [int((a.answered_at - a.shown_at).total_seconds()) for a in answered]
        graded = [a for a in answers if a.is_correct is not None]
        correct = [a for a in graded if a.is_correct]
        question_breakdown.append(
            {
                "question_id": str(question.id),
                "text": question.text,
                "average_time_seconds": round(sum(times) / len(times)) if times else None,
                "correct_count": len(correct),
                "graded_count": len(graded),
                "percent_correct": round(len(correct) / len(graded) * 100, 1) if graded else None,
            }
        )

    return {"rows": rows, "summary": summary, "questions": question_breakdown}
