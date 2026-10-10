"""What the "who is this for" picker needs, for anyone who may create or edit an event, an announcement or a meeting —
they get every class, section and department (and can search people by role) without needing access to the academics
or staff modules themselves."""

from django.db.models import Q
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.authorization.services import user_has_permission
from apps.common.views import TenantScopedAPIView

AUDIENCE_PERMISSIONS = (
    "events.create", "events.update", "communications.create", "communications.update", "meetings.create", "meetings.update",
)


class CanChooseAudience(BasePermission):
    message = "You do not have access to choose an audience."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and any(user_has_permission(user, code) for code in AUDIENCE_PERMISSIONS))


def _ok(**extra):
    return Response({"success": True, "message": "", "code": "OK", "errors": [], **extra})


class AudienceOptionsView(TenantScopedAPIView):
    """GET /audience/options/ — all classes, sections and departments, and the roles people can be picked by."""

    permission_classes = [CanChooseAudience]

    def get(self, request):
        from apps.academics.models import Department, Section, SchoolClass
        from apps.authorization.models import Role

        sections = Section.objects.select_related("school_class").all()
        current = sections.filter(academic_year__is_current=True)
        sections = current if current.exists() else sections  # the current year's sections (all of them if none is marked current)
        return _ok(
            classes=[{"id": str(c.id), "name": c.name} for c in SchoolClass.objects.all().order_by("order", "name")],
            sections=[
                {"id": str(s.id), "name": s.name, "school_class": str(s.school_class_id), "school_class_name": s.school_class.name}
                for s in sections.order_by("school_class__order", "name")
            ],
            departments=[{"id": str(d.id), "name": d.name} for d in Department.objects.all().order_by("name")],
            roles=[{"id": str(r.id), "name": r.name, "slug": r.slug} for r in Role.objects.filter(is_active=True).order_by("name")],
        )


class AudiencePeopleView(TenantScopedAPIView):
    """GET /audience/people/?search=&role=<slug> — people to pick, up to 50 at a time, newest-first matches by name or
    e-mail, optionally only those holding one role."""

    permission_classes = [CanChooseAudience]

    def get(self, request):
        from apps.users.models import User

        qs = User.objects.filter(school=request.user.school, is_active=True)
        role = request.query_params.get("role")
        if role:
            qs = qs.filter(user_roles__role__slug=role, user_roles__role__is_active=True)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(email__icontains=search))
        qs = qs.distinct().order_by("first_name", "last_name")[:50]
        return _ok(people=[{"id": str(u.id), "name": u.full_name, "email": u.email} for u in qs])
