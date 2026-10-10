from django.core.management.base import BaseCommand

from apps.authorization.models import Role
from apps.authorization.services import assign_role
from apps.students.models import Student
from apps.students.services import provision_student_account, student_default_email
from apps.users.models import User


class Command(BaseCommand):
    help = (
        "Create default logins for every student that doesn't have one yet; backfill the "
        "'student' role onto any already-linked account that predates that role; and, for an "
        "account that still hasn't completed its first sign-in (must_change_password is still "
        "set — nothing about it has been customized yet), re-derive its email in case the "
        "default-email format itself has changed since it was provisioned."
    )

    def handle(self, *args, **options):
        created = 0
        for student in Student.unscoped_objects.filter(user__isnull=True).select_related("school"):
            user = provision_student_account(student)
            if user:
                created += 1
                self.stdout.write(f"{student.full_name}: {user.email}")
        self.stdout.write(self.style.SUCCESS(f"Provisioned {created} student account(s)."))

        backfilled = 0
        renamed = 0
        for student in Student.unscoped_objects.filter(user__isnull=False).select_related("school", "user"):
            role = Role.unscoped_objects.filter(school=student.school, slug="student").first()
            if role is not None:
                _relation, was_created = assign_role(user=student.user, role=role)
                if was_created:
                    backfilled += 1

            if student.user.must_change_password:
                expected_email = student_default_email(student)
                if student.user.email != expected_email and not User.objects.filter(email__iexact=expected_email).exists():
                    old_email = student.user.email
                    student.user.email = expected_email
                    student.user.save(update_fields=["email"])
                    renamed += 1
                    self.stdout.write(f"{student.full_name}: {old_email} -> {expected_email}")
        self.stdout.write(self.style.SUCCESS(f"Backfilled the student role onto {backfilled} existing account(s)."))
        self.stdout.write(self.style.SUCCESS(f"Re-derived the email format for {renamed} not-yet-signed-in account(s)."))
