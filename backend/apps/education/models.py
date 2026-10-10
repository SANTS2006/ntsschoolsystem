from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class Lesson(TenantScopedModel, TimeStampedModel):
    """A single lesson, scoped to one subject for one class (optionally narrowed to one
    section) — same targeting shape as Assignment, so a teacher's existing mental model of
    "who does this reach" carries over directly.

    `target_type` mirrors `Event.TargetType`'s `specific_users` split (same "broadcast vs.
    explicit list" shape): `school_class`/`section` stay populated either way — a lesson still
    belongs to a subject+class contextually for grading/reporting — but for
    `specific_students`, who actually *receives* it (via `MyLessonsView`) is instead read from
    `LessonEnrollment`, not the class/section match."""

    class TargetType(models.TextChoices):
        CLASS_SECTION = "class_section", "Class / Section"
        SPECIFIC_STUDENTS = "specific_students", "Specific Students"

    title = models.CharField(max_length=200)
    description = models.CharField(max_length=2000, blank=True)
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="lessons")
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="lessons")
    # Optional narrowing to one section of the class; null means "the whole class".
    section = models.ForeignKey(
        "academics.Section", null=True, blank=True, on_delete=models.CASCADE, related_name="lessons"
    )
    teacher = models.ForeignKey("staff.Staff", on_delete=models.CASCADE, related_name="lessons")
    is_active = models.BooleanField(default=True)
    target_type = models.CharField(max_length=20, choices=TargetType.choices, default=TargetType.CLASS_SECTION)

    class Meta:
        db_table = "lessons"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.subject.school_id != self.school_id:
            raise ValueError("Lesson.subject must belong to the same school")
        if self.school_class.school_id != self.school_id:
            raise ValueError("Lesson.school_class must belong to the same school")
        if self.section_id:
            if self.section.school_id != self.school_id:
                raise ValueError("Lesson.section must belong to the same school")
            if self.section.school_class_id != self.school_class_id:
                raise ValueError("Lesson.section must belong to Lesson.school_class")
        if self.teacher.school_id != self.school_id:
            raise ValueError("Lesson.teacher must belong to the same school")
        super().save(*args, **kwargs)


class LessonEnrollment(TenantScopedModel):
    """Explicit student audience list — only used/populated when `target_type=specific_students`.
    Mirrors `EventRecipient` exactly, keyed to `Student` instead of `User` since a lesson's
    audience is always specifically students (never staff/parents)."""

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "lesson_enrollments"
        constraints = [
            models.UniqueConstraint(fields=["lesson", "student"], name="unique_lesson_enrollment"),
        ]

    def __str__(self):
        return f"{self.lesson} -> {self.student}"

    def save(self, *args, **kwargs):
        if self.lesson.school_id != self.school_id:
            raise ValueError("LessonEnrollment.lesson must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("LessonEnrollment.student must belong to the same school")
        super().save(*args, **kwargs)


class LessonMaterial(TenantScopedModel, TimeStampedModel):
    """A single document or video attached to a lesson. `material_type` determines which
    validator applies to `file` — enforced in the serializer, since a FileField can't switch
    its validators based on a sibling field's value."""

    class MaterialType(models.TextChoices):
        DOCUMENT = "document", "Document"
        VIDEO = "video", "Video"

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="materials")
    material_type = models.CharField(max_length=10, choices=MaterialType.choices)
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to="lesson_materials/")
    uploaded_by = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "lesson_materials"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.lesson.title} - {self.title}"

    def save(self, *args, **kwargs):
        if self.lesson.school_id != self.school_id:
            raise ValueError("LessonMaterial.lesson must belong to the same school")
        if self.uploaded_by.school_id != self.school_id:
            raise ValueError("LessonMaterial.uploaded_by must belong to the same school")
        super().save(*args, **kwargs)
