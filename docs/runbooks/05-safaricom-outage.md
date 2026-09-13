# Runbook: Safaricom/M-Pesa API outage or degradation

## Detect
- `PaymentFailureSpike` alert (sustained `payment_failures_total` increments)
- Users reporting STK push / cash-out failures

## Diagnose
1. Check Safaricom's own status page / API dashboard if you have access —
   this may simply be an upstream outage, not anything on our side.
2. Check which reason is incrementing (`payment_failures_total{reason=...}`):
   - `b2c_token_unavailable` / OAuth failures → Safaricom auth endpoint issue
     or expired/rotated credentials on our side — check `SAFARICOM_KEY`/
     `SAFARICOM_SECRET` are still valid, not just assume it's Safaricom.
   - `b2c_initiation_error` → the B2C payout endpoint specifically
   - `b2c_limit_exceeded` → **not an outage** — this is SEC3's per-tx/daily
     cap working as intended (`services/treasuryLimitsService.js`); the
     held withdrawals are sitting in `pending_review`, waiting for manual
     processing, not stuck due to a Safaricom problem.
3. Both the STK push and B2C payout calls already retry through a bounded
   backoff (`utils/circuitBreaker.js`'s `createPaymentBackoff`, 3 attempts)
   before giving up — if failures are still spiking after that, it's a
   real, sustained problem, not a transient blip our own retries already
   absorb.

## Mitigate
- If this is a genuine Safaricom-side outage: there is nothing to fix on
  our end. Consider proactively flipping `POST /api/admin/maintenance`
  for the `buy`/`withdraw` scopes so users see a clear "payments are
  paused" message instead of confusing individual failures — see
  `docs/runbooks/09-emergency-maintenance-mode.md`.
- Failed M-Pesa callbacks land in the DLQ
  (`mallwallet/queue/paymentCallbackQueue.js`, BullMQ `payment-callbacks`
  queue) and retry automatically (5 attempts, exponential backoff) — check
  that queue's failed-jobs set for anything that exhausted retries during
  a prolonged outage and needs manual replay once Safaricom recovers.

## Verify recovery
`payment_failures_total`'s rate returns to baseline; a real test STK push
(sandbox, if available) completes successfully.
