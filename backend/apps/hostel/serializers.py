from rest_framework import serializers

from .models import Bed, Hostel, HostelAllocation, Room


class HostelSerializer(serializers.ModelSerializer):
    warden_name = serializers.CharField(source="warden.user.full_name", read_only=True, default=None)

    class Meta:
        model = Hostel
        fields = ["id", "name", "gender_restriction", "warden", "warden_name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_warden(self, value):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError("Warden must belong to your own school.")
        return value

    def validate_name(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for `unique_hostel_name_per_school`
        # — same gap already fixed for Timetable's Room/Period, Finance's FeeCategory/
        # FeeStructure, Library's BookCategory/Book, and Transport's Vehicle/Route. Checked
        # explicitly here instead.
        school = self.context["request"].user.school
        qs = Hostel.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A hostel with this name already exists.")
        return value


class RoomSerializer(serializers.ModelSerializer):
    hostel_name = serializers.CharField(source="hostel.name", read_only=True)
    bed_count = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "hostel", "hostel_name", "room_number", "capacity", "bed_count"]
        read_only_fields = ["id"]

    def get_bed_count(self, obj):
        return obj.beds.count()

    def validate_hostel(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Hostel must belong to your own school.")
        return value


class BedSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.room_number", read_only=True)
    hostel_name = serializers.CharField(source="room.hostel.name", read_only=True)
    is_occupied = serializers.BooleanField(read_only=True)

    class Meta:
        model = Bed
        fields = ["id", "room", "room_number", "hostel_name", "bed_number", "is_occupied"]
        read_only_fields = ["id"]

    def validate_room(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Room must belong to your own school.")
        return value


class HostelAllocationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    bed_label = serializers.SerializerMethodField()
    # Not required: services.allocate_bed() defaults to today if omitted —
    # the serializer field must match that or an omitted date fails
    # validation before the service ever gets a chance to default it.
    check_in_date = serializers.DateField(required=False)

    class Meta:
        model = HostelAllocation
        fields = [
            "id", "student", "student_name", "bed", "bed_label", "check_in_date",
            "check_out_date", "status", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "check_out_date", "status", "created_at", "updated_at"]

    def get_bed_label(self, obj):
        return str(obj.bed) if obj.bed_id else None

    def validate_student(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Student must belong to your own school.")
        return value

    def validate_bed(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Bed must belong to your own school.")
        return value
