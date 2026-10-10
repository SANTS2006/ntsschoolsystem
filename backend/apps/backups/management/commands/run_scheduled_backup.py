from django.core.management.base import BaseCommand

from apps.backups import service


class Command(BaseCommand):
    help = (
        "Takes the daily database backup if one is due, then applies the retention policy. Safe to run as often as "
        "you like (every 15 minutes is fine) and from several machines at once: it only acts when a backup is due, and "
        "a database row lock lets exactly one run win. Use --force to take a backup now regardless of the schedule."
    )

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Back up now even if the daily backup isn't due.")

    def handle(self, *args, **options):
        if options["force"]:
            record = service.create_backup("manual")
        else:
            record = service.run_scheduled_backup_if_due()
        if record is None:
            self.stdout.write("No backup is due.")
            return
        self.stdout.write(f"Backup {record.id}: {record.status} / {record.verification}")
        if record.status != "completed":
            raise SystemExit(f"Backup failed: {record.error_message}")
        removed = service.apply_retention()
        if removed:
            self.stdout.write(f"Retention removed {removed} old backup(s).")
