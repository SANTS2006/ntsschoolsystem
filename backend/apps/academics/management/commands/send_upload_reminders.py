from django.core.management.base import BaseCommand

from apps.academics.submissions import send_due_reminders


class Command(BaseCommand):
    help = (
        "Sends the 'upload closes soon' reminders (in-app and email) for assessments whose upload deadline is near. "
        "Safe to run every 15 minutes: each reminder window goes out once per deadline."
    )

    def handle(self, *args, **options):
        sent = send_due_reminders()
        self.stdout.write(f"Sent {sent} reminder(s).")
