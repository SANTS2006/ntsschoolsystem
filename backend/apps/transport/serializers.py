from rest_framework import serializers

from .models import Route, Stop, StudentTransportAssignment, Vehicle, VehicleMaintenance


class VehicleSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source="driver.user.full_name", read_only=True, default=None)

    class Meta:
        model = Vehicle
        fields = [
            "id", "registration_number", "make_model", "capacity", "driver", "driver_name",
            "status", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_driver(self, value):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError("Driver must belong to your own school.")
        return value

    def validate_registration_number(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for `unique_vehicle_registration_per_school`
        # — same gap already fixed for Timetable's Room/Period, Finance's FeeCategory/FeeStructure,
        # and Library's BookCategory/Book. Checked explicitly here instead.
        school = self.context["request"].user.school
        qs = Vehicle.objects.filter(school=school, registration_number=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A vehicle with this registration number already exists.")
        return value


class StopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stop
        fields = ["id", "route", "name", "order", "pickup_time"]
        read_only_fields = ["id"]

    def validate_route(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Route must belong to your own school.")
        return value

    def validate(self, attrs):
        # `unique_stop_order_per_route` is a `Meta.constraints` entry, which DRF's automatic
        # validator generation never covers (only DB-level unique_together is auto-detected) —
        # checked explicitly here to avoid a raw IntegrityError (500) on a duplicate order.
        route = attrs.get("route", getattr(self.instance, "route", None))
        order = attrs.get("order", getattr(self.instance, "order", None))
        if route is not None and order is not None:
            qs = Stop.objects.filter(route=route, order=order)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"order": "A stop with this order already exists on this route."})
        return attrs


class RouteSerializer(serializers.ModelSerializer):
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True, default=None)
    stops = StopSerializer(many=True, read_only=True)

    class Meta:
        model = Route
        fields = [
            "id", "name", "description", "vehicle", "vehicle_registration", "stops",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_vehicle(self, value):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError("Vehicle must belong to your own school.")
        return value

    def validate_name(self, value):
        # Same `(school, X)`-uniqueness gap as `VehicleSerializer.validate_registration_number`
        # above, now for `unique_route_name_per_school`.
        school = self.context["request"].user.school
        qs = Route.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A route with this name already exists.")
        return value


class VehicleMaintenanceSerializer(serializers.ModelSerializer):
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)

    class Meta:
        model = VehicleMaintenance
        fields = ["id", "vehicle", "vehicle_registration", "date", "description", "cost", "next_service_date"]
        read_only_fields = ["id"]

    def validate_vehicle(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Vehicle must belong to your own school.")
        return value


class StudentTransportAssignmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    stop_name = serializers.CharField(source="stop.name", read_only=True)

    class Meta:
        model = StudentTransportAssignment
        fields = ["id", "student", "student_name", "route", "route_name", "stop", "stop_name"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_route(self, value):
        return self._same_school(value, "Route")

    def validate_stop(self, value):
        return self._same_school(value, "Stop")

    def validate(self, attrs):
        route = attrs.get("route", getattr(self.instance, "route", None))
        stop = attrs.get("stop", getattr(self.instance, "stop", None))
        if route and stop and stop.route_id != route.id:
            raise serializers.ValidationError({"stop": "Stop must belong to the assigned route."})
        return attrs
