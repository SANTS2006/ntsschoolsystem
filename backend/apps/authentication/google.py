"""Sign in with Google: checks the ID token Google's button hands the browser."""
import logging

from django.conf import settings

logger = logging.getLogger("apps")


def is_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID)


def verify_credential(credential: str) -> dict | None:
    """The verified claims of a Google ID token (signature, expiry and audience are all checked), or None when it is not valid
    for this app. Only the e-mail Google has itself verified is ever trusted."""
    if not is_enabled() or not credential:
        return None
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except Exception:  # noqa: BLE001 - a bad, expired or foreign token is simply "not valid"
        logger.info("Google credential rejected", exc_info=True)
        return None
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        return None
    if not claims.get("email") or not claims.get("email_verified"):
        return None
    return claims
