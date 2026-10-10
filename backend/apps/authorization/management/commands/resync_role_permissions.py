from django.core.management.base import BaseCommand

from apps.authorization.services import seed_default_roles_for_school, seed_permission_catalog
from apps.tenants.models import School


class Command(BaseCommand):
    help = (
        "Re-runs seed_default_roles_for_school() for every existing school, fully syncing each "
        "system role's permissions to its current catalog spec — both ADDS newly-included codes "
        "and REMOVES codes no longer included (e.g. after narrowing a role's prefixes). Run this "
        "after any change to PERMISSION_CATALOG or DEFAULT_ROLE_PERMISSION_PREFIXES — a school's "
        "system roles only get created at school-creation time, so existing schools don't pick up "
        "catalog changes (grants OR revocations) until this is run. Idempotent, but note it is "
        "destructive-by-design when a role has been narrowed — run deliberately, not as part of "
        "an automatic deploy/migrate hook. Never touches a school's own custom (non-system) roles."
    )

    def handle(self, *args, **options):
        seed_permission_catalog()
        schools = list(School.objects.all())
        for school in schools:
            seed_default_roles_for_school(school)
        self.stdout.write(self.style.SUCCESS(f"Resynced default role permissions for {len(schools)} school(s)."))
