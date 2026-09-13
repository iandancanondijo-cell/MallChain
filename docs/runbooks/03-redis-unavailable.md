# Runbook: Redis unavailable

## Detect
- `/api/health` reports `redis: {status: "error"}` or `"not_configured"`
- `HighMemoryUsage`/queue-related alerts, or reports of "logged-out users
  still able to use old tokens" (see security note below)

## What breaks, specifically
- **JWT revocation stops working** (`middleware/tokenDenylist.js` fails
  open by design) — "Sign Out Everywhere" and `/api/auth/logout` become
  no-ops. This is a real, if bounded, security-relevant degradation: treat
  a prolonged Redis outage as also requiring a review of whether any
  logout-driven revocation was actually needed during the window once
  Redis is back.
- **Rate limiting stops enforcing** — no immediate action needed, but watch
  for abuse during the window.
- **M-Pesa callback DLQ (`mallwallet/queue/paymentCallbackQueue.js`) can't
  accept new entries** — a callback that fails processing during this
  window has no durable retry queued. Cross-check `WithdrawalRequest`/
  `MallcoinPurchase` records created during the outage once Redis is back;
  Safaricom's own callback retries are the only safety net until then.

## Mitigate
- Restart/failover Redis. This backend is designed for this outage to be
  survivable, not catastrophic — no restore-from-backup step exists or is
  needed (see `docs/disaster-recovery/disaster-recovery-plan.md`'s
  "why Redis has no backup").
- If the backend was started in production with Redis down, it will have
  refused to boot (hard requirement, see `index.js`'s `start()`) — this is
  the ONE case where "Redis down" and "backend down" runbooks converge.

## Verify recovery
`/api/health` reports `redis: {status: "ok"}`. Confirm the JWT denylist is
actually working again: log out a test session, confirm its token is
rejected on the next request.
