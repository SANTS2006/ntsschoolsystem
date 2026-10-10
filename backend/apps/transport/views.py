from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.notifications.services import notify
from apps.tenants.services import get_current_school

from .models import Route, Stop, StudentTransportAssignment, Vehicle, VehicleMaintenance
from .serializers import (
    RouteSerializer,
    StopSerializer,
    StudentTransportAssignmentSerializer,
    VehicleMaintenanceSerializer,
    VehicleSerializer,
)


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


class TransportModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the transport.* codes across every transport resource."""

    def get_permissions(self):
        code = f"transport.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class VehicleViewSet(TransportModelViewSet):
    serializer_class = VehicleSerializer
    filterset_fields = ["status"]
    search_fields = ["registration_number", "make_model"]
    summary_stats = {
        "total": {},
        "active": {"status": Vehicle.Status.ACTIVE},
        "in_maintenance": {"status": Vehicle.Status.MAINTENANCE},
        "by_status": {"groupby": "status"},
    }

    def get_queryset(self):
        return Vehicle.objects.select_related("driver__user").all()


class RouteViewSet(TransportModelViewSet):
    serializer_class = RouteSerializer
    search_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return Route.objects.select_related("vehicle").prefetch_related("stops").all()


class StopViewSet(TransportModelViewSet):
    serializer_class = StopSerializer
    filterset_fields = ["route"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return Stop.objects.select_related("route").all()


class VehicleMaintenanceViewSet(TransportModelViewSet):
    serializer_class = VehicleMaintenanceSerializer
    filterset_fields = ["vehicle"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return VehicleMaintenance.objects.select_related("vehicle").all()


class StudentTransportAssignmentViewSet(TransportModelViewSet):
    serializer_class = StudentTransportAssignmentSerializer
    filterset_fields = ["route", "stop"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return StudentTransportAssignment.objects.select_related("student", "route", "stop").all()

    def perform_create(self, serializer):
        assignment = serializer.save(school=get_current_school())
        if assignment.student.user_id:
            notify(
                recipient=assignment.student.user,
                category="transport",
                title="Transport assignment updated",
                message=f"You've been assigned to route \"{assignment.route.name}\", stop \"{assignment.stop.name}\".",
                link="/transport/assignments",
            )


class MyTransportView(TenantScopedAPIView):
    """Student self-service: the student's own transport assignment (route/stop/vehicle),
    mirroring MyLessonsView/MyAssignmentsView's identity-keyed pattern exactly (no permission
    gate). `assignment` is `None` when the student has no `StudentTransportAssignment` yet —
    they don't use school transport, not an error."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(assignment=None)
        assignment = StudentTransportAssignment.objects.filter(
            student=student_profile
        ).select_related("route__vehicle", "stop").first()
        if assignment is None:
            return _ok(assignment=None)
        data = StudentTransportAssignmentSerializer(assignment, context={"request": request}).data
        vehicle = assignment.route.vehicle
        data["vehicle_registration"] = vehicle.registration_number if vehicle else None
        data["pickup_time"] = assignment.stop.pickup_time
        return _ok(assignment=data)
