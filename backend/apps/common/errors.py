"""Leaf module for API exceptions that the authentication layer must raise.

Kept separate from `apps.common.exceptions` on purpose: that module imports
`rest_framework.views`, and the authenticator is itself imported while DRF's views module is still
loading — importing the handler module from there is a circular import.
"""

from rest_framework import exceptions as drf_exceptions


class PasswordChangeRequired(drf_exceptions.PermissionDenied):
    """Raised for a signed-in account that must choose its own password before doing anything else."""

    default_detail = "You must change your password before continuing."
    default_code = "password_change_required"
