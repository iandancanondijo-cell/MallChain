# Runbook: Payment-callback DLQ backing up

`mallwallet/queue/paymentCallbackQueue.js` (BullMQ `payment-callbacks`
queue) — populated when `/api/buy/mpesa/callback` or `/api/buy/payout/callback`
throws while processing a real Safaricom callback (see
`mallwallet/workers/paymentCallbackWorker.js`, which replays these through
the exact same `processMpesaCallback`/`handlePayoutCallback` functions the
live route uses).

## Detect
- Growing failed-job count in the `payment-callbacks` BullMQ queue
  (inspect via a BullMQ-aware tool/Bull Board if one is connected, or
  directly via `redis-cli` against the queue's keys)
- `backend_errors_total` or logs showing repeated
  `M-Pesa callback error` / `payout callback error` entries

## Diagnose
1. Is this **one** callback retrying repeatedly (a genuine processing bug —
   check the actual error in the job's logged failure reason), or **many
   different** callbacks failing (points at a systemic issue: Mongo down
   during the window, a bad deploy that broke `processMpesaCallback`)?
2. If Mongo/Redis was down during the window (see runbooks 02/03), this
   backlog is an expected side effect, not a new problem — it should drain
   on its own once the dependency recovers and the worker's retries
   (5 attempts, exponential backoff) succeed.
3. If jobs are landing in BullMQ's **failed** set (exhausted all 5 retries),
   they will not retry again on their own — this needs manual attention.

## Mitigate
- Transient cause (dependency was briefly down): let the worker's own
  retries drain the backlog; monitor that it's actually shrinking, not
  just plateaued.
- Exhausted/failed jobs: inspect the job's `data` (the raw Safaricom
  callback payload) and manually determine the real outcome — cross-check
  the `paymentId`/`payoutRef` against `MallcoinPurchase`/`B2CPayout` to see
  if Safaricom's own retry already succeeded through the live route in the
  meantime (both processing functions are idempotent — see their
  "already processed" guards — so replaying a stale job that already
  succeeded elsewhere is always safe, never a double-charge risk).
- If replaying is needed: re-enqueue the job's `data` manually, or fix
  the underlying bug first if the same payload keeps failing for a
  reproducible reason.

## Verify recovery
Failed-job count stops growing and returns to its normal near-zero
baseline; spot-check a few recently-processed payments actually reflect
the correct final status in `MallcoinPurchase`/`WithdrawalRequest`.
