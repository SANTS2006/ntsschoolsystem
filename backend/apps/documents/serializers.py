from rest_framework import serializers

from .models import Document, DocumentCategory


class DocumentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentCategory
        fields = ["id", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for
        # `unique_document_category_name_per_school` — same gap already fixed for Timetable's
        # Room/Period, Finance's FeeCategory/FeeStructure, Library's BookCategory/Book,
        # Transport's Vehicle/Route, and Hostel's Hostel.name. Checked explicitly here instead.
        school = self.context["request"].user.school
        qs = DocumentCategory.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A document category with this name already exists.")
        return value


class DocumentSerializer(serializers.ModelSerializer):
    is_mine = serializers.SerializerMethodField()

    def get_is_mine(self, obj):
        from apps.common.ownership import is_mine_flag

        return is_mine_flag(self, obj, "uploaded_by")

    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    student_name = serializers.CharField(source="student.full_name", read_only=True, default=None)
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True, default=None)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default=None)

    class Meta:
        model = Document
        fields = [
            "id", "title", "description", "category", "category_name", "owner_type", "student", "student_name",
            "staff", "staff_name", "file", "uploaded_by", "uploaded_by_name", "is_mine", "is_confidential", "expiry_date",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "updated_at"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_category(self, value):
        return self._same_school(value, "Category")

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_staff(self, value):
        return self._same_school(value, "Staff")

    def validate(self, attrs):
        owner_type = attrs.get("owner_type", getattr(self.instance, "owner_type", Document.OwnerType.SCHOOL))
        student = attrs.get("student", getattr(self.instance, "student", None))
        staff = attrs.get("staff", getattr(self.instance, "staff", None))

        if owner_type == Document.OwnerType.SCHOOL and (student or staff):
            raise serializers.ValidationError("A school-wide document must not set student or staff.")
        if owner_type == Document.OwnerType.STUDENT and (not student or staff):
            raise serializers.ValidationError("A student document must set student and not staff.")
        if owner_type == Document.OwnerType.STAFF and (not staff or student):
            raise serializers.ValidationError("A staff document must set staff and not student.")
        return attrs
