from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import log_action
from apps.authorization.permissions import IsPlatformAdmin, IsSchoolMember
from apps.authorization.services import user_has_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet

from . import services
from .models import School
from .serializers import (
    SchoolAdminSerializer,
    SchoolBrandingSerializer,
    SchoolCreateSerializer,
    SchoolSearchResultSerializer,
    SchoolSelfSerializer,
    SuspendSchoolSerializer,
)


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class SchoolViewSet(TenantScopedModelViewSet):
    """Platform-admin-only school management — create/list/retrieve/update/activate/suspend."""

    permission_classes = [IsPlatformAdmin]
    queryset = School.objects.all().order_by("name")
    filterset_fields = ["status", "school_type", "ownership_type", "country"]
    search_fields = ["name", "slug", "email"]
    ordering_fields = ["name", "created_at"]
    summary_stats = {
        "total": {},
        "active": {"status": School.Status.ACTIVE},
        "by_status": {"groupby": "status"},
    }

    def get_serializer_class(self):
        if self.action == "create":
            return SchoolCreateSerializer
        return SchoolAdminSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        admin_fields = {
            "admin_email": data.pop("admin_email"),
            "admin_first_name": data.pop("admin_first_name"),
            "admin_last_name": data.pop("admin_last_name"),
        }
        school = services.create_school(
            name=data.pop("name"),
            slug=data.pop("slug"),
            admin_email=admin_fields["admin_email"],
            admin_first_name=admin_fields["admin_first_name"],
            admin_last_name=admin_fields["admin_last_name"],
            created_by=request.user,
            request=request,
            **data,
        )
        return Response(
            {
                "success": True,
                "message": "School created and its administrator invited.",
                "code": "OK",
                "errors": [],
                "school": SchoolAdminSerializer(school).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        school = self.get_object()
        services.activate_school(school=school, actor=request.user)
        return _ok("School activated.", school=SchoolAdminSerializer(school).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        school = self.get_object()
        serializer = SuspendSchoolSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.suspend_school(
            school=school, reason=serializer.validated_data["reason"], actor=request.user
        )
        return _ok("School suspended.", school=SchoolAdminSerializer(school).data)


    def destroy(self, request, *args, **kwargs):
        """DELETE /schools/<id>/ {"confirm": "<school slug>"} — only for a suspended school, and only when the caller types
        its address (slug) back, so a stray request cannot erase a school."""
        school = self.get_object()
        if str(request.data.get("confirm", "")).strip() != school.slug:
            return Response(
                {
                    "success": False,
                    "message": "Type the school's address exactly to confirm the deletion.",
                    "code": "CONFIRMATION_REQUIRED",
                    "errors": [{"field": "confirm", "message": "Does not match the school's address."}],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            services.delete_school(school=school, actor=request.user)
        except services.SchoolDeletionBlocked as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "SCHOOL_DELETE_BLOCKED", "errors": []},
                status=status.HTTP_409_CONFLICT,
            )
        return _ok("School deleted.")


class SchoolSelfView(TenantScopedAPIView):
    """A school's own users viewing/updating their school's profile."""

    permission_classes = [IsSchoolMember]

    def get(self, request):
        return _ok(school=SchoolSelfSerializer(request.user.school).data)

    def patch(self, request):
        if not self._can_update(request):
            return Response(
                {
                    "success": False,
                    "message": "You do not have the 'settings.update' permission.",
                    "code": "PERMISSION_DENIED",
                    "errors": [],
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        school = request.user.school
        before = SchoolSelfSerializer(school).data
        serializer = SchoolSelfSerializer(school, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(
            action="school.settings_updated",
            actor=request.user,
            school=school,
            entity_type="School",
            entity_id=str(school.pk),
            before=before,
            after=serializer.data,
        )
        return _ok("School updated.", school=serializer.data)

    def _can_update(self, request):
        return user_has_permission(request.user, "settings.update")


class SchoolBrandingLookupView(APIView):
    """Public, unauthenticated lookup for the per-school branded login page — resolves a school's
    slug into just its name/logo, nothing else. 404s for an unknown slug or a non-active school
    (pending/suspended) rather than exposing which slugs exist and in what state."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "school_branding"

    def get(self, request, slug):
        try:
            school = School.objects.get(slug=slug, status=School.Status.ACTIVE)
        except School.DoesNotExist:
            return Response(
                {"success": False, "message": "School not found.", "code": "NOT_FOUND", "errors": []},
                status=status.HTTP_404_NOT_FOUND,
            )
        return _ok(school=SchoolBrandingSerializer(school).data)


class SchoolSearchView(APIView):
    """Public, unauthenticated "find your school" search for the generic /login page — same
    narrow-fields discipline as SchoolBrandingLookupView. A plain top-N search, not full DRF
    pagination, since this is a lightweight typeahead, not a list page."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "school_branding"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return _ok(schools=[])
        schools = School.objects.filter(name__icontains=query, status=School.Status.ACTIVE).order_by("name")[:10]
        return _ok(schools=SchoolSearchResultSerializer(schools, many=True).data)
