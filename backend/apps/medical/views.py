from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.parents.services import notify_student_guardians
from apps.tenants.services import get_current_school

from .models import MedicalProfile, MedicalVisit
from .serializers import MedicalProfileSerializer, MedicalVisitSerializer


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


class MedicalModelViewSet(TenantScopedModelViewSet):
    """
    Shared permission wiring for the medical.* codes. Deliberately its own
    permission group, not folded into students.* — medical information
    needs stricter access than general student records (spec section 45),
    and by default only principal/school-administrator have it (no seeded
    role like teacher/registrar/accountant gets medical.* automatically).
    """

    def get_permissions(self):
        code = f"medical.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class MedicalProfileViewSet(MedicalModelViewSet):
    serializer_class = MedicalProfileSerializer
    filterset_fields = ["student", "blood_group"]
    summary_stats = {
        "total": {},
        "by_blood_group": {"groupby": "blood_group"},
    }

    def get_queryset(self):
        return MedicalProfile.objects.select_related("student").all()


class MedicalVisitViewSet(MedicalModelViewSet):
    serializer_class = MedicalVisitSerializer
    filterset_fields = ["student", "visit_type"]
    summary_stats = {
        "total": {},
        "routine": {"visit_type": MedicalVisit.VisitType.ROUTINE},
        "incident": {"visit_type": MedicalVisit.VisitType.INCIDENT},
        "emergency": {"visit_type": MedicalVisit.VisitType.EMERGENCY},
    }

    def get_queryset(self):
        return MedicalVisit.objects.select_related("student", "attended_by__user").all()

    def perform_create(self, serializer):
        visit = serializer.save(school=get_current_school())
        is_urgent = visit.visit_type in (MedicalVisit.VisitType.INCIDENT, MedicalVisit.VisitType.EMERGENCY)
        notify_student_guardians(
            visit.student,
            category="medical",
            title="Medical visit recorded" if not is_urgent else f"Medical {visit.visit_type}: {visit.student.full_name}",
            message=f"{visit.student.full_name} visited the school clinic ({visit.get_visit_type_display()}).",
            link="/medical/visits",
            email_subject=f"Medical {visit.visit_type}: {visit.student.full_name}" if is_urgent else None,
            email_html=(
                f"<p>{visit.student.full_name} had a medical {visit.visit_type} at school. "
                f"Please log in to the portal or contact the school for details.</p>"
            )
            if is_urgent
            else None,
        )


class MyMedicalView(TenantScopedAPIView):
    """Student self-service: the student's own medical profile plus visit history, mirroring
    MyLessonsView/MyAssignmentsView's identity-keyed pattern exactly (no permission gate).
    `profile` is `None` when the student has no `MedicalProfile` row yet — the school hasn't
    recorded one, not an error."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(profile=None, visits=[])
        profile = MedicalProfile.objects.filter(student=student_profile).first()
        visits = MedicalVisit.objects.filter(student=student_profile).select_related("attended_by__user")
        return _ok(
            profile=MedicalProfileSerializer(profile, context={"request": request}).data if profile else None,
            visits=MedicalVisitSerializer(visits, many=True, context={"request": request}).data,
        )
