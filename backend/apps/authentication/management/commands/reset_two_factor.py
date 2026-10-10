from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.authentication import lockout, two_factor


class Command(BaseCommand):
    help = (
        "Clears one user's two-factor authentication (lost phone AND lost recovery codes) and any "
        "account lock, so they can sign in and enrol a fresh authenticator. This is the break-glass "
        "route for a platform admin who has locked themselves out; run it on the server, where only "
        "someone who controls the deployment can. Audit-logged."
    )

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No user with email {email!r}.")
        two_factor.disable(user, by=user)
        get_user_model().objects.filter(pk=user.pk).update(failed_login_count=0, locked_until=None)
        self.stdout.write(self.style.SUCCESS(f"Two-factor authentication reset for {user.email}. They must enrol again at next sign-in."))
