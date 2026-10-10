from rest_framework import serializers


class AttendanceReportQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    school_class = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError("end_date must not be before start_date.")
        return attrs


class AcademicPerformanceQuerySerializer(serializers.Serializer):
    exam_id = serializers.UUIDField()


class FinanceReportQuerySerializer(serializers.Serializer):
    academic_year_id = serializers.UUIDField(required=False)
