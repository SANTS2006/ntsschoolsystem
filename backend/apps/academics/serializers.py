from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import (
    AcademicYear,
    Assessment,
    Department,
    PromotionRecord,
    SchoolClass,
    Section,
    StudentSubjectEnrollment,
    Subject,
    SubjectMaterial,
    SubjectMessage,
    SubjectOffering,
    SubjectPrivateMessage,
    Term,
    TermResultPublication,
)
from .services import assert_year_not_archived, compute_ca_allocation


def _reject_if_year_archived(academic_year):
    # Shared by every year-scoped serializer's validate() below — see
    # apps.academics.services.assert_year_not_archived for why this re-raises rather than
    # letting the plain ValueError propagate (it would surface as an unhandled 500, not a 400).
    try:
        assert_year_not_archived(academic_year)
    except ValueError as exc:
        raise serializers.ValidationError(str(exc)) from exc


class AcademicYearSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)

    class Meta:
        model = AcademicYear
        fields = [
            "id", "name", "start_date", "end_date", "is_current", "is_archived", "archived_at", "status",
            "activated_at", "created_at", "updated_at",
        ]
        # is_current/is_archived are only ever changed by the activate/archive/unarchive actions (year_services,
        # services.archive_academic_year), never by a plain create/update: that is what keeps "one active year" true.
        read_only_fields = ["id", "is_current", "is_archived", "archived_at", "status", "activated_at", "created_at", "updated_at"]


class TermSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)

    class Meta:
        model = Term
        fields = [
            "id", "academic_year", "academic_year_name", "name", "sequence", "start_date", "end_date",
            "is_current", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_academic_year(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Academic year must belong to your own school.")
        return value

    def validate(self, attrs):
        academic_year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        _reject_if_year_archived(academic_year)
        if attrs.get("is_current") and academic_year is not None and not academic_year.is_current:
            raise serializers.ValidationError({"is_current": "A term can only be the current term of the active academic year."})
        return attrs

    def _clear_other_current_terms(self, school_id, keep_pk=None):
        # One current term per school: choosing one clears the flag on the others first (the database enforces the same).
        others = Term.objects.filter(school_id=school_id, is_current=True)
        if keep_pk is not None:
            others = others.exclude(pk=keep_pk)
        others.update(is_current=False)

    def create(self, validated_data):
        with transaction.atomic():
            if validated_data.get("is_current"):
                self._clear_other_current_terms(self.context["request"].user.school_id)
            return super().create(validated_data)

    def update(self, instance, validated_data):
        with transaction.atomic():
            if validated_data.get("is_current"):
                self._clear_other_current_terms(instance.school_id, keep_pk=instance.pk)
            return super().update(instance, validated_data)

    # `unique_term_sequence_per_year` needs no explicit validate() here, unlike the
    # school-name-uniqueness gap documented elsewhere in this codebase (Timetable's Room/Period,
    # Finance's FeeCategory, ...): that gap is specifically about a constraint that includes
    # `school`, which is never a serializer field, so DRF's introspection of Meta.constraints
    # never sees the full field set. Here both `academic_year` and `sequence` ARE serializer
    # fields, so DRF's ModelSerializer auto-generates a UniqueTogetherValidator from the
    # UniqueConstraint correctly (surfaced as a `non_field_errors` entry) with no help needed.


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "code", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SubjectSerializer(serializers.ModelSerializer):
    department_names = serializers.SlugRelatedField(
        source="departments", slug_field="name", many=True, read_only=True
    )

    class Meta:
        model = Subject
        fields = ["id", "name", "code", "departments", "department_names", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_departments(self, value):
        request = self.context["request"]
        for department in value:
            if department.school_id != request.user.school_id:
                raise serializers.ValidationError("Every department must belong to your own school.")
        return value


class SubjectOfferingSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    term_name = serializers.CharField(source="term.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    main_teacher_name = serializers.CharField(source="main_teacher.user.full_name", read_only=True)
    assistant_teacher_name = serializers.CharField(
        source="assistant_teacher.user.full_name", read_only=True, default=None
    )
    ca_allocated_percent = serializers.SerializerMethodField()
    ca_remaining_percent = serializers.SerializerMethodField()
    # Whether the signed-in user is one of the teachers assigned to this subject — the only people who may
    # add, edit or delete its CA assessments and enter its scores.
    is_my_subject = serializers.SerializerMethodField()

    class Meta:
        model = SubjectOffering
        fields = [
            "id", "subject", "subject_name", "academic_year", "academic_year_name", "term", "term_name",
            "school_class", "school_class_name", "main_teacher", "main_teacher_name",
            "assistant_teacher", "assistant_teacher_name", "ca_weight_percent", "exam_weight_percent",
            "pass_mark", "exam_max_score", "status", "ca_status", "ca_closed_at", "cover_image",
            "ca_allocated_percent", "ca_remaining_percent", "is_my_subject", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "ca_status", "ca_closed_at", "created_at", "updated_at"]

    def get_is_my_subject(self, obj):
        from .services import user_teaches_offering

        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user is not None and user.is_authenticated and user_teaches_offering(user, obj))

    def get_ca_allocated_percent(self, obj):
        return compute_ca_allocation(obj)["allocated"]

    def get_ca_remaining_percent(self, obj):
        return compute_ca_allocation(obj)["remaining"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_subject(self, value):
        return self._same_school(value, "Subject")

    def validate_academic_year(self, value):
        return self._same_school(value, "Academic year")

    def validate_term(self, value):
        return self._same_school(value, "Term")

    def validate_school_class(self, value):
        return self._same_school(value, "Class")

    def validate_main_teacher(self, value):
        return self._same_school(value, "Main teacher")

    def validate_assistant_teacher(self, value):
        return self._same_school(value, "Assistant teacher")

    def validate(self, attrs):
        term = attrs.get("term", getattr(self.instance, "term", None))
        academic_year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        if term is not None and academic_year is not None and term.academic_year_id != academic_year.id:
            raise serializers.ValidationError({"term": "Term must belong to the selected academic year."})
        _reject_if_year_archived(academic_year)

        ca = attrs.get("ca_weight_percent", getattr(self.instance, "ca_weight_percent", None))
        exam = attrs.get("exam_weight_percent", getattr(self.instance, "exam_weight_percent", None))
        if ca is not None and exam is not None and ca + exam != 100:
            raise serializers.ValidationError(
                {"exam_weight_percent": "CA percentage and exam percentage must sum to 100."}
            )
        return attrs


class AssessmentSerializer(serializers.ModelSerializer):
    subject_offering_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    school_class_name = serializers.CharField(source="subject_offering.school_class.name", read_only=True)
    term_name = serializers.CharField(source="subject_offering.term.name", read_only=True)
    # "off" (no uploads), "open" (students can upload now) or "closed" (the deadline has passed).
    upload_state = serializers.SerializerMethodField()

    def get_upload_state(self, obj):
        from .submissions import upload_state

        return upload_state(obj)

    class Meta:
        model = Assessment
        fields = [
            "id", "subject_offering", "subject_offering_name", "school_class_name", "term_name",
            "name", "weight", "discretionary_weight", "max_score", "status",
            "allow_file_uploads", "upload_deadline", "upload_instructions", "upload_state",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_subject_offering(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Subject offering must belong to your own school.")
        if value.ca_status == SubjectOffering.CAStatus.CLOSED:
            raise serializers.ValidationError("CA is closed for this subject offering.")
        return value

    def validate(self, attrs):
        subject_offering = attrs.get("subject_offering", getattr(self.instance, "subject_offering", None))
        weight = attrs.get("weight", getattr(self.instance, "weight", None))
        status = attrs.get("status", getattr(self.instance, "status", Assessment.Status.ACTIVE))
        discretionary_weight = attrs.get(
            "discretionary_weight", getattr(self.instance, "discretionary_weight", 0)
        )
        if subject_offering is not None:
            _reject_if_year_archived(subject_offering.academic_year)
        if self.instance is not None:
            if self.instance.subject_offering.ca_status == SubjectOffering.CAStatus.CLOSED:
                raise serializers.ValidationError("CA is closed for this subject — reopen it to edit assessments.")
            max_score = attrs.get("max_score")
            if max_score is not None:
                highest_raw = self.instance.scores.aggregate(m=Max("raw_score"))["m"]
                if highest_raw is not None and max_score < highest_raw:
                    raise serializers.ValidationError(
                        {"max_score": f"A score of {highest_raw} has already been entered, so the maximum can't be lower than that."}
                    )
        if weight is not None and discretionary_weight > weight:
            raise serializers.ValidationError(
                {"discretionary_weight": "Cannot be more than the assessment's weight."}
            )
        if self.instance is not None and "discretionary_weight" in attrs:
            highest_awarded = self.instance.scores.aggregate(m=Max("discretionary_mark"))["m"]
            if highest_awarded is not None and discretionary_weight < highest_awarded:
                raise serializers.ValidationError(
                    {
                        "discretionary_weight": (
                            f"Discretionary marks of up to {highest_awarded} have already been awarded; "
                            "reserve at least that many."
                        )
                    }
                )
        if subject_offering is not None and weight is not None:
            allocation = compute_ca_allocation(subject_offering)
            already_allocated = allocation["allocated"]
            if self.instance is not None and self.instance.status == Assessment.Status.ACTIVE:
                already_allocated -= self.instance.weight
            new_total = already_allocated + (weight if status == Assessment.Status.ACTIVE else 0)
            if new_total > subject_offering.ca_weight_percent:
                raise serializers.ValidationError(
                    {
                        "weight": (
                            f"This subject's assessments would total {new_total}% of CA, exceeding the "
                            f"{subject_offering.ca_weight_percent}% allocated to continuous assessment."
                        )
                    }
                )
        return attrs


class StudentSubjectEnrollmentSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    school_class_name = serializers.CharField(source="subject_offering.school_class.name", read_only=True)
    term_name = serializers.CharField(source="subject_offering.term.name", read_only=True)
    main_teacher_name = serializers.CharField(
        source="subject_offering.main_teacher.user.full_name", read_only=True
    )
    assistant_teacher_name = serializers.CharField(
        source="subject_offering.assistant_teacher.user.full_name", read_only=True, default=None
    )
    ca_weight_percent = serializers.IntegerField(source="subject_offering.ca_weight_percent", read_only=True)
    exam_weight_percent = serializers.IntegerField(source="subject_offering.exam_weight_percent", read_only=True)
    pass_mark = serializers.IntegerField(source="subject_offering.pass_mark", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(source="student.admission_number", read_only=True)

    class Meta:
        model = StudentSubjectEnrollment
        fields = [
            "id", "subject_offering", "subject_name", "school_class_name", "term_name",
            "main_teacher_name", "assistant_teacher_name", "ca_weight_percent", "exam_weight_percent",
            "pass_mark", "student", "student_name", "student_admission_number", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_subject_offering(self, value):
        return self._same_school(value, "Subject offering")

    def validate_student(self, value):
        return self._same_school(value, "Student")


class SchoolClassSerializer(serializers.ModelSerializer):
    next_class_name = serializers.CharField(source="next_class.name", read_only=True, default=None)

    class Meta:
        model = SchoolClass
        fields = [
            "id", "name", "order", "next_class", "next_class_name",
            "is_public_exam_transition", "is_graduation_level", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_next_class(self, value):
        if value is None:
            return value
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Next class must belong to your own school.")
        if self.instance is not None and value.pk == self.instance.pk:
            raise serializers.ValidationError("A class cannot be its own next class.")
        return value


class SectionSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    class_teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id", "school_class", "school_class_name", "academic_year", "academic_year_name",
            "name", "class_teacher", "class_teacher_name", "capacity", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_class_teacher_name(self, obj):
        return obj.class_teacher.user.full_name if obj.class_teacher_id else None

    def _validate_same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_school_class(self, value):
        return self._validate_same_school(value, "Class")

    def validate_academic_year(self, value):
        return self._validate_same_school(value, "Academic year")

    def validate_class_teacher(self, value):
        return self._validate_same_school(value, "Class teacher")

    def validate(self, attrs):
        academic_year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        _reject_if_year_archived(academic_year)
        return attrs


class PromotionRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    previous_class_name = serializers.CharField(source="previous_class.name", read_only=True)
    previous_academic_year_name = serializers.CharField(source="previous_academic_year.name", read_only=True)
    new_class_name = serializers.CharField(source="new_class.name", read_only=True, default=None)
    new_academic_year_name = serializers.CharField(source="new_academic_year.name", read_only=True, default=None)
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = PromotionRecord
        fields = [
            "id", "student", "student_name", "student_admission_number",
            "previous_class", "previous_class_name", "previous_academic_year", "previous_academic_year_name",
            "new_class", "new_class_name", "new_academic_year", "new_academic_year_name",
            "overall_percent", "threshold_percent", "status", "type", "external_exam_status",
            "actor", "actor_name", "created_at",
        ]
        read_only_fields = fields


class TermResultPublicationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    term_name = serializers.CharField(source="term.name", read_only=True)
    verified_by_name = serializers.CharField(source="verified_by.full_name", read_only=True, default=None)
    published_by_name = serializers.CharField(source="published_by.full_name", read_only=True, default=None)
    locked_by_name = serializers.CharField(source="locked_by.full_name", read_only=True, default=None)

    class Meta:
        model = TermResultPublication
        fields = [
            "id", "student", "student_name", "student_admission_number",
            "school_class", "school_class_name", "term", "term_name", "status",
            "verified_at", "verified_by", "verified_by_name",
            "published_at", "published_by", "published_by_name",
            "locked_at", "locked_by", "locked_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class SubjectMaterialSerializer(serializers.ModelSerializer):
    subject_offering_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    school_class_name = serializers.CharField(source="subject_offering.school_class.name", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)

    class Meta:
        model = SubjectMaterial
        fields = [
            "id", "subject_offering", "subject_offering_name", "school_class_name",
            "title", "file", "uploaded_by", "uploaded_by_name", "created_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at"]

    def validate_subject_offering(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Subject offering must belong to your own school.")
        return value


class SubjectMessageSerializer(serializers.ModelSerializer):
    subject_offering_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)

    class Meta:
        model = SubjectMessage
        fields = ["id", "subject_offering", "subject_offering_name", "sender", "sender_name", "body", "created_at"]
        read_only_fields = ["id", "sender", "created_at"]

    def validate_subject_offering(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Subject offering must belong to your own school.")
        return value


class SubjectPrivateMessageSerializer(serializers.ModelSerializer):
    subject_offering_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = SubjectPrivateMessage
        fields = [
            "id", "subject_offering", "subject_offering_name", "student", "student_name",
            "sender", "sender_name", "body", "created_at",
        ]
        read_only_fields = ["id", "sender", "created_at"]

    def validate_subject_offering(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Subject offering must belong to your own school.")
        return value

    def validate_student(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Student must belong to your own school.")
        return value
