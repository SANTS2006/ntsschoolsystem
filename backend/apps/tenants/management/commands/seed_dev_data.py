from django.core.management.base import BaseCommand

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.tenants.models import School
from apps.users.models import User

DEV_PASSWORD = "TestPass123!secure"


def _refuse_unless_explicitly_allowed():
    """These commands create accounts with a password that is written in the source code, and
    fake students/finance data. Run against a database holding real records that would be a
    backdoor plus corrupted data — so they refuse unless the operator opts in explicitly AND the
    process is a development one (DEBUG on)."""
    import os

    from django.conf import settings
    from django.core.management.base import CommandError

    if not settings.DEBUG or os.environ.get("ALLOW_DEV_SEED") != "1":
        raise CommandError(
            "Refusing to seed demo data: this creates accounts with a publicly known password. "
            "Only run it against a throwaway DEVELOPMENT database, with DJANGO_DEBUG=True and "
            "ALLOW_DEV_SEED=1 set. Never against production."
        )


class Command(BaseCommand):
    help = (
        "Idempotently creates development-only seed data: one demo school, its default "
        "roles, and one user per key role. NEVER run against production. "
        f"All seeded users share the password '{DEV_PASSWORD}' — development only."
    )

    def handle(self, *args, **options):
        _refuse_unless_explicitly_allowed()
        seed_permission_catalog()

        school, _ = School.objects.get_or_create(
            slug="demo-academy",
            defaults={
                "name": "Demo Academy",
                "status": School.Status.ACTIVE,
                "email": "admin@demoacademy.test",
                "country": "Kenya",
                "city": "Nairobi",
            },
        )
        seed_default_roles_for_school(school)

        seed_users = [
            ("principal@demoacademy.test", "Pat", "Principal", "principal"),
            ("teacher@demoacademy.test", "Terry", "Teacher", "teacher"),
            ("accountant@demoacademy.test", "Alex", "Accountant", "accountant"),
        ]
        for email, first_name, last_name, role_slug in seed_users:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": first_name,
                    "last_name": last_name,
                    "school": school,
                    "user_type": User.UserType.SCHOOL_USER,
                    "is_active": True,
                },
            )
            if created:
                user.set_password(DEV_PASSWORD)
                user.save(update_fields=["password"])
            role = Role.unscoped_objects.get(school=school, slug=role_slug)
            assign_role(user=user, role=role)

        platform_admin, created = User.objects.get_or_create(
            email="platform-admin@example.test",
            defaults={
                "first_name": "Platform",
                "last_name": "Admin",
                "user_type": User.UserType.PLATFORM_ADMIN,
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            platform_admin.set_password(DEV_PASSWORD)
            platform_admin.save(update_fields=["password"])

        self.stdout.write(self.style.SUCCESS(f"Dev data seeded. All seeded accounts use password: {DEV_PASSWORD}"))
        for email, *_ in seed_users:
            self.stdout.write(f"  - {email}")
        self.stdout.write(f"  - {platform_admin.email} (platform admin)")
