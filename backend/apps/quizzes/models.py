from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_upload_file
from apps.tenants.models import TenantScopedModel


class Quiz(TenantScopedModel, TimeStampedModel):
    """One scheduled quiz for a SubjectOffering, built from a teacher-uploaded question file
    (see apps.quizzes.parsing). `status` is deliberately computed, not a stored field this app
    has to keep in sync with the clock — there's no background-task infrastructure in this
    codebase to flip a stored status at the right moment, and every consumer already needs
    "right now" anyway, so a property reading start_time/end_time/cancelled_at is both simpler
    and can never drift out of sync with reality."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        ENDED = "ended", "Ended"
        CANCELLED = "cancelled", "Cancelled"

    subject_offering = models.ForeignKey(
        "academics.SubjectOffering", on_delete=models.CASCADE, related_name="quizzes"
    )
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    # Once a student starts, this is how long THEY individually get — independent of how wide
    # the [start_time, end_time] availability window is (a teacher might open a quiz for a whole
    # morning, but each student who starts only gets e.g. 20 minutes from their own start).
    duration_minutes = models.PositiveIntegerField()
    source_file = models.FileField(
        upload_to="quiz_sources/", null=True, blank=True, validators=[validate_upload_file]
    )
    created_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "quizzes"
        ordering = ["-start_time"]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_time__gt=models.F("start_time")), name="quiz_end_after_start"),
        ]

    def __str__(self):
        return self.title

    @property
    def status(self) -> str:
        if self.cancelled_at is not None:
            return self.Status.CANCELLED
        now = timezone.now()
        if now < self.start_time:
            return self.Status.SCHEDULED
        if now > self.end_time:
            return self.Status.ENDED
        return self.Status.ACTIVE

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("Quiz.school must match subject_offering.school")
        super().save(*args, **kwargs)


class QuizQuestion(TenantScopedModel, TimeStampedModel):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    # Original order as parsed from the uploaded file — the per-student shuffle (see
    # QuizAttempt.question_order) never touches this; it's the stable ordering a teacher sees.
    order = models.PositiveIntegerField()
    text = models.TextField()
    points = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "quiz_questions"
        ordering = ["order"]

    def __str__(self):
        return self.text[:60]


class QuizOption(TenantScopedModel, TimeStampedModel):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="options")
    order = models.PositiveIntegerField()
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)

    class Meta:
        db_table = "quiz_options"
        ordering = ["order"]

    def __str__(self):
        return self.text[:60]


class QuizAttempt(TenantScopedModel, TimeStampedModel):
    """One student's run at a Quiz — at most one per (quiz, student), ever (a student who runs
    out of time or gets auto-submitted for violations doesn't get a second attempt; that's a
    deliberate integrity choice, not an oversight)."""

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        AUTO_SUBMITTED = "auto_submitted", "Auto-submitted"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="quiz_attempts")
    # This student's own shuffled question order (list of QuizQuestion id strings) and, per
    # question, their own shuffled option order (dict of {question_id: [option_id, ...]}) — see
    # apps.quizzes.services.start_attempt. Generated once, on first start, and reused on every
    # resume so a page reload doesn't reshuffle mid-attempt.
    question_order = models.JSONField(default=list, blank=True)
    option_order = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    violation_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "quiz_attempts"
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(fields=["quiz", "student"], name="one_attempt_per_student_per_quiz"),
        ]

    def __str__(self):
        return f"{self.student} - {self.quiz}"

    def save(self, *args, **kwargs):
        if self.quiz.school_id != self.school_id or self.student.school_id != self.school_id:
            raise ValueError("QuizAttempt.school must match quiz.school and student.school")
        super().save(*args, **kwargs)


class QuizAnswer(TenantScopedModel, TimeStampedModel):
    """One question's worth of one attempt: which option the student picked (if any) plus the
    timestamps behind the teacher-facing analytics (`shown_at` -> `answered_at` is how long this
    particular student spent on this particular question)."""

    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="+")
    selected_option = models.ForeignKey(
        QuizOption, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    shown_at = models.DateTimeField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    is_correct = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = "quiz_answers"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="one_answer_per_question_per_attempt"),
        ]


class QuizViolation(TenantScopedModel, TimeStampedModel):
    """A proctoring event the student's browser reported during an attempt — see
    apps.quizzes.services.record_violation. This is best-effort detection (fullscreen-exit,
    tab-hidden, window-blur), never a true block: no web page can actually prevent a browser tab
    switch or an OS-level app switch, only notice when one happened."""

    class Kind(models.TextChoices):
        FULLSCREEN_EXIT = "fullscreen_exit", "Exited fullscreen"
        TAB_HIDDEN = "tab_hidden", "Switched tab or app"
        BLUR = "blur", "Window lost focus"

    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="violations")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "quiz_violations"
        ordering = ["occurred_at"]
