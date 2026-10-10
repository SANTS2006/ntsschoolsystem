from django.core.management.base import BaseCommand

from apps.authorization.services import seed_permission_catalog


class Command(BaseCommand):
    help = "Idempotently create/update the global Permission catalog from apps.authorization.catalog."

    def handle(self, *args, **options):
        seed_permission_catalog()
        self.stdout.write(self.style.SUCCESS("Permission catalog seeded."))
