from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_upload_file
from apps.tenants.models import TenantScopedModel


class Assignment(TenantScopedModel, TimeStampedModel):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="assignments")
    # Optional narrowing to one section of the class; null means "the whole class".
    section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.CASCADE, related_name="assignments"
    )
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="assignments")
    teacher = models.ForeignKey("staff.Staff", on_delete=models.CASCADE, related_name="assignments")
    # Nullable for backward compatibility with every assignment created before this field existed
    # (those fall back to a due_date-within-term match — see
    # apps.examinations.services.compute_ca_score); the frontend form requires it going forward,
    # since CA needs to be scoped to "this subject, in this term," not just "ever."
    term = models.ForeignKey(
        "academics.Term", null=True, blank=True, on_delete=models.SET_NULL, related_name="assignments"
    )
    due_date = models.DateTimeField()
    max_score = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    # This assignment's relative weight within its subject's CA — e.g. Test1=30, Presentation=20,
    # Homework=50. Deliberately NOT required to sum to 100 across a subject's assignments:
    # compute_ca_score() normalizes by the sum of weights of assignments actually graded for a
    # given student, so a partially-graded term still produces a sensible weighted average.
    weight = models.PositiveIntegerField(default=100)
    attachment = models.FileField(
        upload_to="assignments/", null=True, blank=True, validators=[validate_upload_file]
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "assignments"
        ordering = ["-due_date"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.school_class.school_id != self.school_id:
            raise ValueError("Assignment.school_class must belong to the same school")
        if self.section_id:
            if self.section.school_id != self.school_id:
                raise ValueError("Assignment.section must belong to the same school")
            if self.section.school_class_id != self.school_class_id:
                raise ValueError("Assignment.section must belong to Assignment.school_class")
        if self.subject.school_id != self.school_id:
            raise ValueError("Assignment.subject must belong to the same school")
        if self.teacher.school_id != self.school_id:
            raise ValueError("Assignment.teacher must belong to the same school")
        if self.term_id and self.term.school_id != self.school_id:
            raise ValueError("Assignment.term must belong to the same school")
        super().save(*args, **kwargs)


class AssignmentSubmission(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        LATE = "late", "Late"
        GRADED = "graded", "Graded"

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="assignment_submissions")
    submitted_at = models.DateTimeField(auto_now_add=True)
    attachment = models.FileField(upload_to="submissions/", validators=[validate_upload_file])
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.CharField(max_length=1000, blank=True)
    graded_by = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="graded_submissions"
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "assignment_submissions"
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(fields=["assignment", "student"], name="unique_submission_per_student"),
            models.CheckConstraint(condition=models.Q(score__gte=0) | models.Q(score__isnull=True), name="submission_score_non_negative"),
        ]

    def __str__(self):
        return f"{self.student} - {self.assignment}"

    def save(self, *args, **kwargs):
        if self.assignment.school_id != self.school_id:
            raise ValueError("AssignmentSubmission.school must match assignment.school")
        if self.student.school_id != self.school_id:
            raise ValueError("AssignmentSubmission.student must belong to the same school")
        if self.student.current_class_id != self.assignment.school_class_id:
            raise ValueError("Student is not a member of the assignment's class")
        if self.assignment.section_id and self.student.current_section_id != self.assignment.section_id:
            raise ValueError("Student is not a member of the assignment's section")
        if self.score is not None and self.score > self.assignment.max_score:
            raise ValueError("Score cannot exceed the assignment's max_score")
        super().save(*args, **kwargs)
