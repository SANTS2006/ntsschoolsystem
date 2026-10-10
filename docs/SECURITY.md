# Security overview

What protects the system, what was added in the hardening pass, and — just as important — what is
**not** covered yet. Read the last section before putting real student data in.

## Controls in place

**Accounts & sessions**
- Passwords hashed with **Argon2**; minimum **12** characters, common/numeric/similar-to-name passwords rejected.
- **Two-factor authentication (authenticator app, TOTP).** *Mandatory* for the Platform Admin and the Principal role, optional
  for everyone else (Settings → Two-factor authentication). A required account **never receives a session** from its password
  alone: login returns a short-lived token, and cookies are issued only after a valid code. Codes can't be replayed, wrong codes
  count toward the account lockout, secrets are encrypted at rest, and 10 single-use recovery codes (stored only as hashes) cover a
  lost phone. Turning 2FA off, or regenerating recovery codes, re-asks for the password and a code; the owner is emailed on every change.
  A platform admin can reset someone's 2FA; a locked-out platform admin uses the break-glass command
  `python manage.py reset_two_factor <email>` on the server.
- **Account lockout**: 5 consecutive failures (password *or* 2FA code) lock the account 15 min, doubling per further failure
  (cap 24 h); the owner is emailed. Login answers are identical for unknown email / wrong password / locked account (no user
  enumeration), and a locked account still burns a hash's worth of time (no timing side channel).
- Per-IP rate limits on login (10/min), 2FA (10/min), password reset (5/min), token refresh, invitation/verification/password-change
  endpoints, plus a global limit on every other endpoint (anonymous 60/min, signed-in 600/min).
- JWT in **HttpOnly** cookies (JavaScript can't read them → XSS can't steal a session). Access token 15 min; refresh token
  1 day, **rotated on every use and blacklisted**; all sessions revoked on password change/reset.
- Refresh re-checks that the user is still active **and their school is still active** — suspending a user or school ends
  access within 15 minutes, not at token expiry.
- Production cookies: `Secure`, `SameSite=Strict`, `__Host-` prefix (a sibling subdomain can't overwrite them).
- Password-reset / invitation links expire after **1 hour**.
- Automatic sign-out after **30 min of inactivity** (60 s warning) for shared school computers.

**Authorization & tenant isolation**
- Role-based permissions checked server-side on every endpoint; the UI hiding a button is never the only guard.
- Every school-owned table is scoped to the requesting user's school at the query layer; cross-school access returns nothing.
  Automated tests cover cross-tenant reads/writes. Teachers additionally only see students/classes they teach.
- CSRF protection enforced on all cookie-authenticated writes.

**Transport & headers**
- HTTPS only (HTTP redirects), HSTS 1 year incl. subdomains, TLS certificates issued and renewed by Render.
- API responses: `Cache-Control: no-store`, CSP `default-src 'none'`, `nosniff`, `X-Frame-Options: DENY`, Permissions-Policy.
- Web app: strict CSP (no inline/eval/third-party scripts), no framing, camera/mic only for own origin + the Daily.co room.
- One origin for the app and the API — no CORS surface at all.
- Client IP taken only from the entries our own proxies appended (a forged `X-Forwarded-For` can't fake the audit log or dodge rate limits).

**Input, uploads, dependencies**
- ORM only (no raw SQL); React escapes output and no `dangerouslySetInnerHTML`/`eval` anywhere; user-supplied text in emails is HTML-escaped.
- Request bodies capped (2 MB JSON, 210 MB multipart) in middleware and Django. Uploads: extension allowlist, size limits,
  and **content sniffing** that rejects executables/scripts/HTML/SVG even when renamed (e.g. `report.pdf`).
- Dependencies audited (`pip-audit`, `npm audit`): the DRF, SimpleJWT and python-dotenv advisories were fixed by upgrading.

**Infrastructure**
- Django refuses to start in production with a weak/short secret key, wildcard hosts, non-HTTPS origins, or no proxy count.
- Django admin is **not exposed** in production. The container runs as a non-root user; database connections require TLS.
- Demo-data commands (which create accounts with a published password) refuse to run unless explicitly forced in a DEBUG environment.
- Append-only audit log of logins, failures, lockouts, 2FA changes, permission and data changes.

## Not covered yet — be honest with yourself about these
1. **Uploaded files are reachable by URL.** Cloudinary links contain a random suffix but are not signed/expiring, so anyone
   holding a link (e.g. from a forwarded email/screenshot) can open the file. Fine for a school handbook; for confidential
   files (medical, discipline) move them to Cloudinary *authenticated* delivery with signed URLs.
2. **2FA covers Platform Admin and Principal only by default.** Other staff (e.g. School Administrator, Accountant) can opt in;
   widen `TWO_FACTOR_REQUIRED_ROLES` (settings) once your staff are comfortable. There is no SMS/WebAuthn option.
3. **Single service, single region.** No automatic failover; backups/restore must be tested by you (see `deploy/README.md`).
4. **No web-application firewall / DDoS shield.** Cloudflare (free tier) in front is a cheap upgrade; the app-level
   rate limits only stop small abusers.
5. **Formal review.** This was a thorough engineering hardening pass, not an independent penetration test. For a system
   holding minors' records, commission one before or shortly after go-live.
6. **Process, not code:** who can create Principal/Admin accounts, offboarding leavers the same day, regular
   deploys for security patches, and a written breach-response plan.
