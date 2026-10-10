from datetime import timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.academics.models import StudentSubjectEnrollment, SubjectOffering
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet, TenantScopedViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Quiz, QuizAttempt, QuizViolation
from .parsing import QuizFileError
from .serializers import (
    AttemptResultSerializer,
    AttemptStateSerializer,
    QuizCreateSerializer,
    QuizResultsSerializer,
    QuizSerializer,
    StudentQuizListSerializer,
)


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, http_status=status.HTTP_400_BAD_REQUEST, code="VALIDATION_ERROR"):
    return Response({"success": False, "message": message, "code": code, "errors": []}, status=http_status)


class QuizViewSet(TenantScopedModelViewSet):
    """Teacher-facing: create/list/retrieve/destroy/cancel/results. Deliberately no admin
    bypass anywhere here — not in get_queryset, not in the ownership checks below — the spec is
    explicit that a quiz's results/analytics are for "the teacher" only, the same privacy stance
    already applied to CA and subject private messages elsewhere in this app. A principal or
    school administrator who also happens to teach this exact subject offering sees it through
    that teacher relationship, same as anyone else who teaches it — never through an admin-only
    permission."""

    serializer_class = QuizSerializer
    filterset_fields = ["subject_offering"]
    ordering_fields = ["start_time"]

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _teaches(self, subject_offering):
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return False
        return (
            subject_offering.main_teacher_id == staff_profile.id
            or subject_offering.assistant_teacher_id == staff_profile.id
        )

    def get_queryset(self):
        qs = Quiz.objects.select_related("subject_offering__subject").prefetch_related(
            "questions__options"
        )
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def create(self, request, *args, **kwargs):
        serializer = QuizCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()

        offering = get_object_or_404(SubjectOffering, pk=data["subject_offering"], school=school)
        if not self._teaches(offering):
            return _error("You can only create quizzes for a subject you teach.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")

        try:
            quiz = services.create_quiz_from_file(
                subject_offering=offering,
                title=data["title"],
                instructions=data["instructions"],
                start_time=data["start_time"],
                end_time=data["end_time"],
                duration_minutes=data["duration_minutes"],
                file=data["file"],
                created_by=request.user,
            )
        except QuizFileError as exc:
            return _error(str(exc))

        response = _ok(
            f'"{quiz.title}" created with {quiz.questions.count()} question(s).',
            quiz=QuizSerializer(quiz).data,
        )
        response.status_code = status.HTTP_201_CREATED
        return response

    def perform_destroy(self, instance):
        if not self._teaches(instance.subject_offering):
            raise PermissionError("Only the subject's own teacher can delete this quiz.")
        if instance.attempts.exists():
            raise services.QuizAttemptError(
                "Students have already started this quiz — cancel it instead of deleting it."
            )
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except PermissionError as exc:
            return _error(str(exc), status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        except services.QuizAttemptError as exc:
            return _error(str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        quiz = self.get_object()
        if not self._teaches(quiz.subject_offering):
            return _error("Only the subject's own teacher can cancel this quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        try:
            services.cancel_quiz(quiz, actor=request.user)
        except services.QuizAttemptError as exc:
            return _error(str(exc))
        return _ok("Quiz cancelled.", quiz=QuizSerializer(quiz).data)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        quiz = self.get_object()
        if not self._teaches(quiz.subject_offering):
            return _error("Only the subject's own teacher can view these results.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        data = services.build_quiz_results(quiz)
        return _ok(results=QuizResultsSerializer(data).data)


class StudentQuizViewSet(TenantScopedViewSet):
    """Self-service, no permission gate — keyed off request.user.student_profile, the same
    pattern as every other "My X" view in this codebase (see e.g.
    apps.attendance.views.MyStudentAttendanceView)."""

    permission_classes = [IsAuthenticated]

    def _student(self):
        return getattr(self.request.user, "student_profile", None)

    def get_queryset(self):
        student = self._student()
        if student is None:
            return Quiz.objects.none()
        enrolled_offering_ids = set(
            StudentSubjectEnrollment.objects.filter(student=student).values_list("subject_offering_id", flat=True)
        )
        return (
            Quiz.objects.select_related("subject_offering__subject")
            .filter(
                Q(subject_offering_id__in=enrolled_offering_ids)
                | Q(subject_offering__school_class=student.current_class, subject_offering__enrollments__isnull=True)
            )
            .distinct()
        )

    def list(self, request):
        student = self._student()
        if student is None:
            return _ok(results=[])
        quizzes = list(self.get_queryset())
        attempts = {a.quiz_id: a for a in QuizAttempt.objects.filter(student=student, quiz__in=quizzes)}
        rows = []
        for quiz in quizzes:
            attempt = attempts.get(quiz.id)
            if attempt is not None:
                attempt = services.finalize_if_expired(attempt)
            rows.append(
                {
                    "id": quiz.id,
                    "subject_offering_name": quiz.subject_offering.subject.name,
                    "title": quiz.title,
                    "instructions": quiz.instructions,
                    "start_time": quiz.start_time,
                    "end_time": quiz.end_time,
                    "duration_minutes": quiz.duration_minutes,
                    "status": quiz.status,
                    "question_count": quiz.questions.count(),
                    "my_attempt_status": attempt.status if attempt else None,
                    "my_score": attempt.score if attempt else None,
                    "my_max_score": attempt.max_score if attempt else None,
                }
            )
        return _ok(results=StudentQuizListSerializer(rows, many=True).data)

    def _get_quiz_and_student(self, pk):
        student = self._student()
        if student is None:
            return None, None
        quiz = get_object_or_404(self.get_queryset(), pk=pk)
        return quiz, student

    def _attempt_state(self, attempt):
        questions_by_id = {str(q.id): q for q in attempt.quiz.questions.prefetch_related("options")}
        answers_by_question = {str(a.question_id): a for a in attempt.answers.all()}
        questions = []
        for question_id in attempt.question_order:
            question = questions_by_id.get(question_id)
            if question is None:
                continue
            options_by_id = {str(o.id): o for o in question.options.all()}
            answer = answers_by_question.get(question_id)
            questions.append(
                {
                    "id": question.id,
                    "text": question.text,
                    "points": question.points,
                    "options": [
                        options_by_id[option_id]
                        for option_id in attempt.option_order.get(question_id, [])
                        if option_id in options_by_id
                    ],
                    "my_option_id": answer.selected_option_id if answer else None,
                }
            )
        deadline = attempt.started_at + timedelta(minutes=attempt.quiz.duration_minutes)
        return {
            "attempt_id": attempt.id,
            "status": attempt.status,
            "started_at": attempt.started_at,
            "deadline": deadline,
            "questions": questions,
        }

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        quiz, student = self._get_quiz_and_student(pk)
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        try:
            attempt = services.start_attempt(quiz, student)
        except services.QuizAttemptError as exc:
            return _error(str(exc))
        return _ok(attempt=AttemptStateSerializer(self._attempt_state(attempt)).data)

    def _get_in_progress_attempt(self, pk, student):
        quiz = get_object_or_404(self.get_queryset(), pk=pk)
        attempt = get_object_or_404(QuizAttempt, quiz=quiz, student=student)
        return services.finalize_if_expired(attempt)

    @action(detail=True, methods=["post"])
    def view(self, request, pk=None):
        student = self._student()
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        attempt = self._get_in_progress_attempt(pk, student)
        if attempt.status != QuizAttempt.Status.IN_PROGRESS:
            return _error("This attempt has already ended.")
        question_id = request.data.get("question_id")
        if not question_id:
            return _error("question_id is required.")
        services.record_question_shown(attempt, question_id)
        return _ok()

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        student = self._student()
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        attempt = self._get_in_progress_attempt(pk, student)
        if attempt.status != QuizAttempt.Status.IN_PROGRESS:
            return _error("This attempt has already ended.")
        question_id = request.data.get("question_id")
        option_id = request.data.get("option_id")
        if not question_id:
            return _error("question_id is required.")
        try:
            services.record_answer(attempt, question_id=question_id, option_id=option_id)
        except services.QuizAttemptError as exc:
            return _error(str(exc))
        return _ok()

    @action(detail=True, methods=["post"])
    def violation(self, request, pk=None):
        student = self._student()
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        attempt = self._get_in_progress_attempt(pk, student)
        kind = request.data.get("kind")
        if kind not in QuizViolation.Kind.values:
            return _error("Unknown violation kind.")
        attempt = services.record_violation(attempt, kind=kind)
        return _ok(status=attempt.status, violation_count=attempt.violation_count)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        student = self._student()
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        attempt = self._get_in_progress_attempt(pk, student)
        try:
            attempt = services.submit_attempt(attempt)
        except services.QuizAttemptError as exc:
            return _error(str(exc))
        return _ok(result=self._result_payload(attempt))

    @action(detail=True, methods=["get"])
    def result(self, request, pk=None):
        student = self._student()
        if student is None:
            return _error("Only a student can take a quiz.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        quiz = get_object_or_404(self.get_queryset(), pk=pk)
        attempt = get_object_or_404(QuizAttempt, quiz=quiz, student=student)
        attempt = services.finalize_if_expired(attempt)
        if attempt.status == QuizAttempt.Status.IN_PROGRESS:
            return _error("This attempt hasn't been submitted yet.")
        return _ok(result=self._result_payload(attempt))

    def _result_payload(self, attempt):
        percentage = None
        if attempt.score is not None and attempt.max_score:
            percentage = round(float(attempt.score) / float(attempt.max_score) * 100, 1)
        return AttemptResultSerializer(
            {
                "status": attempt.status,
                "score": attempt.score,
                "max_score": attempt.max_score,
                "percentage": percentage,
                "submitted_at": attempt.submitted_at,
            }
        ).data
