from rest_framework import serializers

from apps.common.validators import validate_upload_file

from .models import Quiz, QuizOption, QuizQuestion


class QuizOptionSerializer(serializers.ModelSerializer):
    """Teacher-facing — includes `is_correct`. Never served to a student; see
    StudentOptionSerializer for the answer-blind equivalent used while a quiz is being taken."""

    class Meta:
        model = QuizOption
        fields = ["id", "order", "text", "is_correct"]


class QuizQuestionSerializer(serializers.ModelSerializer):
    options = QuizOptionSerializer(many=True, read_only=True)

    class Meta:
        model = QuizQuestion
        fields = ["id", "order", "text", "points", "options"]


class QuizSerializer(serializers.ModelSerializer):
    subject_offering_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)
    status = serializers.CharField(read_only=True)
    question_count = serializers.IntegerField(source="questions.count", read_only=True)
    attempted_count = serializers.IntegerField(source="attempts.count", read_only=True)
    questions = QuizQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Quiz
        fields = [
            "id", "subject_offering", "subject_offering_name", "title", "instructions",
            "start_time", "end_time", "duration_minutes", "status", "source_file",
            "question_count", "attempted_count", "questions", "cancelled_at",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class QuizCreateSerializer(serializers.Serializer):
    """A quiz is always created together with its parsed questions (see
    services.create_quiz_from_file) — never the plain ModelSerializer flow, the same reasoning
    as apps.finance.serializers.InvoiceCreateSerializer."""

    subject_offering = serializers.UUIDField()
    title = serializers.CharField(max_length=200)
    instructions = serializers.CharField(required=False, allow_blank=True, default="")
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=1)
    file = serializers.FileField(validators=[validate_upload_file])

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError({"end_time": "End time must be after the start time."})
        return attrs


class StudentOptionSerializer(serializers.ModelSerializer):
    """Answer-blind — no `is_correct`. What a student sees while a quiz is in progress."""

    class Meta:
        model = QuizOption
        fields = ["id", "text"]


class StudentQuizListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject_offering_name = serializers.CharField()
    title = serializers.CharField()
    instructions = serializers.CharField()
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField()
    status = serializers.CharField()
    question_count = serializers.IntegerField()
    my_attempt_status = serializers.CharField(allow_null=True)
    my_score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    my_max_score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)


class AttemptQuestionSerializer(serializers.Serializer):
    """One question, in THIS student's own shuffled order/options — built by the view from
    QuizAttempt.question_order/option_order, not a plain ModelSerializer pass over
    quiz.questions (which would be in the original, unshuffled order)."""

    id = serializers.UUIDField()
    text = serializers.CharField()
    points = serializers.IntegerField()
    options = StudentOptionSerializer(many=True)
    my_option_id = serializers.UUIDField(allow_null=True)


class AttemptStateSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField()
    status = serializers.CharField()
    started_at = serializers.DateTimeField()
    deadline = serializers.DateTimeField()
    questions = AttemptQuestionSerializer(many=True)


class AttemptResultSerializer(serializers.Serializer):
    status = serializers.CharField()
    score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    max_score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    percentage = serializers.FloatField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)


class QuizResultRowSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    student_name = serializers.CharField()
    status = serializers.CharField()
    score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    max_score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    percentage = serializers.FloatField(allow_null=True)
    time_taken_seconds = serializers.IntegerField(allow_null=True)
    violation_count = serializers.IntegerField()


class QuizResultSummarySerializer(serializers.Serializer):
    registered = serializers.IntegerField()
    attempted = serializers.IntegerField()
    completed = serializers.IntegerField()
    average_score = serializers.FloatField(allow_null=True)
    fastest_completion_seconds = serializers.IntegerField(allow_null=True)
    slowest_completion_seconds = serializers.IntegerField(allow_null=True)
    average_completion_seconds = serializers.IntegerField(allow_null=True)


class QuizQuestionBreakdownSerializer(serializers.Serializer):
    question_id = serializers.UUIDField()
    text = serializers.CharField()
    average_time_seconds = serializers.IntegerField(allow_null=True)
    correct_count = serializers.IntegerField()
    graded_count = serializers.IntegerField()
    percent_correct = serializers.FloatField(allow_null=True)


class QuizResultsSerializer(serializers.Serializer):
    rows = QuizResultRowSerializer(many=True)
    summary = QuizResultSummarySerializer()
    questions = QuizQuestionBreakdownSerializer(many=True)
