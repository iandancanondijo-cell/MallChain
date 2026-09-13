# Runbook: Suspected JWT/session compromise

Use when: a JWT or session secret may have leaked, a specific user's
account looks compromised, or there's reason to believe forged/stolen
tokens are in use.

## Immediate containment

### One user's account
1. `POST /api/gdpr` isn't it — that's data erasure, not containment. Instead:
2. Ban the account: `PUT`/`POST` via the admin panel (`routes/adminPanel.js`'s
   user-ban action) — blocks new logins and most actions immediately.
3. Force-revoke every existing session for that user: this needs a
   superadmin/backend action calling `revokeAllUserTokens(userId)`
   (`middleware/tokenDenylist.js`) — currently exposed to the USER
   themselves via `POST /api/gdpr`... no — via `POST /api/auth/logout-everywhere`,
   which only the account owner can call. For an admin-initiated forced
   revocation of another user's sessions, this needs to be called directly
   (there is no existing admin-facing HTTP endpoint for it as of this
   writing — a gap worth closing if this runbook gets used for real).

### Suspected JWT_SECRET leak (much more serious — affects every user)
1. Rotate `JWT_SECRET` immediately. This invalidates **every** currently
   issued token platform-wide the moment it's deployed (tokens are signed
   with the old secret and won't verify against the new one) — every user
   gets logged out. This is the correct, intended behavior for this
   scenario, not a bug to route around.
2. Unlike `SESSION_SECRET` (which supports a comma-separated rotation list
   for a graceful transition, see `config/index.js`), `JWT_SECRET` does
   not — there is no "accept both old and new" window for JWTs today. A
   hard cutover is what you want here anyway (a leaked secret must stop
   working immediately, not gradually).
3. Redeploy with the new secret, monitor login volume for the expected
   spike as every user re-authenticates.

## Investigate
- Check `AuditLog` for the affected account/timeframe.
- Check for unusual `apiKeyAuth` usage (`logger.info('apiKeyAuth', 'admin
  API key used', {keyPosition, route})` — logged by key POSITION, not the
  key itself, so check if an unexpected position is suddenly in use,
  suggesting a specific rotated-in key is the one being exercised
  unexpectedly).

## Follow-up
- File `docs/runbooks/post-incident-review-template.md`.
- If root cause was a leaked secret (env var exposure, log leak, etc.),
  that leak path itself needs closing, not just the secret rotated.
