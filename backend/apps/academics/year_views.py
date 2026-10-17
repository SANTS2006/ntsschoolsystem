from rest_framework import status
from rest_framework.response import Response

from apps.authorization.permissions import IsSchoolMember, require_permission
from apps.common.views import TenantScopedAPIView
from apps.tenants.services import get_current_school

from . import year_services as years
from .models import RolloverRun


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _fail(message, code="VALIDATION_ERROR", http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "code": code, "errors": [message]}, status=http_status)


class AcademicYearContextView(TenantScopedAPIView):
    """GET /academics/year-context/ — the school's active year and the years a person may choose to *view*, for the
    shared header and year selectors. Open to every signed-in school user: it carries only year names, dates and status."""

    permission_classes = [IsSchoolMember]

    def get(self, request):
        from apps.authorization.services import user_has_permission

        context = years.year_context(get_current_school())
        # The interface uses this only to show a hint; the server decides on every write.
        context["can_correct_closed_years"] = user_has_permission(request.user, "academics.correct_closed_year")
        return _ok(**context)


class MyYearHistoryView(TenantScopedAPIView):
    """GET /academics/my-year-history/ — a student's own academic history, year by year: class, section and outcome for every
    year they were enrolled, and the published term results of that year (each links to the existing report). Only ever the
    caller's own record; nothing here takes a student id."""

    permission_classes = [IsSchoolMember]

    def get(self, request):
        from .models import StudentEnrollment, TermResultPublication

        student = getattr(request.user, "student_profile", None)
        if student is None:
            return _ok(years=[], is_student=False)
        enrollments = list(
            StudentEnrollment.objects.filter(student=student).select_related("academic_year", "school_class", "section").order_by("-academic_year__start_date")
        )
        publications = TermResultPublication.objects.filter(
            student=student, status__in=[TermResultPublication.Status.PUBLISHED, TermResultPublication.Status.LOCKED]
        ).select_related("term", "term__academic_year", "school_class")
        by_year: dict = {}
        for pub in publications:
            by_year.setdefault(pub.term.academic_year_id, []).append(
                {
                    "term_name": pub.term.name,
                    "term_id": str(pub.term_id),
                    "school_class_id": str(pub.school_class_id),
                    "school_class_name": pub.school_class.name,
                    "published_at": pub.published_at,
                    "sequence": pub.term.sequence,
                }
            )
        rows = []
        for e in enrollments:
            rows.append(
                {
                    "academic_year_id": str(e.academic_year_id),
                    "academic_year": e.academic_year.name,
                    "status": e.academic_year.status,
                    "start_date": e.academic_year.start_date.isoformat(),
                    "end_date": e.academic_year.end_date.isoformat(),
                    "class": e.school_class.name,
                    "section": e.section.name if e.section else "",
                    "outcome": e.outcome,
                    "results": sorted(by_year.pop(e.academic_year_id, []), key=lambda r: r["sequence"]),
                }
            )
        return _ok(years=rows, is_student=True)


class _RolloverBase(TenantScopedAPIView):
    def get_permissions(self):
        return [require_permission("academics.update")()]

    def _years(self, request):
        school = get_current_school()
        source = years.resolve_year(school, request.data.get("source") or request.query_params.get("source"))
        target = years.resolve_year(school, request.data.get("target") or request.query_params.get("target"))
        return source, target


class RolloverPreviewView(_RolloverBase):
    """POST {"source": id, "target": id} — what a rollover would do. Writes nothing."""

    def post(self, request):
        try:
            source, target = self._years(request)
            return _ok(preview=years.build_rollover_preview(source, target))
        except years.YearLifecycleError as exc:
            return _fail(str(exc))


class RolloverExecuteView(_RolloverBase):
    """POST {"source", "target", "decisions": {student_id: {"outcome", "class"?}}, "options": {...}} — runs the rollover.
    Safe to repeat: a completed run is returned unchanged."""

    def post(self, request):
        try:
            source, target = self._years(request)
            decisions = request.data.get("decisions") or {}
            options = request.data.get("options") or {}
            if not isinstance(decisions, dict) or not isinstance(options, dict):
                return _fail("decisions and options must be objects.")
            for decision in decisions.values():
                if not isinstance(decision, dict) or decision.get("outcome") not in (None, *years.OUTCOMES):
                    return _fail("Each decision needs an outcome of promote, repeat, graduate, withdraw or transfer.")
            run = years.execute_rollover(source, target, actor=request.user, decisions=decisions, options=options)
        except years.YearLifecycleError as exc:
            return _fail(str(exc))
        return _ok("Rollover completed.", run={"id": str(run.pk), "status": run.status, "summary": run.summary, "completed_at": run.completed_at})


class RolloverRunsView(_RolloverBase):
    """GET — the rollover history for the school, newest first."""

    def get(self, request):
        runs = RolloverRun.objects.select_related("source_year", "target_year", "started_by")[:50]
        return _ok(
            runs=[
                {
                    "id": str(r.pk),
                    "source": r.source_year.name,
                    "target": r.target_year.name,
                    "status": r.status,
                    "error": r.error,
                    "summary": r.summary,
                    "started_by": r.started_by.full_name if r.started_by else "",
                    "completed_at": r.completed_at,
                }
                for r in runs
            ]
        )
