"""Who an event or an announcement is for — one definition shared by both.

* **Everybody** — every active user in the school.
* **Groups** — pick one or more classes (and, within them, one or more sections) and/or one or more departments:
  the students of those classes/sections (and, if asked, their parents) plus the staff of those departments.
* **Specific people** — chosen from a list by role, or typed as e-mail addresses.

A separate switch decides whether the item is visible to everyone who may view the module, or only to its audience (and
its creator). The people an item reaches are written down when it is published (the module's own recipients table), so
"who can see this" is exactly "who was notified".
"""

import re

from django.db import models
from django.db.models import Q
from rest_framework import serializers

AUDIENCE_LEGACY = "legacy"  # created before this existed: the older target_type fields still apply
AUDIENCE_ALL = "all"
AUDIENCE_GROUPS = "groups"
AUDIENCE_SPECIFIC = "specific"

EMAIL_SPLIT = re.compile(r"[\s,;]+")


class AudienceFields(models.Model):
    class AudienceType(models.TextChoices):
        LEGACY = AUDIENCE_LEGACY, "Previous setting"
        ALL = AUDIENCE_ALL, "Everybody"
        GROUPS = AUDIENCE_GROUPS, "Classes / departments"
        SPECIFIC = AUDIENCE_SPECIFIC, "Specific people"

    audience_type = models.CharField(max_length=10, choices=AudienceType.choices, default=AUDIENCE_LEGACY)
    audience_classes = models.ManyToManyField("academics.SchoolClass", blank=True, related_name="+")
    audience_sections = models.ManyToManyField("academics.Section", blank=True, related_name="+")
    audience_departments = models.ManyToManyField("academics.Department", blank=True, related_name="+")
    audience_users = models.ManyToManyField("users.User", blank=True, related_name="+")
    # Also tell the parents/guardians of the students reached through the chosen classes/sections.
    include_parents = models.BooleanField(default=False)
    # Off: everyone who may view the module can see it. On: only its audience (and the person who created it) can.
    restricted_to_audience = models.BooleanField(default=False)

    class Meta:
        abstract = True


def resolve_audience(item) -> list:
    """The active users an item (event/announcement with AudienceFields) reaches."""
    from apps.parents.models import Guardian, StudentGuardian
    from apps.students.models import Student
    from apps.users.models import User

    school = item.school
    kind = item.audience_type
    if kind == AUDIENCE_ALL:
        return list(User.objects.filter(school=school, is_active=True))
    if kind == AUDIENCE_SPECIFIC:
        return list(User.objects.filter(school=school, is_active=True, pk__in=item.audience_users.values_list("pk", flat=True)))
    if kind != AUDIENCE_GROUPS:
        return []

    user_ids: set = set()
    class_ids = list(item.audience_classes.values_list("pk", flat=True))
    section_ids = list(item.audience_sections.values_list("pk", flat=True))
    department_ids = list(item.audience_departments.values_list("pk", flat=True))

    if class_ids:
        students = Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE, current_class_id__in=class_ids)
        if section_ids:
            # Sections narrow the chosen classes: a class with sections picked reaches only those sections; a class with
            # none of its own sections picked reaches the whole class.
            from apps.academics.models import Section

            picked = Section.unscoped_objects.filter(pk__in=section_ids).values_list("pk", "school_class_id")
            classes_with_picked = {c for _, c in picked}
            students = students.filter(
                Q(current_section_id__in=section_ids) | ~Q(current_class_id__in=classes_with_picked)
            )
        user_ids.update(students.exclude(user__isnull=True).values_list("user_id", flat=True))
        if item.include_parents:
            guardian_ids = StudentGuardian.unscoped_objects.filter(school=school, student__in=students).values_list("guardian_id", flat=True)
            user_ids.update(
                Guardian.unscoped_objects.filter(school=school, pk__in=guardian_ids, user__isnull=False).values_list("user_id", flat=True)
            )
    if department_ids:
        user_ids.update(
            User.objects.filter(school=school, is_active=True, staff_profile__department_id__in=department_ids).values_list("pk", flat=True)
        )
    return list(User.objects.filter(school=school, is_active=True, pk__in=user_ids))


def visible_filter(user, recipients_path: str) -> Q:
    """The rows a person may see: everything not restricted, what they created, and what reached them."""
    return Q(restricted_to_audience=False) | Q(created_by=user) | Q(**{f"{recipients_path}__user": user})


class AudienceSerializerMixin(serializers.Serializer):
    """Adds the audience fields to a ModelSerializer for an AudienceFields model. `audience_emails` is write-only text
    (addresses separated by spaces, commas or new lines); each must belong to a user of this school."""

    audience_emails = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    audience_recipient_count = serializers.SerializerMethodField()

    AUDIENCE_FIELDS = [
        "audience_type", "audience_classes", "audience_sections", "audience_departments", "audience_users",
        "audience_emails", "include_parents", "restricted_to_audience", "audience_recipient_count",
    ]

    def get_audience_recipient_count(self, obj):
        rel = getattr(obj, "specific_recipients", None)
        return rel.count() if rel is not None else None

    def validate_audience(self, attrs):
        from apps.users.models import User

        school = self.context["request"].user.school
        kind = attrs.get("audience_type", getattr(self.instance, "audience_type", AUDIENCE_LEGACY))
        classes = attrs.get("audience_classes", [])
        sections = attrs.get("audience_sections", [])
        departments = attrs.get("audience_departments", [])
        for label, items in (("Class", classes), ("Section", sections), ("Department", departments)):
            for obj in items:
                if obj.school_id != school.id:
                    raise serializers.ValidationError({"audience": f"{label} must belong to your own school."})
        class_ids = {c.pk for c in classes}
        for section in sections:
            if section.school_class_id not in class_ids:
                raise serializers.ValidationError({"audience_sections": "A section can only be chosen along with its class."})

        users = list(attrs.get("audience_users", []))
        emails = [e.lower() for e in EMAIL_SPLIT.split(attrs.get("audience_emails", "") or "") if e]
        if emails:
            found = {u.email.lower(): u for u in User.objects.filter(school=school, email__in=emails)}
            missing = [e for e in emails if e not in found]
            if missing:
                raise serializers.ValidationError({"audience_emails": "No user in your school has: " + ", ".join(missing)})
            users.extend(found.values())
        for user in users:
            if user.school_id != school.id:
                raise serializers.ValidationError({"audience_users": "Everyone chosen must belong to your school."})
        # de-duplicate, keep order
        seen, unique = set(), []
        for u in users:
            if u.pk not in seen:
                seen.add(u.pk)
                unique.append(u)
        attrs["audience_users"] = unique

        if kind == AUDIENCE_GROUPS and not (classes or departments):
            raise serializers.ValidationError({"audience_classes": "Choose at least one class or department."})
        if kind == AUDIENCE_SPECIFIC and not unique:
            raise serializers.ValidationError({"audience_users": "Choose at least one person, or type their e-mail addresses."})
        attrs.pop("audience_emails", None)
        return attrs
