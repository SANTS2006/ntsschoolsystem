import re

from django.db.models import Q, QuerySet

from apps.authorization.models import Role
from apps.authorization.services import assign_role


class StudentAccountError(Exception):
    """The student's sign-in account could not be created (for example the e-mail is already in use)."""


def provision_student_account(student):
    """Gives a student a login: the account is created with the student's own e-mail address, the school's default password
    (e.g. "GSSK@2026"), the "student" role (see apps.authorization.catalog), and `must_change_password` so they choose their
    own at first sign-in. Returns the new user, or None if the student already has an account or has no e-mail address yet.
    Raises StudentAccountError when that address already belongs to another account."""
    from django.db import IntegrityError, transaction

    from apps.tenants.services import generate_default_password
    from apps.users.models import User

    email = (student.email or "").strip().lower()
    if student.user_id or not email:
        return None
    if User.objects.filter(email__iexact=email).exists():
        raise StudentAccountError(f'An account with the email "{email}" already exists.')
    try:
        with transaction.atomic():
            user = User.objects.create(
                email=email,
                first_name=student.first_name,
                last_name=student.last_name,
                school=student.school,
                user_type=User.UserType.SCHOOL_USER,
                is_active=True,
            )
    except IntegrityError as exc:
        raise StudentAccountError(f'An account with the email "{email}" already exists.') from exc
    user.set_password(generate_default_password(student.school))
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    student.user = user
    student.save(update_fields=["user"])

    student_role = Role.unscoped_objects.filter(school=student.school, slug="student").first()
    if student_role is not None:
        assign_role(user=user, role=student_role)
    return user


def send_student_account_email(student, user, *, request=None) -> bool:
    """Tells a student their account is ready: their sign-in e-mail and the school's temporary password."""
    from html import escape

    from apps.common.email import email_button, school_link, send_email
    from apps.tenants.services import generate_default_password

    school = student.school
    password = generate_default_password(school)
    body = f"""
        <p>Hi {escape(student.first_name)},</p>
        <p>An account has been created for you at <strong>{escape(school.name)}</strong>. Use the details below to sign in.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1f5f9;border-radius:10px;padding:14px 18px;width:100%;">
          <tr><td style="padding:3px 0;color:#64748b;">Email</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(user.email)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Temporary password</td>
              <td style="padding:3px 0;text-align:right;font-weight:600;color:#0f172a;">{escape(password)}</td></tr>
        </table>
        <p>You'll be asked to choose your own password the first time you sign in.</p>
        {email_button(school_link(school, "/login", request), "Sign in", school)}
    """
    return send_email(to_email=user.email, to_name=student.full_name, subject=f"Your {school.name} account", html_content=body, school=school)


def scope_students_for_teacher(queryset: QuerySet, user) -> QuerySet:
    """A Teacher must never browse the whole school's student roster — every `/students/`
    consumer (this app's own list/detail, and every other feature's "pick a student" selector
    that reads through the same endpoint: subject rosters, messaging, attendance, lessons, ...)
    should only ever offer students actually admitted to a class this teacher is assigned to
    teach. Scoping once here, at the shared queryset, means every one of those call sites gets
    this for free rather than each needing its own copy of the same filter.

    Keyed off the "teacher" role slug specifically, not the `students.view`-only permission —
    Accountant and Exams Director also hold view-only student access but legitimately need
    school-wide visibility (fees, exam results), since neither of them "teaches" a class at all.
    `unscoped_objects`/an explicit `user=` filter throughout, the same pattern used in
    `CurrentUserSerializer`, so this is correct regardless of which request-scoped tenant context
    happens to be live when it runs.
    """
    from apps.academics.models import Section, SchoolClass

    from apps.authorization.services import user_has_active_role

    is_teacher = user_has_active_role(user, "teacher")
    if not is_teacher:
        return queryset

    staff_profile = getattr(user, "staff_profile", None)
    if staff_profile is None:
        return queryset.none()

    class_ids = set(
        SchoolClass.unscoped_objects.filter(
            Q(subject_offerings__main_teacher=staff_profile) | Q(subject_offerings__assistant_teacher=staff_profile)
        ).values_list("id", flat=True)
    )
    class_ids |= set(
        Section.unscoped_objects.filter(class_teacher=staff_profile).values_list("school_class_id", flat=True)
    )
    return queryset.filter(current_class_id__in=class_ids)
