from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.parents.services import notify_student_guardians
from apps.tenants.services import get_current_school

from .models import DisciplineIncident
from .serializers import DisciplineIncidentSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


class DisciplineIncidentViewSet(TenantScopedModelViewSet):
    """
    `discipline.*` is deliberately its own permission group (not folded into
    students.*) — disciplinary records need restricted access (spec section
    46), and by default only principal/school-administrator have it.
    """

    serializer_class = DisciplineIncidentSerializer
    filterset_fields = ["student", "category", "severity", "status"]
    summary_stats = {
        "total": {},
        "reported": {"status": DisciplineIncident.Status.REPORTED},
        "resolved": {"status": DisciplineIncident.Status.RESOLVED},
        "by_severity": {"groupby": "severity"},
    }

    def get_permissions(self):
        code = f"discipline.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return DisciplineIncident.objects.select_related("student", "reported_by").all()

    def perform_create(self, serializer):
        incident = serializer.save(school=get_current_school(), reported_by=self.request.user)
        is_urgent = incident.severity in (DisciplineIncident.Severity.MODERATE, DisciplineIncident.Severity.SEVERE)
        notify_student_guardians(
            incident.student,
            category="discipline",
            title="Disciplinary incident reported",
            message=f"{incident.get_category_display()} — {incident.get_severity_display()} severity.",
            link="/discipline/incidents",
            email_subject=f"Disciplinary incident: {incident.student.full_name}" if is_urgent else None,
            email_html=(
                f"<p>A {incident.severity} disciplinary incident involving "
                f"{incident.student.full_name} was reported at school. Please log in to the "
                f"portal or contact the school for details.</p>"
            )
            if is_urgent
            else None,
        )


class MyDisciplineView(TenantScopedAPIView):
    """Student self-service: the student's own discipline incidents, mirroring
    MyLessonsView/MyAssignmentsView's identity-keyed pattern exactly (no permission gate — the
    queryset filter to `student=student_profile` is itself the security boundary)."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(incidents=[])
        qs = DisciplineIncident.objects.filter(student=student_profile).select_related("reported_by")
        data = DisciplineIncidentSerializer(qs, many=True, context={"request": request}).data
        return _ok(incidents=data)
