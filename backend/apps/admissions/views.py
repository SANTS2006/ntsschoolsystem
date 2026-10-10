from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.models import School
from apps.tenants.services import get_current_school

from . import form_config, services
from .models import Application
from .serializers import (
    ApplicationSerializer,
    BulkAcceptSerializer,
    BulkApplicationIdsSerializer,
    BulkRejectSerializer,
    InviteInterviewSerializer,
    PublicApplicationSubmitSerializer,
    PublicRoleOptionSerializer,
    PublicSchoolClassOptionSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "destroy": "delete",
    "bulk_shortlist": "update",
    "invite_interview": "update",
    "bulk_accept": "update",
    "bulk_reject": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, http_status=status.HTTP_400_BAD_REQUEST):
    return Response(
        {"success": False, "message": message, "code": "VALIDATION_ERROR", "errors": []}, status=http_status
    )


def _get_active_school(slug):
    try:
        return School.objects.get(slug=slug, status=School.Status.ACTIVE)
    except School.DoesNotExist:
        return None


class PublicApplicationOptionsView(APIView):
    """Public, unauthenticated — the dropdown data a public applicant needs before they can
    submit: this school's classes (student applicant) and assignable roles (staff applicant,
    excluding the "student" role — a staff applicant never applies for that one)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "public_application"

    def get(self, request, school_slug):
        school = _get_active_school(school_slug)
        if school is None:
            return _error("School not found.", status.HTTP_404_NOT_FOUND)

        from apps.academics.models import SchoolClass
        from apps.authorization.models import Role

        classes = SchoolClass.unscoped_objects.filter(school=school).order_by("order", "name")
        roles = (
            Role.unscoped_objects.filter(school=school, is_active=True)
            .exclude(slug="student")
            .order_by("name")
        )
        return _ok(
            classes=PublicSchoolClassOptionSerializer(classes, many=True).data,
            roles=PublicRoleOptionSerializer(roles, many=True).data,
            form={kind: form_config.effective_config(school, kind) for kind in ("student", "staff")},
        )


class PublicApplyView(APIView):
    """Public, unauthenticated application submission — a plain APIView, not a
    TenantScopedModelViewSet: there's no authenticated user here to derive a tenant context
    from, so `school` is resolved explicitly from the URL slug and passed straight through to
    services.submit_application (see that module's docstring for why `TenantManager`'s ambient
    scoping can't be relied on anywhere in this request)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "public_application"

    def post(self, request, school_slug):
        school = _get_active_school(school_slug)
        if school is None:
            return _error("School not found.", status.HTTP_404_NOT_FOUND)

        serializer = PublicApplicationSubmitSerializer(data=request.data, context={"school": school, "request": request})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        documents = data.pop("documents", [])
        custom_files = data.pop("custom_files", {})

        application = services.submit_application(school=school, documents=documents, custom_files=custom_files, **data)
        return Response(
            {
                "success": True,
                "message": "Your application has been submitted.",
                "code": "OK",
                "errors": [],
                "application_id": str(application.id),
            },
            status=status.HTTP_201_CREATED,
        )


class ApplicationViewSet(TenantScopedModelViewSet):
    """Admin-facing: list/retrieve/destroy plus the bulk lifecycle actions below. No create/
    update — an Application only ever comes from the public submission endpoint above, and
    every field change happens through one of these dedicated actions, never a plain PATCH (see
    ApplicationSerializer's docstring)."""

    serializer_class = ApplicationSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]
    filterset_fields = ["kind", "status"]
    search_fields = ["first_name", "last_name", "email"]
    ordering_fields = ["created_at"]
    summary_stats = {
        "total": {},
        "submitted": {"status": Application.Status.SUBMITTED},
        "shortlisted": {"status": Application.Status.SHORTLISTED},
        "interview_scheduled": {"status": Application.Status.INTERVIEW_SCHEDULED},
        "accepted": {"status": Application.Status.ACCEPTED},
        "rejected": {"status": Application.Status.REJECTED},
    }

    def get_queryset(self):
        return (
            Application.objects.select_related(
                "applying_for_class", "applying_for_role", "reviewed_by", "created_student", "created_staff"
            )
            .prefetch_related("documents")
            .all()
        )

    def get_permissions(self):
        code = f"admissions.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    @action(detail=False, methods=["post"], url_path="bulk-shortlist")
    def bulk_shortlist(self, request):
        serializer = BulkApplicationIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        applications = services.shortlist_applications(
            serializer.validated_data["application_ids"], school=get_current_school()
        )
        return _ok(f"Shortlisted {len(applications)} application(s).", updated=len(applications))

    @action(detail=False, methods=["post"], url_path="invite-interview")
    def invite_interview(self, request):
        serializer = InviteInterviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        applications = services.invite_applications_to_interview(
            values["application_ids"],
            school=get_current_school(),
            interview_datetime=values["interview_datetime"],
            location=values["interview_location"],
            notes=values["interview_notes"],
            request=request,
        )
        return _ok(f"Invited {len(applications)} applicant(s) to interview.", updated=len(applications))

    @action(detail=False, methods=["post"], url_path="bulk-accept")
    def bulk_accept(self, request):
        serializer = BulkAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = get_current_school()
        numbers = {str(k): (v or "").strip() for k, v in serializer.validated_data["numbers"].items()}
        applications = Application.objects.filter(
            pk__in=serializer.validated_data["application_ids"], school=school
        )
        accepted, skipped = [], []
        used_in_batch: dict[tuple[str, str], str] = {}  # (kind, number) -> who in this batch already has it
        for application in applications:
            number = numbers.get(str(application.id), "")
            claim = (application.kind, number.lower())
            if number and claim in used_in_batch:
                skipped.append({"id": str(application.id), "name": application.full_name,
                                "reason": f'"{number}" is already being given to {used_in_batch[claim]} in this batch.'})
                continue
            try:
                services.accept_application(application, actor=request.user, request=request, number=number)
                if number:
                    used_in_batch[claim] = application.full_name
                accepted.append(str(application.id))
            except services.ApplicationAcceptError as exc:
                skipped.append({"id": str(application.id), "name": application.full_name, "reason": str(exc)})
        return _ok(f"Accepted {len(accepted)} application(s).", accepted=len(accepted), skipped=skipped)

    @action(detail=False, methods=["post"], url_path="bulk-reject")
    def bulk_reject(self, request):
        serializer = BulkRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        applications = services.reject_applications(
            values["application_ids"], school=get_current_school(), reason=values["reason"], actor=request.user
        )
        return _ok(f"Rejected {len(applications)} application(s).", updated=len(applications))


class ApplicationFormConfigView(TenantScopedAPIView):
    """The admin's view of the public application form: its current setup for both kinds of applicant
    and the shareable link (GET, `admissions.view`), and saving one kind's setup (PUT,
    `admissions.update`). The same effective config is what the public page renders and what
    submissions are validated against."""

    def get_permissions(self):
        code = "admissions.update" if self.request.method == "PUT" else "admissions.view"
        return [require_permission(code)()]

    def get(self, request):
        school = get_current_school()
        return _ok(
            apply_url=services.apply_url(school, request),
            school_slug=school.slug,
            student=form_config.effective_config(school, "student"),
            staff=form_config.effective_config(school, "staff"),
        )

    def put(self, request, kind):
        if kind not in ("student", "staff"):
            return _error("Unknown applicant type.", status.HTTP_404_NOT_FOUND)
        school = get_current_school()
        try:
            config = form_config.save_config(
                school, kind, fields=request.data.get("fields") or {}, custom_fields=request.data.get("custom_fields") or []
            )
        except form_config.FormConfigError as exc:
            return _error(str(exc))
        return _ok("Application form saved.", config=config)
