from django.core.management.base import BaseCommand

from apps.authorization.models import Role
from apps.authorization.services import assign_role
from apps.students.models import Student
from apps.students.services import StudentAccountError, provision_student_account


class Command(BaseCommand):
    help = (
        "Create a login (with the student's own email address) for every student that has an email but no "
        "account yet, and backfill the 'student' role onto any already-linked account that predates that role."
    )

    def handle(self, *args, **options):
        created = 0
        for student in Student.unscoped_objects.filter(user__isnull=True).exclude(email="").select_related("school"):
            try:
                user = provision_student_account(student)
            except StudentAccountError as exc:
                self.stdout.write(f"{student.full_name}: skipped ({exc})")
                continue
            if user:
                created += 1
                self.stdout.write(f"{student.full_name}: {user.email}")
        self.stdout.write(self.style.SUCCESS(f"Provisioned {created} student account(s)."))

        backfilled = 0
        for student in Student.unscoped_objects.filter(user__isnull=False).select_related("school", "user"):
            role = Role.unscoped_objects.filter(school=student.school, slug="student").first()
            if role is not None:
                _relation, was_created = assign_role(user=student.user, role=role)
                if was_created:
                    backfilled += 1


        self.stdout.write(self.style.SUCCESS(f"Backfilled the student role onto {backfilled} existing account(s)."))
