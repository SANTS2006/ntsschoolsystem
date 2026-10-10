from django.conf import settings


def get_client_ip(request) -> str:
    """The real client address, without trusting anything the client itself can forge.

    `X-Forwarded-For` is just a request header: a client can send `X-Forwarded-For: 1.2.3.4` and,
    if the first entry were believed, appear in the audit log (and dodge IP throttling) as any
    address it likes. Only the entries appended by OUR OWN reverse proxies can be trusted, and each
    proxy appends the address it saw to the END of the list. With TRUSTED_PROXY_COUNT proxies in
    front of the app, the client's address is therefore that many entries from the right.

    TRUSTED_PROXY_COUNT=0 (development, no proxy) ignores the header completely.
    """
    meta = request.META
    proxies = getattr(settings, "TRUSTED_PROXY_COUNT", 0)
    forwarded_for = meta.get("HTTP_X_FORWARDED_FOR")
    if proxies and forwarded_for:
        hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
        if hops:
            return hops[-min(proxies, len(hops))]
    return meta.get("REMOTE_ADDR", "")
