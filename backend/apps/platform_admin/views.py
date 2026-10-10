from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import log_action
from apps.authorization.permissions import IsPlatformAdmin
from apps.common.background import run_in_background
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.models import School
from apps.users.models import User
from apps.users.services import invite_user

from .maintenance import notice_payload, send_maintenance_emails
from .models import MaintenanceNotice
from .serializers import InvitePlatformAdminSerializer, MaintenanceUpdateSerializer, PlatformAdminSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class PlatformAdminViewSet(TenantScopedModelViewSet):
    """Manage platform-administrator accounts. Platform-admin-only, obviously."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformAdminSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["created_at", "email"]
    summary_stats = {
        "total": {},
        "active": {"is_active": True},
    }

    def get_queryset(self):
        return User.objects.filter(user_type=User.UserType.PLATFORM_ADMIN).order_by("email")

    def create(self, request, *args, **kwargs):
        return Response(
            {
                "success": False,
                "message": "Platform admins cannot be created directly. Use the 'invite' action.",
                "code": "METHOD_NOT_ALLOWED",
                "errors": [],
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=["post"])
    def invite(self, request):
        serializer = InvitePlatformAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        admin = invite_user(
            email=data["email"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            school=None,
            user_type=User.UserType.PLATFORM_ADMIN,
            invited_by=request.user,
            request=request,
        )
        message = "Invitation sent." if admin.invite_email_sent else (
            "Account created, but the sign-in email could not be sent."
        )
        return _ok(message, admin=PlatformAdminSerializer(admin).data, email_sent=admin.invite_email_sent)

    def destroy(self, request, *args, **kwargs):
        """Permanently removes a platform admin — only one who has already been disabled, and never yourself.
        The account and everything hanging off it (sign-in sessions, two-factor device and recovery codes,
        notifications) goes with it; the audit trail keeps the actor's email so history stays accountable."""
        admin = self.get_object()
        if admin.pk == request.user.pk:
            return Response(
                {"success": False, "message": "You cannot delete your own account.", "code": "SELF_DELETE_FORBIDDEN", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if admin.is_active:
            return Response(
                {
                    "success": False,
                    "message": "Disable this platform admin before deleting them.",
                    "code": "ADMIN_STILL_ACTIVE",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        email, admin_id = admin.email, str(admin.pk)
        admin.delete()
        log_action(
            action="platform.admin_deleted",
            actor=request.user,
            entity_type="User",
            entity_id=admin_id,
            severity="warning",
            metadata={"email": email},
        )
        return _ok("Platform admin deleted.")

    @action(detail=True, methods=["post"])
    def disable(self, request, pk=None):
        admin = self.get_object()
        if admin.pk == request.user.pk:
            return Response(
                {
                    "success": False,
                    "message": "You cannot disable your own account.",
                    "code": "SELF_DISABLE_FORBIDDEN",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        admin.is_active = False
        admin.save(update_fields=["is_active"])
        log_action(
            action="platform.admin_disabled",
            actor=request.user,
            entity_type="User",
            entity_id=str(admin.pk),
            severity="warning",
        )
        return _ok("Platform admin disabled.", admin=PlatformAdminSerializer(admin).data)

    @action(detail=True, methods=["post"])
    def enable(self, request, pk=None):
        admin = self.get_object()
        admin.is_active = True
        admin.save(update_fields=["is_active"])
        log_action(
            action="platform.admin_enabled",
            actor=request.user,
            entity_type="User",
            entity_id=str(admin.pk),
        )
        return _ok("Platform admin enabled.", admin=PlatformAdminSerializer(admin).data)


class PlatformStatsView(TenantScopedAPIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        status_counts = {
            row["status"]: row["count"]
            for row in School.objects.values("status").annotate(count=Count("id"))
        }
        return _ok(
            stats={
                "schools_total": School.objects.count(),
                "schools_by_status": {
                    choice_value: status_counts.get(choice_value, 0)
                    for choice_value, _ in School.Status.choices
                },
                "school_users_total": User.objects.filter(
                    user_type=User.UserType.SCHOOL_USER
                ).count(),
                "platform_admins_total": User.objects.filter(
                    user_type=User.UserType.PLATFORM_ADMIN
                ).count(),
            }
        )


class MaintenanceView(APIView):
    """GET (public): is the system under maintenance, and what should the banner say / where.
    PUT (platform admin): switch it on or off, change the message or the pages, optionally email everyone."""

    def get_authenticators(self):
        # Reading is public (the sign-in page shows the banner too) and must work even with a stale session
        # cookie; writing needs a signed-in platform admin.
        from apps.authentication.authentication import CookieJWTAuthentication

        return [] if self.request.method == "GET" else [CookieJWTAuthentication()]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsPlatformAdmin()]

    def get(self, request):
        return _ok(maintenance=notice_payload(MaintenanceNotice.get_solo()))

    def put(self, request):
        serializer = MaintenanceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        notice = MaintenanceNotice.get_solo()
        was_enabled = notice.enabled

        notice.enabled = data["enabled"]
        notice.message = data.get("message", notice.message)
        notice.all_pages = data["all_pages"]
        notice.pages = data["pages"]
        notice.updated_by = request.user
        if notice.enabled and not was_enabled:
            notice.enabled_at = timezone.now()
        if not notice.enabled:
            notice.enabled_at = None
        notice.save()

        log_action(
            action="platform.maintenance_on" if notice.enabled and not was_enabled else (
                "platform.maintenance_off" if was_enabled and not notice.enabled else "platform.maintenance_updated"
            ),
            actor=request.user,
            entity_type="MaintenanceNotice",
            entity_id=str(notice.pk),
            severity="warning",
            metadata={"all_pages": notice.all_pages, "pages": notice.pages},
        )

        emailing = bool(data.get("notify")) and notice.enabled and not was_enabled
        if emailing:
            run_in_background("maintenance emails", send_maintenance_emails)
        message = "Maintenance mode is on." if notice.enabled else "Maintenance mode is off."
        return _ok(message, maintenance=notice_payload(notice), emailing=emailing)
