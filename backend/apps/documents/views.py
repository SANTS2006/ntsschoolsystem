from django.db.models import Q
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.ownership import OwnerOnlyMutationsMixin
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from .models import Document, DocumentCategory
from .serializers import DocumentCategorySerializer, DocumentSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class DocumentCategoryViewSet(TenantScopedModelViewSet):
    serializer_class = DocumentCategorySerializer
    search_fields = ["name", "description"]
    summary_stats = {"total": {}}

    def get_permissions(self):
        code = f"documents.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return DocumentCategory.objects.all()


class DocumentViewSet(OwnerOnlyMutationsMixin, TenantScopedModelViewSet):
    owner_field = "uploaded_by"
    owner_message = "You can only edit or delete documents you uploaded."
    """
    Staff-facing, permission-gated CRUD. `documents.*` is deliberately not in
    any seeded role's default prefix list except principal/school-
    administrator (same "stricter permissions for potentially confidential
    records" treatment as medical/discipline) — students/staff see their own
    documents through MyDocumentsView below instead.
    """

    serializer_class = DocumentSerializer
    filterset_fields = ["category", "owner_type", "student", "staff", "is_confidential"]
    search_fields = ["title", "description"]
    summary_stats = {
        "total": {},
        "by_owner_type": {"groupby": "owner_type"},
        "confidential": {"is_confidential": True},
    }

    def get_permissions(self):
        code = f"documents.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return Document.objects.select_related("category", "student", "staff__user", "uploaded_by").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), uploaded_by=self.request.user)


class MyDocumentsView(TenantScopedAPIView):
    """Student/staff self-service: their own personal documents, plus non-confidential
    school-wide documents. No permission check beyond authentication — the queryset
    filter itself is the security boundary, same shape as MyTimetableView/MyAssignmentsView."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        staff_profile = getattr(request.user, "staff_profile", None)

        visibility = Q(owner_type=Document.OwnerType.SCHOOL, is_confidential=False)
        if student_profile is not None:
            visibility |= Q(owner_type=Document.OwnerType.STUDENT, student=student_profile)
        if staff_profile is not None:
            visibility |= Q(owner_type=Document.OwnerType.STAFF, staff=staff_profile)

        documents = Document.objects.filter(visibility).select_related("category")
        data = DocumentSerializer(documents, many=True, context={"request": request}).data
        return _ok(documents=data)
