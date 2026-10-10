from rest_framework import serializers

from apps.academics.models import SchoolClass
from apps.authorization.models import Role
from apps.common.validators import validate_upload_file

from django.core.exceptions import ValidationError as DjangoValidationError

from . import form_config
from .models import Application, ApplicationDocument


class ApplicationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationDocument
        fields = ["id", "title", "question_key", "file", "created_at"]
        read_only_fields = ["id", "created_at"]


class ApplicationSerializer(serializers.ModelSerializer):
    """Admin-facing read serializer — every mutation goes through a dedicated action
    (shortlist/invite-interview/accept/reject in ApplicationViewSet), never a plain PATCH, so
    every field here is read-only; there is nothing for a generic update() to do."""

    applying_for_class_name = serializers.CharField(source="applying_for_class.name", read_only=True, default=None)
    applying_for_role_name = serializers.CharField(source="applying_for_role.name", read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)
    documents = ApplicationDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "kind", "status",
            "first_name", "middle_name", "last_name", "full_name", "email", "phone",
            "date_of_birth", "gender", "address",
            "applying_for_class", "applying_for_class_name", "previous_school",
            "guardian_name", "guardian_phone", "guardian_email",
            "applying_for_role", "applying_for_role_name", "job_title", "qualification", "years_of_experience",
            "interview_datetime", "interview_location", "interview_notes",
            "reviewed_by", "reviewed_by_name", "decided_at", "rejection_reason",
            "created_student", "created_staff", "documents", "custom_answers",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "kind", "status",
            "first_name", "middle_name", "last_name", "email", "phone",
            "date_of_birth", "gender", "address",
            "applying_for_class", "previous_school", "guardian_name", "guardian_phone", "guardian_email",
            "applying_for_role", "job_title", "qualification", "years_of_experience",
            "interview_datetime", "interview_location", "interview_notes",
            "reviewed_by", "decided_at", "rejection_reason",
            "created_student", "created_staff", "custom_answers",
            "created_at", "updated_at",
        ]


class BulkApplicationIdsSerializer(serializers.Serializer):
    application_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)


class BulkAcceptSerializer(BulkApplicationIdsSerializer):
    """Accepting needs the number each person will be known by: an admission number for a student, a
    staff number for a staff member. `numbers` maps application id -> that number."""

    numbers = serializers.DictField(child=serializers.CharField(max_length=50, allow_blank=True), required=False, default=dict)


class BulkRejectSerializer(BulkApplicationIdsSerializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class InviteInterviewSerializer(BulkApplicationIdsSerializer):
    interview_datetime = serializers.DateTimeField()
    interview_location = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    interview_notes = serializers.CharField(required=False, allow_blank=True, default="")


class PublicSchoolClassOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolClass
        fields = ["id", "name"]


class PublicRoleOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name"]


class PublicApplicationSubmitSerializer(serializers.Serializer):
    """Public, unauthenticated submission (see PublicApplyView) — `applying_for_class`/
    `applying_for_role` are plain UUIDs here, resolved and validated in `validate()` against the
    `school` passed in via context (never request.user, since there is no authenticated user on
    this request at all)."""

    kind = serializers.ChoiceField(choices=Application.Kind.choices)
    first_name = serializers.CharField(max_length=150)
    middle_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    gender = serializers.ChoiceField(
        choices=Application.Gender.choices, required=False, allow_blank=True, default=""
    )
    address = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    applying_for_class = serializers.UUIDField(required=False, allow_null=True, default=None)
    previous_school = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    guardian_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    guardian_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    guardian_email = serializers.EmailField(required=False, allow_blank=True, default="")

    applying_for_role = serializers.UUIDField(required=False, allow_null=True, default=None)
    job_title = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    qualification = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    years_of_experience = serializers.IntegerField(required=False, allow_null=True, default=None, min_value=0)

    documents = serializers.ListField(
        child=serializers.FileField(validators=[validate_upload_file]), required=False, default=list
    )
    # {question_key: answer} for the school's own extra questions (sent as a JSON string in multipart).
    custom_answers = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        school = self.context["school"]
        attrs = self._apply_form_config(attrs, school)
        if attrs["kind"] == Application.Kind.STUDENT:
            class_id = attrs.get("applying_for_class")
            if not class_id:
                raise serializers.ValidationError({"applying_for_class": "Select the class you're applying for."})
            try:
                attrs["applying_for_class"] = SchoolClass.unscoped_objects.get(pk=class_id, school=school)
            except SchoolClass.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"applying_for_class": "Not a valid class for this school."}
                ) from exc
            attrs["applying_for_role"] = None
        else:
            role_id = attrs.get("applying_for_role")
            if not role_id:
                raise serializers.ValidationError({"applying_for_role": "Select the role you're applying for."})
            try:
                attrs["applying_for_role"] = Role.unscoped_objects.get(pk=role_id, school=school, is_active=True)
            except Role.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"applying_for_role": "Not a valid role for this school."}
                ) from exc
            attrs["applying_for_class"] = None
        return attrs

    def _apply_form_config(self, attrs, school):
        """Holds the submission to the school's own form: questions it switched off are ignored,
        questions it made mandatory must be answered, and its extra questions are checked and stored
        alongside the answer's label. A question the form never offered can't be smuggled in."""
        config = form_config.effective_config(school, attrs["kind"])
        errors = {}
        for field in config["fields"]:
            key = field["key"]
            if not field["enabled"]:
                if key == "documents":
                    attrs["documents"] = []
                elif key in attrs:
                    attrs[key] = None if key in ("date_of_birth", "years_of_experience") else ""
                continue
            if field["required"] and key not in ("applying_for_class", "applying_for_role"):
                value = attrs.get(key)
                if value is None or value == "" or value == []:
                    errors[key] = "This field is required."

        raw = attrs.get("custom_answers") or {}
        if not isinstance(raw, dict):
            raise serializers.ValidationError({"custom_answers": "Invalid answers."})
        request = self.context.get("request")
        uploads = request.FILES if request is not None else {}
        answers = {}
        custom_files = {}
        for question in config["custom_fields"]:
            key, kind = question["key"], question["type"]
            if kind == "file":
                files = uploads.getlist(f"file_{key}") if hasattr(uploads, "getlist") else []
                if not files:
                    if question["required"]:
                        errors[key] = "Please upload a file."
                    continue
                try:
                    for upload in files:
                        validate_upload_file(upload)
                except DjangoValidationError as exc:
                    errors[key] = "; ".join(exc.messages)
                    continue
                custom_files[key] = (question["label"], files)
                answers[key] = {"label": question["label"], "value": ", ".join(f.name for f in files)[:2000]}
                continue

            value = raw.get(key, "")
            if isinstance(value, (list, tuple)):  # a multiple-choice question sends a list
                values = [str(v).strip() for v in value if str(v).strip()]
            else:
                values = [str(value or "").strip()] if str(value or "").strip() else []

            if kind == "checkbox":
                ticked = bool(values) and values[0].lower() in ("true", "yes", "1", "on")
                if question["required"] and not ticked:
                    errors[key] = "This box must be ticked."
                    continue
                answers[key] = {"label": question["label"], "value": "Yes" if ticked else "No"}
                continue

            if not values:
                if question["required"]:
                    errors[key] = "This question is required."
                continue
            if kind in ("select", "radio") and (len(values) != 1 or values[0] not in question["options"]):
                errors[key] = "Choose one of the listed options."
                continue
            if kind == "multiselect" and any(v not in question["options"] for v in values):
                errors[key] = "Choose only from the listed options."
                continue
            if kind == "number":
                try:
                    float(values[0])
                except ValueError:
                    errors[key] = "Enter a number."
                    continue
            if kind == "email":
                try:
                    serializers.EmailField().run_validation(values[0])
                except serializers.ValidationError:
                    errors[key] = "Enter a valid email address."
                    continue
            answers[key] = {"label": question["label"], "value": ", ".join(values)[:2000]}
        if errors:
            raise serializers.ValidationError(errors)
        attrs["custom_answers"] = answers
        attrs["custom_files"] = custom_files
        return attrs
