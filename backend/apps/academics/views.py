from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.authorization.services import user_has_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet, TenantScopedReadOnlyViewSet
from apps.notifications.services import notify_bulk
from apps.students.models import Student
from apps.tenants.services import get_current_school

from . import services, submissions
from .models import (
    AcademicYear,
    Assessment,
    AssessmentFile,
    AssessmentScore,
    Department,
    PromotionRecord,
    SchoolClass,
    Section,
    StudentSubjectEnrollment,
    Subject,
    SubjectMaterial,
    SubjectMessage,
    SubjectOffering,
    SubjectPrivateMessage,
    SubjectResult,
    Term,
    TermResultPublication,
)
from .serializers import (
    AcademicYearSerializer,
    AssessmentSerializer,
    DepartmentSerializer,
    PromotionRecordSerializer,
    SchoolClassSerializer,
    SectionSerializer,
    StudentSubjectEnrollmentSerializer,
    SubjectMaterialSerializer,
    SubjectMessageSerializer,
    SubjectOfferingSerializer,
    SubjectPrivateMessageSerializer,
    SubjectSerializer,
    TermResultPublicationSerializer,
    TermSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "close_ca": "update",
    "reopen_ca": "update",
    "close_ca_bulk": "update",
    "archive": "update",
    "unarchive": "update",
    "activate": "update",
}


_CA_ACTIONS = {"close_ca", "reopen_ca", "close_ca_bulk"}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status, errors=None):
    return Response(
        {"success": False, "message": message, "code": code, "errors": errors or [message]}, status=http_status
    )


class AcademicsModelViewSet(TenantScopedModelViewSet):
    """
    Shared permission wiring (every academics resource uses academics.* codes)
    plus a shared get_queryset(). Deliberately a *method*, not a class-level
    `queryset = Model.objects.all()` attribute — for a TenantScopedModel that
    class attribute would be evaluated once at import time, before any
    request/tenant context exists, permanently baking in `TenantManager`'s
    no-context `.none()`. That would make list/retrieve/detail-actions
    silently return nothing forever, regardless of who's asking — a bug
    that's invisible in `create()` (which never touches get_queryset()) and
    was only caught via a live end-to-end smoke test, not by unit tests
    that only ever exercised query logic directly.
    """

    model = None
    select_related_fields = ()
    prefetch_related_fields = ()

    def get_permissions(self):
        if self.action in _CA_ACTIONS:
            # Opening and closing continuous assessment is its own permission (`ca.manage`), so a role can be given
            # it without being given the right to edit the rest of the academic structure.
            return [require_permission("ca.manage")()]
        code = f"academics.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = self.model.objects.all()
        if self.select_related_fields:
            qs = qs.select_related(*self.select_related_fields)
        if self.prefetch_related_fields:
            qs = qs.prefetch_related(*self.prefetch_related_fields)
        return qs


class AcademicYearViewSet(AcademicsModelViewSet):
    model = AcademicYear
    serializer_class = AcademicYearSerializer
    filterset_fields = ["is_current", "is_archived"]
    search_fields = ["name"]
    ordering_fields = ["start_date", "name"]
    summary_stats = {
        "total": {},
        "current": {"is_current": True},
        "archived": {"is_archived": True},
    }

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        year = self.get_object()
        try:
            services.archive_academic_year(year, actor=request.user)
        except ValueError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok(
            f'"{year.name}" archived — its records are now read-only.',
            academic_year=AcademicYearSerializer(year, context={"request": request}).data,
        )

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Makes this the school's active year and closes the previous one (see year_services.activate_academic_year)."""
        from . import year_services

        year = self.get_object()
        try:
            year_services.activate_academic_year(year, actor=request.user)
        except year_services.YearLifecycleError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        year.refresh_from_db()
        return _ok(
            f'"{year.name}" is now the active academic year.',
            academic_year=AcademicYearSerializer(year, context={"request": request}).data,
        )

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        year = self.get_object()
        try:
            services.unarchive_academic_year(year, actor=request.user)
        except ValueError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        return _ok(
            f'"{year.name}" unarchived.',
            academic_year=AcademicYearSerializer(year, context={"request": request}).data,
        )


class TermViewSet(AcademicsModelViewSet):
    model = Term
    select_related_fields = ("academic_year",)
    serializer_class = TermSerializer
    filterset_fields = ["academic_year", "is_current"]
    search_fields = ["name"]
    ordering_fields = ["start_date"]
    summary_stats = {
        "total": {},
        "current": {"is_current": True},
    }


class DepartmentViewSet(AcademicsModelViewSet):
    model = Department
    serializer_class = DepartmentSerializer
    search_fields = ["name", "code"]
    ordering_fields = ["name"]
    summary_stats = {
        "total": {},
    }


class SubjectViewSet(AcademicsModelViewSet):
    model = Subject
    prefetch_related_fields = ("departments",)
    serializer_class = SubjectSerializer
    filterset_fields = ["departments"]
    search_fields = ["name", "code"]
    ordering_fields = ["name"]
    summary_stats = {
        "total": {},
    }


class SubjectOfferingViewSet(AcademicsModelViewSet):
    model = SubjectOffering
    select_related_fields = (
        "subject", "academic_year", "term", "school_class", "main_teacher__user", "assistant_teacher__user",
    )
    serializer_class = SubjectOfferingSerializer
    filterset_fields = ["subject", "academic_year", "term", "school_class", "main_teacher", "status"]
    search_fields = ["subject__name", "subject__code"]
    summary_stats = {
        "total": {},
        "active": {"status": SubjectOffering.Status.ACTIVE},
    }

    def get_queryset(self):
        return services.scope_subject_offerings_for_teacher(super().get_queryset(), self.request.user)

    def _can_set_cover_image(self, offering):
        """A teacher may set their own offering's cover photo without holding the broader
        `academics.update` permission (which is reserved for the grading-config fields an
        administrator manages) — same "own it or hold the admin permission" split used by
        StudentSubjectEnrollmentViewSet above."""
        if user_has_permission(self.request.user, "academics.update"):
            return True
        staff_profile = getattr(self.request.user, "staff_profile", None)
        return staff_profile is not None and staff_profile.id in {offering.main_teacher_id, offering.assistant_teacher_id}

    @action(detail=True, methods=["post"], url_path="cover-image")
    def cover_image(self, request, pk=None):
        offering = self.get_object()
        if not self._can_set_cover_image(offering):
            return _error("You can only set the cover image for a subject you teach.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        file_obj = request.FILES.get("cover_image")
        if not file_obj:
            return _error("No file provided.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        serializer = SubjectOfferingSerializer(
            offering, data={"cover_image": file_obj}, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return _ok("Cover image updated.", subject_offering=serializer.data)

    @action(detail=True, methods=["get"], url_path="ca-summary")
    def ca_summary(self, request, pk=None):
        """Every student taking this offering with their Total CA and the per-assessment
        breakdown behind it (teacher-facing; a student's own view is MySubjectCAView). Uses the
        enrolled students, or the class's active students when nobody is explicitly enrolled.
        `total_ca` counts SUBMITTED scores only (services.compute_total_ca); draft scores still
        appear in the breakdown, flagged by `status`, so the teacher can see what's outstanding."""
        offering = self.get_object()
        assessments = list(offering.assessments.filter(status=Assessment.Status.ACTIVE).order_by("created_at"))

        enrolled_ids = list(offering.enrollments.values_list("student_id", flat=True))
        students = Student.objects.filter(pk__in=enrolled_ids) if enrolled_ids else Student.objects.filter(
            current_class=offering.school_class, status=Student.Status.ACTIVE
        )
        students = list(students.order_by("last_name", "first_name"))

        scores = {}
        for score in AssessmentScore.objects.filter(assessment__in=assessments, student__in=students):
            scores[(score.student_id, score.assessment_id)] = score

        rows = []
        for student in students:
            breakdown = []
            for assessment in assessments:
                score = scores.get((student.pk, assessment.pk))
                breakdown.append(
                    {
                        "assessment": str(assessment.pk),
                        "name": assessment.name,
                        "weight": assessment.weight,
                        "discretionary_weight": assessment.discretionary_weight,
                        "max_score": str(assessment.max_score),
                        "raw_score": str(score.raw_score) if score and score.raw_score is not None else None,
                        "discretionary_mark": (
                            str(score.discretionary_mark) if score and score.discretionary_mark is not None else None
                        ),
                        "weighted_score": (
                            str(score.weighted_score) if score and score.weighted_score is not None else None
                        ),
                        "status": score.status if score else None,
                    }
                )
            total = services.compute_total_ca(offering, student)
            rows.append(
                {
                    "student": str(student.pk),
                    "student_name": student.full_name,
                    "admission_number": student.admission_number,
                    "total_ca": str(total) if total is not None else None,
                    "breakdown": breakdown,
                }
            )
        return _ok(ca_weight_percent=offering.ca_weight_percent, students=rows)

    @action(detail=True, methods=["post"], url_path="close-ca")
    def close_ca(self, request, pk=None):
        offering = self.get_object()
        services.close_ca(offering, actor=request.user)
        return _ok(
            "CA closed for this subject offering.",
            subject_offering=SubjectOfferingSerializer(offering, context={"request": request}).data,
        )

    @action(detail=True, methods=["post"], url_path="reopen-ca")
    def reopen_ca(self, request, pk=None):
        offering = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return _error("A reason is required to reopen CA.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        services.reopen_ca(offering, actor=request.user, reason=reason)
        return _ok(
            "CA reopened for this subject offering.",
            subject_offering=SubjectOfferingSerializer(offering, context={"request": request}).data,
        )

    @action(detail=False, methods=["post"], url_path="close-ca-bulk")
    def close_ca_bulk(self, request):
        ids = request.data.get("ids") or []
        offerings = list(self.get_queryset().filter(id__in=ids))
        for offering in offerings:
            services.close_ca(offering, actor=request.user)
        return _ok(f"Closed CA for {len(offerings)} subject offering(s).", closed_count=len(offerings))

    def get_permissions(self):
        # Phase 6: viewing/entering exam scores and Final Subject Scores is Admin/Exams-Director
        # only — deliberately gated by `examinations.*` rather than this ViewSet's usual
        # `academics.*` codes, since a School Administrator (who holds academics.update) has no
        # examinations access at all by design, and a Teacher (academics.view) never enters exam
        # scores. Every other action keeps the parent's uniform academics.* wiring.
        if self.action == "results":
            code = "examinations.view" if self.request.method == "GET" else "examinations.update"
            return [require_permission(code)()]
        return super().get_permissions()

    @action(detail=True, methods=["get", "post"])
    def results(self, request, pk=None):
        """GET returns one row per student enrolled in this offering: their exam score, CA
        contribution (Phase 5), exam contribution, Final Subject Score, and pass status — the
        Admin/Exams-Director "view CA, view final results" screen. POST accepts
        {"entries": [{"student": id, "exam_score": number|null}]} and upserts each via
        services.enter_subject_exam_score, verifying every student is actually enrolled in this
        offering first (an exam score for a student who isn't even taking the subject is a data
        error, not a legitimate entry)."""
        offering = self.get_object()

        if request.method == "GET":
            enrollments = StudentSubjectEnrollment.objects.filter(subject_offering=offering).select_related(
                "student"
            )
            existing = {r.student_id: r for r in SubjectResult.objects.filter(subject_offering=offering)}
            boundaries = services.load_grade_boundaries(offering.school)
            rows = []
            for enrollment in enrollments:
                student = enrollment.student
                result = existing.get(student.id)
                breakdown = services.compute_final_subject_score(offering, student, boundaries)
                rows.append(
                    {
                        "student": str(student.id),
                        "student_name": student.full_name,
                        "student_admission_number": student.admission_number,
                        "exam_score": str(result.exam_score) if result and result.exam_score is not None else None,
                        "ca_contribution": (
                            str(breakdown["ca_contribution"]) if breakdown["ca_contribution"] is not None else None
                        ),
                        "exam_contribution": (
                            str(breakdown["exam_contribution"])
                            if breakdown["exam_contribution"] is not None
                            else None
                        ),
                        "final_score": (
                            str(breakdown["final_score"]) if breakdown["final_score"] is not None else None
                        ),
                        "pass_status": breakdown["pass_status"],
                        "letter_grade": breakdown["letter_grade"],
                        "grade_points": (
                            str(breakdown["grade_points"]) if breakdown["grade_points"] is not None else None
                        ),
                    }
                )
            return _ok(
                rows=rows,
                exam_max_score=str(offering.exam_max_score),
                pass_mark=offering.pass_mark,
                is_tertiary=offering.school.school_type == "tertiary",
                grade_point_scale=str(offering.school.grade_point_scale),
            )

        from apps.students.models import Student

        entries_data = request.data.get("entries") or []
        enrolled_ids = set(
            StudentSubjectEnrollment.objects.filter(subject_offering=offering).values_list("student_id", flat=True)
        )
        students = {str(s.id): s for s in Student.objects.filter(id__in=[e.get("student") for e in entries_data])}

        for entry in entries_data:
            student = students.get(entry.get("student"))
            if student is None or student.id not in enrolled_ids:
                return _error(
                    "One or more students are not enrolled in this subject.",
                    "VALIDATION_ERROR",
                    status.HTTP_400_BAD_REQUEST,
                )
            exam_score_raw = entry.get("exam_score")
            if exam_score_raw in (None, ""):
                exam_score = None
            else:
                try:
                    exam_score = Decimal(str(exam_score_raw))
                except InvalidOperation:
                    return _error(
                        f"Invalid exam score for {student.full_name}.",
                        "VALIDATION_ERROR",
                        status.HTTP_400_BAD_REQUEST,
                    )
            try:
                services.enter_subject_exam_score(
                    offering, student=student, exam_score=exam_score, entered_by=request.user
                )
            except ValueError as exc:
                return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        return _ok("Exam scores saved.")


class StudentSubjectEnrollmentViewSet(TenantScopedModelViewSet):
    """Phase 4 of the Subjects & Results spec: explicit per-student roster for a SubjectOffering
    — never auto-assumed. Gated at the permission layer by `academics.view` alone (both admin and
    teacher roles hold it), because create/destroy authorization here is finer than one permission
    code can express: an admin (`academics.update`) may manage any offering's roster, while a
    teacher who only holds `academics.view` may manage the roster solely for SubjectOfferings
    where they are the main or assistant teacher. That scoping is enforced twice — in
    get_queryset (so a teacher can't list/retrieve another teacher's enrollments) and again in
    perform_create (so they can't POST a subject_offering id outside their own) — closing the
    IDOR/BOLA gap a single coarse permission code would leave open. destroy() reuses the same
    scoped get_queryset() via DRF's get_object(), so an out-of-scope delete 404s rather than
    leaking whether the row exists."""

    serializer_class = StudentSubjectEnrollmentSerializer
    filterset_fields = ["subject_offering", "student"]
    search_fields = ["student__first_name", "student__last_name", "student__admission_number"]
    summary_stats = {
        "total": {},
    }

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _is_admin(self):
        return user_has_permission(self.request.user, "academics.update")

    def _teaches(self, subject_offering):
        return services.user_teaches_offering(self.request.user, subject_offering)

    def get_queryset(self):
        qs = StudentSubjectEnrollment.objects.select_related(
            "subject_offering__subject",
            "subject_offering__school_class",
            "subject_offering__term",
            "subject_offering__main_teacher__user",
            "subject_offering__assistant_teacher__user",
            "student",
        ).all()
        if self._is_admin():
            return qs
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def perform_create(self, serializer):
        subject_offering = serializer.validated_data["subject_offering"]
        if not self._is_admin() and not self._teaches(subject_offering):
            raise PermissionDenied("You can only enroll students into subjects you teach.")
        serializer.save(school=get_current_school())


class AssessmentViewSet(TenantScopedModelViewSet):
    """Phase 5 of the Subjects & Results spec: one CA component (e.g. "Assignment 1", "Mid-Term
    Test") of a SubjectOffering. Same admin-vs-own-subject teacher scoping as
    StudentSubjectEnrollmentViewSet above — see that class's docstring for the rationale."""

    serializer_class = AssessmentSerializer
    filterset_fields = ["subject_offering", "status"]
    search_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _is_admin(self):
        return user_has_permission(self.request.user, "academics.update")

    def _teaches(self, subject_offering):
        return services.user_teaches_offering(self.request.user, subject_offering)

    def get_queryset(self):
        qs = Assessment.objects.select_related(
            "subject_offering__subject", "subject_offering__school_class", "subject_offering__term",
        ).all()
        # Administrators and anyone who may open/close CA (the exams director) can see every subject's assessments
        # (read-only: only the subject's own teacher can add, change or grade them).
        if self._is_admin() or user_has_permission(self.request.user, "ca.manage"):
            return qs
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def perform_create(self, serializer):
        subject_offering = serializer.validated_data["subject_offering"]
        if not self._teaches(subject_offering):
            raise PermissionDenied("Only the subject's own teacher can create assessments.")
        assessment = serializer.save(school=get_current_school())
        if assessment.allow_file_uploads:
            submissions.schedule_announcement(assessment, "opened")

    def perform_update(self, serializer):
        before = (serializer.instance.allow_file_uploads, serializer.instance.upload_deadline)
        subject_offering = serializer.instance.subject_offering
        # Only the teacher assigned to the subject can correct an assessment's details — name, weight, max
        # score, reserved discretionary marks, active/inactive. Administrators can see the CA, not change it.
        if not self._teaches(subject_offering):
            raise PermissionDenied("Only the teacher assigned to this subject can edit its assessments.")
        changed_marks = {"weight", "max_score", "discretionary_weight"} & set(serializer.validated_data)
        with transaction.atomic():
            assessment = serializer.save()
            after = (assessment.allow_file_uploads, assessment.upload_deadline)
            if after != before and assessment.allow_file_uploads:
                # Turned on, or the deadline moved (a later one reopens uploads): tell the students.
                submissions.schedule_announcement(assessment, "opened" if not before[0] else "deadline_changed")
            if changed_marks:
                # `weighted_score` is stored on each score (see AssessmentScore), so scores already
                # recorded have to be recalculated against the corrected weight / max score.
                for score in assessment.scores.select_related("assessment", "student"):
                    score.save()

    def perform_destroy(self, instance):
        if not self._teaches(instance.subject_offering):
            raise PermissionDenied("Only the subject's own teacher can delete assessments.")
        instance.delete()

    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        """Every enrolled student's uploaded files for this assessment, for the teacher to open and mark."""
        assessment = self.get_object()
        # Hand-ins are for the subject's own teacher only; administrators, the principal and the exams director
        # work from the CA totals and are not given this view.
        if not self._teaches(assessment.subject_offering):
            raise PermissionDenied("You can only see hand-ins for subjects you teach.")
        return Response({"success": True, "message": "", "code": "OK", "errors": [], "submissions": submissions.teacher_view(assessment)})

    @action(detail=True, methods=["get", "post"])
    def scores(self, request, pk=None):
        """GET returns one grade-entry row per student enrolled in the assessment's
        SubjectOffering (via StudentSubjectEnrollment) — including students with no saved score
        yet, so the teacher's grid always shows the full roster. POST accepts
        {"entries": [{"student": id, "raw_score": number|null}], "submit": bool} and upserts via
        services.save_assessment_scores, which enforces the CA-closed lock and score bounds."""
        assessment = self.get_object()
        offering = assessment.subject_offering
        can_view = self._is_admin() or self._teaches(offering)
        if not can_view:
            raise PermissionDenied("You can only manage scores for subjects you teach.")
        if request.method == "POST" and not self._teaches(offering):
            raise PermissionDenied("Only the subject's own teacher can enter grades.")

        if request.method == "GET":
            enrollments = StudentSubjectEnrollment.objects.filter(subject_offering=offering).select_related(
                "student"
            )
            existing = {s.student_id: s for s in assessment.scores.all()}
            rows = []
            for enrollment in enrollments:
                student = enrollment.student
                score = existing.get(student.id)
                rows.append(
                    {
                        "student": str(student.id),
                        "student_name": student.full_name,
                        "student_admission_number": student.admission_number,
                        "raw_score": str(score.raw_score) if score and score.raw_score is not None else None,
                        "discretionary_mark": (
                            str(score.discretionary_mark) if score and score.discretionary_mark is not None else None
                        ),
                        "weighted_score": (
                            str(score.weighted_score) if score and score.weighted_score is not None else None
                        ),
                        "status": score.status if score else AssessmentScore.Status.DRAFT,
                    }
                )
            return _ok(
                rows=rows,
                max_score=str(assessment.max_score),
                weight=assessment.weight,
                discretionary_weight=assessment.discretionary_weight,
            )

        from apps.students.models import Student

        entries_data = request.data.get("entries") or []
        submit = bool(request.data.get("submit", False))
        enrolled_ids = set(
            StudentSubjectEnrollment.objects.filter(subject_offering=offering).values_list("student_id", flat=True)
        )
        students = {str(s.id): s for s in Student.objects.filter(id__in=[e.get("student") for e in entries_data])}

        entries = []
        for entry in entries_data:
            student = students.get(entry.get("student"))
            if student is None or student.id not in enrolled_ids:
                return _error(
                    "One or more students are not enrolled in this subject.",
                    "VALIDATION_ERROR",
                    status.HTTP_400_BAD_REQUEST,
                )
            parsed = {"student": student}
            try:
                raw_score = entry.get("raw_score")
                parsed["raw_score"] = None if raw_score in (None, "") else Decimal(str(raw_score))
                if "discretionary_mark" in entry:
                    mark = entry["discretionary_mark"]
                    parsed["discretionary_mark"] = None if mark in (None, "") else Decimal(str(mark))
            except InvalidOperation:
                return _error(
                    f"Invalid score for {student.full_name}.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST
                )
            entries.append(parsed)

        try:
            services.save_assessment_scores(assessment, entries=entries, submit=submit)
        except ValueError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        return _ok("Scores saved." if not submit else "Scores submitted.")


class MySubjectCAView(TenantScopedAPIView):
    """Student self-service: one enrolled subject's assessments plus the student's own scores
    and Total CA (Phase 5's "Student view of assessments/scores/weighted/total CA"). Requires an
    actual StudentSubjectEnrollment row for the offering — closing the IDOR path a raw offering id
    in the URL would otherwise open (a 404, not a 403, so a guess at another student's offering id
    doesn't even confirm the offering exists)."""

    def get(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can view this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)

        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).exists()
        if not enrolled:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        assessments = Assessment.objects.filter(
            subject_offering_id=subject_offering_id, status=Assessment.Status.ACTIVE
        )
        scores = {
            s.assessment_id: s
            for s in AssessmentScore.objects.filter(
                assessment__subject_offering_id=subject_offering_id,
                student=student_profile,
                status=AssessmentScore.Status.SUBMITTED,
            )
        }
        my_files: dict = {}
        for f in AssessmentFile.objects.filter(
            assessment__subject_offering_id=subject_offering_id, student=student_profile
        ):
            my_files.setdefault(f.assessment_id, []).append(f)
        rows = [
            {
                **submissions.student_view(a, my_files.get(a.id, [])),
                "assessment": str(a.id),
                "name": a.name,
                "weight": a.weight,
                "discretionary_weight": a.discretionary_weight,
                "max_score": str(a.max_score),
                "raw_score": str(scores[a.id].raw_score) if a.id in scores and scores[a.id].raw_score is not None else None,
                "discretionary_mark": (
                    str(scores[a.id].discretionary_mark)
                    if a.id in scores and scores[a.id].discretionary_mark is not None
                    else None
                ),
                "weighted_score": (
                    str(scores[a.id].weighted_score) if a.id in scores and scores[a.id].weighted_score is not None else None
                ),
            }
            for a in assessments
        ]
        offering = SubjectOffering.objects.get(id=subject_offering_id)
        total_ca = services.compute_total_ca(offering, student_profile)
        return _ok(assessments=rows, total_ca=str(total_ca) if total_ca is not None else None)


class MySubjectsView(TenantScopedAPIView):
    """Student self-service: subjects the student is explicitly enrolled in (Phase 4) — never
    inferred from class/section membership alone, since not every student in a class necessarily
    takes every subject offered to it (electives, streams, etc.)."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return Response({"success": True, "message": "", "code": "OK", "errors": [], "subjects": []})
        offerings = SubjectOffering.objects.filter(enrollments__student=student_profile).select_related(
            "subject", "academic_year", "term", "school_class", "main_teacher__user", "assistant_teacher__user",
        ).distinct()
        data = SubjectOfferingSerializer(offerings, many=True, context={"request": request}).data
        return Response({"success": True, "message": "", "code": "OK", "errors": [], "subjects": data})


class SchoolClassViewSet(AcademicsModelViewSet):
    model = SchoolClass
    serializer_class = SchoolClassSerializer
    search_fields = ["name"]
    ordering_fields = ["order", "name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return services.scope_classes_for_teacher(super().get_queryset(), self.request.user)


class SectionViewSet(AcademicsModelViewSet):
    model = Section
    select_related_fields = ("school_class", "academic_year", "class_teacher__user")
    serializer_class = SectionSerializer
    filterset_fields = ["school_class", "academic_year"]
    search_fields = ["name"]
    ordering_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return services.scope_classes_for_teacher(super().get_queryset(), self.request.user)


class ClassTermResultsView(TenantScopedAPIView):
    """Phase 7: standard-competition-ranked Term Percentages (ties share a rank) for every
    student currently in one class, for one term — the "class position" screen. Query param:
    `term` (required)."""

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def get(self, request, school_class_id):
        term_id = request.query_params.get("term")
        if not term_id:
            return _error("A term is required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        school_class = get_object_or_404(SchoolClass, id=school_class_id)
        term = get_object_or_404(Term, id=term_id)
        rows = [
            {
                "student": str(row["student"].id),
                "student_name": row["student"].full_name,
                "student_admission_number": row["student"].admission_number,
                "term_percentage": str(row["term_percentage"]),
                "position": row["position"],
            }
            for row in services.compute_class_positions(school_class, term)
        ]
        return _ok(rows=rows)


class ClassOverallResultsView(TenantScopedAPIView):
    """Phase 7: Overall % (the average Term Percentage across every term the school has
    configured for one academic year) for every student currently in one class. Query param:
    `academic_year` (required)."""

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def get(self, request, school_class_id):
        academic_year_id = request.query_params.get("academic_year")
        if not academic_year_id:
            return _error("An academic year is required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        school_class = get_object_or_404(SchoolClass, id=school_class_id)
        academic_year = get_object_or_404(AcademicYear, id=academic_year_id)

        from apps.students.models import Student

        students = Student.objects.filter(school=school_class.school, current_class=school_class)
        rows = []
        for student in students:
            overall = services.compute_overall_percentage(school_class, academic_year, student)
            rows.append(
                {
                    "student": str(student.id),
                    "student_name": student.full_name,
                    "student_admission_number": student.admission_number,
                    "overall_percent": str(overall) if overall is not None else None,
                    "threshold_percent": school_class.school.promotion_threshold_percent,
                    "is_public_exam_transition": school_class.is_public_exam_transition,
                }
            )
        return _ok(rows=rows)


class BulkPromoteView(TenantScopedAPIView):
    """Phase 7: the year-end promotion pass for one class. Body: {"school_class": id,
    "academic_year": id, "target_academic_year": id, "student_ids": [id, ...]} — `student_ids`
    is optional; omitting it applies to every student currently in `school_class`."""

    def get_permissions(self):
        return [require_permission("academics.update")()]

    def post(self, request):
        school_class_id = request.data.get("school_class")
        academic_year_id = request.data.get("academic_year")
        target_academic_year_id = request.data.get("target_academic_year")
        if not (school_class_id and academic_year_id and target_academic_year_id):
            return _error(
                "school_class, academic_year, and target_academic_year are all required.",
                "VALIDATION_ERROR",
                status.HTTP_400_BAD_REQUEST,
            )
        school_class = get_object_or_404(SchoolClass, id=school_class_id)
        academic_year = get_object_or_404(AcademicYear, id=academic_year_id)
        target_academic_year = get_object_or_404(AcademicYear, id=target_academic_year_id)

        from apps.students.models import Student

        students_qs = Student.objects.filter(school=school_class.school, current_class=school_class)
        student_ids = request.data.get("student_ids")
        if student_ids:
            students_qs = students_qs.filter(id__in=student_ids)

        created, skipped = services.bulk_promote(
            school_class=school_class,
            academic_year=academic_year,
            target_academic_year=target_academic_year,
            students=list(students_qs),
            actor=request.user,
        )
        return _ok(
            f"Processed {len(created)} student(s); skipped {len(skipped)} already-decided student(s).",
            records=PromotionRecordSerializer(created, many=True, context={"request": request}).data,
            skipped_count=len(skipped),
        )


class ManualPromoteView(TenantScopedAPIView):
    """Phase 7: resolves one student's pending PUBLIC_EXAM_REQUIRED record once the real external
    exam result is known. Body: {"student": id, "new_class": id, "new_academic_year": id,
    "status": "promoted"|"repeated", "external_exam_status": "passed"|"failed"}."""

    def get_permissions(self):
        return [require_permission("academics.update")()]

    def post(self, request):
        from apps.students.models import Student

        student_id = request.data.get("student")
        new_class_id = request.data.get("new_class")
        new_academic_year_id = request.data.get("new_academic_year")
        decision_status = request.data.get("status")
        external_exam_status = request.data.get("external_exam_status")

        if not (student_id and new_class_id and new_academic_year_id and decision_status and external_exam_status):
            return _error(
                "student, new_class, new_academic_year, status, and external_exam_status are all required.",
                "VALIDATION_ERROR",
                status.HTTP_400_BAD_REQUEST,
            )
        if decision_status not in (PromotionRecord.Status.PROMOTED, PromotionRecord.Status.REPEATED):
            return _error("status must be 'promoted' or 'repeated'.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        if external_exam_status not in (
            PromotionRecord.ExternalExamStatus.PASSED,
            PromotionRecord.ExternalExamStatus.FAILED,
        ):
            return _error(
                "external_exam_status must be 'passed' or 'failed'.",
                "VALIDATION_ERROR",
                status.HTTP_400_BAD_REQUEST,
            )

        student = get_object_or_404(Student, id=student_id)
        new_class = get_object_or_404(SchoolClass, id=new_class_id)
        new_academic_year = get_object_or_404(AcademicYear, id=new_academic_year_id)

        try:
            record = services.manual_promote(
                student=student,
                new_class=new_class,
                new_academic_year=new_academic_year,
                status=decision_status,
                external_exam_status=external_exam_status,
                actor=request.user,
            )
        except ValueError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        return _ok("Promotion resolved.", record=PromotionRecordSerializer(record, context={"request": request}).data)


class PromotionRecordViewSet(TenantScopedReadOnlyViewSet):
    """Phase 7/8: read-only — records are only ever created via BulkPromoteView/ManualPromoteView,
    never through a plain create/update/delete, since a PromotionRecord is append-only."""

    serializer_class = PromotionRecordSerializer
    filterset_fields = ["student", "previous_academic_year", "previous_class", "status", "type"]

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def get_queryset(self):
        return PromotionRecord.objects.select_related(
            "student", "previous_class", "previous_academic_year", "new_class", "new_academic_year", "actor"
        ).all()


def _serialize_term_report(report):
    return {
        "subjects": [
            {
                **subject,
                "ca_contribution": str(subject["ca_contribution"]) if subject["ca_contribution"] is not None else None,
                "exam_contribution": (
                    str(subject["exam_contribution"]) if subject["exam_contribution"] is not None else None
                ),
                "final_score": str(subject["final_score"]) if subject["final_score"] is not None else None,
                "grade_points": str(subject["grade_points"]) if subject["grade_points"] is not None else None,
            }
            for subject in report["subjects"]
        ],
        "total_subjects": report["total_subjects"],
        "passed": report["passed"],
        "failed": report["failed"],
        "term_percentage": str(report["term_percentage"]) if report["term_percentage"] is not None else None,
        "position": report["position"],
        "threshold_percent": report["threshold_percent"],
        "overall_percent": str(report["overall_percent"]) if report["overall_percent"] is not None else None,
        "promotion_status": report["promotion_status"],
        "is_tertiary": report["is_tertiary"],
        "grade_point_scale": str(report["grade_point_scale"]) if report["grade_point_scale"] is not None else None,
        "term_gpa": str(report["term_gpa"]) if report["term_gpa"] is not None else None,
    }


_TRANSITION_PAST_TENSE = {"verify": "verified", "publish": "published", "lock": "locked"}


class _BulkTermResultTransitionView(TenantScopedAPIView):
    """Phase 8: shared body for verify/publish/lock. Body: {"school_classes": [id, ...], "term":
    id, "student_ids": [id, ...] (optional)}. The spec's "individual / class / term / multiple
    classes" publication shapes are all this same call with a different `school_classes`/
    `student_ids` combination — see services.bulk_transition_term_results for exactly how."""

    action_name: str
    permission_code: str

    def get_permissions(self):
        return [require_permission(self.permission_code)()]

    def post(self, request):
        school_class_ids = request.data.get("school_classes") or []
        term_id = request.data.get("term")
        student_ids = request.data.get("student_ids")
        if not school_class_ids or not term_id:
            return _error("school_classes and term are required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        school_classes = list(SchoolClass.objects.filter(id__in=school_class_ids))
        term = get_object_or_404(Term, id=term_id)

        processed, skipped = services.bulk_transition_term_results(
            school_classes=school_classes,
            term=term,
            action=self.action_name,
            actor=request.user,
            student_ids=student_ids,
        )
        return _ok(
            f"{len(processed)} result(s) {_TRANSITION_PAST_TENSE[self.action_name]}; "
            f"{len(skipped)} skipped (not ready).",
            processed_count=len(processed),
            skipped_count=len(skipped),
        )


class VerifyTermResultsView(_BulkTermResultTransitionView):
    action_name = "verify"
    permission_code = "results.approve"


class PublishTermResultsView(_BulkTermResultTransitionView):
    action_name = "publish"
    permission_code = "results.publish"


class LockTermResultsView(_BulkTermResultTransitionView):
    action_name = "lock"
    permission_code = "results.lock"


class TermResultPublicationViewSet(TenantScopedReadOnlyViewSet):
    """Phase 8: read-only — publication rows are only ever created/advanced via the transition
    views above, via services.get_or_create_term_result_publication + sync_publication_progress.
    Backs the admin/teacher "historical search" requirement (filter by student/class/term/status
    to review any past result's publication state)."""

    serializer_class = TermResultPublicationSerializer
    filterset_fields = ["student", "school_class", "term", "status"]

    def get_permissions(self):
        return [require_permission("results.view")()]

    def get_queryset(self):
        return TermResultPublication.objects.select_related(
            "student", "school_class", "term", "verified_by", "published_by", "locked_by"
        ).all()


class StudentTermReportView(TenantScopedAPIView):
    """Phase 8: the admin/teacher preview of one student's full term report — the same
    computation a published result would show the student, available here regardless of
    publication status so staff can review before publishing. Backs "Teacher/admin historical
    search access.\""""

    def get_permissions(self):
        return [require_permission("results.view")()]

    def get(self, request, student_id, school_class_id, term_id):
        from apps.students.models import Student

        student = get_object_or_404(Student, id=student_id)
        school_class = get_object_or_404(SchoolClass, id=school_class_id)
        term = get_object_or_404(Term, id=term_id)
        report = services.build_term_result_report(student, school_class, term)
        return _ok(
            student_name=student.full_name,
            school_class_name=school_class.name,
            term_name=term.name,
            **_serialize_term_report(report),
        )


class MyResultsView(TenantScopedAPIView):
    """Student self-service: every one of the student's own PUBLISHED (or later LOCKED — locking
    is a terminal state *after* publication, not a rollback to invisible) term results — the
    "selectable-year academic history" list. Never includes a draft/in-progress/ready-for-review/
    verified-but-unpublished row; each entry links to MyTermResultDetailView for the full report."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(results=[])
        pubs = TermResultPublication.objects.filter(
            student=student_profile,
            status__in=[TermResultPublication.Status.PUBLISHED, TermResultPublication.Status.LOCKED],
        ).select_related("school_class", "term", "term__academic_year")
        data = [
            {
                "id": str(pub.id),
                "school_class": str(pub.school_class_id),
                "school_class_name": pub.school_class.name,
                "term": str(pub.term_id),
                "term_name": pub.term.name,
                "academic_year_name": pub.term.academic_year.name,
                "published_at": pub.published_at,
            }
            for pub in pubs
        ]
        return _ok(results=data)


class MyTermResultDetailView(TenantScopedAPIView):
    """Student self-service: the full report for ONE of the student's own published (or later
    LOCKED) terms. Requires an actual PUBLISHED-or-LOCKED TermResultPublication for (student,
    school_class, term) — anything still short of that (or nonexistent) returns 404, never
    leaking whether grading is even in progress."""

    def get(self, request, school_class_id, term_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can view this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)

        pub = (
            TermResultPublication.objects.filter(
                student=student_profile,
                school_class_id=school_class_id,
                term_id=term_id,
                status__in=[TermResultPublication.Status.PUBLISHED, TermResultPublication.Status.LOCKED],
            )
            .select_related("school_class", "term")
            .first()
        )
        if pub is None:
            return _error("Result not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        report = services.build_term_result_report(student_profile, pub.school_class, pub.term)
        return _ok(
            school_class_name=pub.school_class.name,
            term_name=pub.term.name,
            **_serialize_term_report(report),
        )


class SubjectMaterialViewSet(TenantScopedModelViewSet):
    """Phase 9: files a subject's teacher shares with its enrolled students. Same admin-vs-own-
    subject teacher scoping as StudentSubjectEnrollmentViewSet/AssessmentViewSet."""

    serializer_class = SubjectMaterialSerializer
    filterset_fields = ["subject_offering"]

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _is_admin(self):
        return user_has_permission(self.request.user, "academics.update")

    def _teaches(self, subject_offering):
        return services.user_teaches_offering(self.request.user, subject_offering)

    def get_queryset(self):
        # Deliberately no admin bypass: materials are private to the subject's own teacher and
        # its enrolled students (who read them through MySubjectMaterialsView instead), not
        # visible to a Principal/School Administrator just because they hold academics.update.
        qs = SubjectMaterial.objects.select_related("subject_offering__subject", "uploaded_by").all()
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def perform_create(self, serializer):
        subject_offering = serializer.validated_data["subject_offering"]
        if not self._teaches(subject_offering):
            raise PermissionDenied("Only the subject's own teacher can upload materials.")
        material = serializer.save(school=get_current_school(), uploaded_by=self.request.user)
        services.notify_material_uploaded(material)

    def perform_destroy(self, instance):
        if not self._teaches(instance.subject_offering):
            raise PermissionDenied("Only the subject's own teacher can delete materials.")
        instance.delete()


class SubjectMessageViewSet(TenantScopedModelViewSet):
    """Phase 9: general broadcast messages from a subject's teacher to every enrolled student.
    list/retrieve/create only — a sent message is never edited or deleted, matching how the rest
    of this codebase treats a delivered notification-bearing message as immutable."""

    serializer_class = SubjectMessageSerializer
    filterset_fields = ["subject_offering"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _is_admin(self):
        return user_has_permission(self.request.user, "academics.update")

    def _teaches(self, subject_offering):
        return services.user_teaches_offering(self.request.user, subject_offering)

    def get_queryset(self):
        # No admin bypass — the general class thread is private to the subject's own teacher and
        # its enrolled students (see MySubjectMessagesView for the student side).
        qs = SubjectMessage.objects.select_related("subject_offering__subject", "sender").all()
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def perform_create(self, serializer):
        subject_offering = serializer.validated_data["subject_offering"]
        if not self._teaches(subject_offering):
            raise PermissionDenied("Only the subject's own teacher can message this class here.")
        message = serializer.save(school=get_current_school(), sender=self.request.user)
        services.notify_subject_message(message)


class SubjectPrivateMessageViewSet(TenantScopedModelViewSet):
    """Phase 9: teacher/admin side of a private teacher<->student thread. list/retrieve/create
    only. perform_create re-verifies the target student is actually enrolled in the offering
    (never trusting the client-supplied student id) before ever creating a message or sending a
    notification — closing the IDOR/BOLA path a raw student id in the request body would
    otherwise open."""

    serializer_class = SubjectPrivateMessageSerializer
    filterset_fields = ["subject_offering", "student"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def _is_admin(self):
        return user_has_permission(self.request.user, "academics.update")

    def _teaches(self, subject_offering):
        return services.user_teaches_offering(self.request.user, subject_offering)

    def get_queryset(self):
        # No admin bypass — a private thread is only ever the subject's own teacher and the one
        # student it's with (the student's own side is MySubjectPrivateMessagesView).
        qs = SubjectPrivateMessage.objects.select_related("subject_offering__subject", "student", "sender").all()
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            return qs.none()
        return qs.filter(
            Q(subject_offering__main_teacher=staff_profile) | Q(subject_offering__assistant_teacher=staff_profile)
        )

    def perform_create(self, serializer):
        subject_offering = serializer.validated_data["subject_offering"]
        student = serializer.validated_data["student"]
        if not self._teaches(subject_offering):
            raise PermissionDenied("Only the subject's own teacher can send a private message here.")
        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering=subject_offering, student=student
        ).exists()
        if not enrolled:
            raise ValidationError("This student is not enrolled in the selected subject.")
        message = serializer.save(school=get_current_school(), sender=self.request.user)
        services.notify_private_message(message)


class MySubjectMaterialsView(TenantScopedAPIView):
    """Student self-service: materials for one enrolled subject. 404s (not an empty list) when
    the student isn't actually enrolled — never distinguishing "not enrolled" from "offering
    doesn't exist" in the response."""

    def get(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(materials=[])
        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).exists()
        if not enrolled:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        materials = SubjectMaterial.objects.filter(subject_offering_id=subject_offering_id).select_related(
            "uploaded_by"
        )
        data = SubjectMaterialSerializer(materials, many=True, context={"request": request}).data
        return _ok(materials=data)


class MySubjectMessagesView(TenantScopedAPIView):
    """Student self-service: general (broadcast) messages for one enrolled subject. GET lists the
    thread; POST lets the student post into it too — the class message thread is a two-way space
    for the teacher and every enrolled student, not just a teacher broadcast (see
    apps.academics.views.SubjectMessageViewSet for the teacher's own side of the same thread)."""

    def get(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(messages=[])
        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).exists()
        if not enrolled:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        messages = SubjectMessage.objects.filter(subject_offering_id=subject_offering_id).select_related("sender")
        data = SubjectMessageSerializer(messages, many=True, context={"request": request}).data
        return _ok(messages=data)

    def post(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can send this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        offering = SubjectOffering.objects.filter(
            id=subject_offering_id,
            enrollments__student=student_profile,
        ).select_related("main_teacher__user", "assistant_teacher__user", "subject").first()
        if offering is None:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        body = (request.data.get("body") or "").strip()
        if not body:
            return _error("A message body is required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        message = SubjectMessage.objects.create(
            school=get_current_school(), subject_offering=offering, sender=request.user, body=body,
        )
        teachers = [t.user for t in (offering.main_teacher, offering.assistant_teacher) if t is not None]
        if teachers:
            notify_bulk(
                recipients=teachers,
                category="subject_message",
                title=f"New message in {offering.subject.name}",
                message=body[:200],
                link=f"/academics/subject-offerings/{offering.id}/communications",
            )
        data = SubjectMessageSerializer(message, context={"request": request}).data
        return _ok("Message sent.", **data)


class MySubjectPrivateMessagesView(TenantScopedAPIView):
    """Student self-service: GET lists their own private thread for one subject offering; POST
    sends a reply. `student` is always request.user.student_profile — never a client-supplied id
    — and enrollment is re-checked on every call, closing the IDOR path a raw offering id in the
    URL would otherwise open."""

    def get(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can view this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).exists()
        if not enrolled:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        messages = SubjectPrivateMessage.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).select_related("sender")
        data = SubjectPrivateMessageSerializer(messages, many=True, context={"request": request}).data
        return _ok(messages=data)

    def post(self, request, subject_offering_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can send this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        enrolled = StudentSubjectEnrollment.objects.filter(
            subject_offering_id=subject_offering_id, student=student_profile
        ).exists()
        if not enrolled:
            return _error("Subject not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        body = (request.data.get("body") or "").strip()
        if not body:
            return _error("A message body is required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        message = SubjectPrivateMessage.objects.create(
            school=get_current_school(),
            subject_offering_id=subject_offering_id,
            student=student_profile,
            sender=request.user,
            body=body,
        )
        services.notify_private_message(message)
        data = SubjectPrivateMessageSerializer(message, context={"request": request}).data
        return _ok("Message sent.", **data)


def _serialize_graduation_status(status_data, request):
    current_class = status_data["current_class"]
    return {
        "current_class": str(current_class.id) if current_class else None,
        "current_class_name": current_class.name if current_class else None,
        "is_in_graduation_level": status_data["is_in_graduation_level"],
        "has_graduated": status_data["has_graduated"],
        "graduated_at": status_data["graduated_at"],
        "history": PromotionRecordSerializer(status_data["history"], many=True, context={"request": request}).data,
    }


class StudentGraduationStatusView(TenantScopedAPIView):
    """Phase 10: admin/teacher view of one student's graduation eligibility — derived from the
    school's own configured class structure and that student's actual promotion history, never a
    hard-coded number of levels."""

    def get_permissions(self):
        return [require_permission("academics.view")()]

    def get(self, request, student_id):
        from apps.students.models import Student

        student = get_object_or_404(Student, id=student_id)
        status_data = services.compute_graduation_status(student)
        return _ok(**_serialize_graduation_status(status_data, request))


class MyGraduationStatusView(TenantScopedAPIView):
    """Student self-service: their own graduation eligibility and academic history."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can view this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        status_data = services.compute_graduation_status(student_profile)
        return _ok(**_serialize_graduation_status(status_data, request))
