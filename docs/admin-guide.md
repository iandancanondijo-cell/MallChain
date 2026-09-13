# Admin guide

Covers the admin panel's real, currently-wired capabilities. Anything not
listed here that you might expect (e.g. an admin-facing "force logout this
user" button) doesn't exist yet — see the note at the bottom.

## Roles

`user` → `admin` → `superadmin`. Role changes and account deletion require
`superadmin` (`PUT /api/admin/users/:id/role`, `DELETE /api/admin/users/:id`)
— a plain `admin` can view and ban but not promote or permanently delete.

## User management
- **List/search users** — filter by role, ban status.
- **Ban/unban** (`PUT /api/admin/users/:id/ban`) — sets `banned: true` and
  blocks that account from every authenticated route immediately (not just
  admin routes — see the fix in `middleware/requireAuth.js`). Provide a
  `reason`; it's shown to the user.
- **Delete** (superadmin only) — removes the User document. This does
  **not** cascade-delete their KYC/messages/transactions/etc. — for a real
  GDPR erasure request, the user should use their own self-service
  `POST /api/gdpr/delete` instead (see `docs/compliance/gdpr.md`), which
  does the full cascade correctly.

## KYC review
- Pending submissions queue (`GET /api/admin/kyc/pending`).
- Approve/reject with notes — feeds `KYC.status` and the user's `kycLevel`.
- **Every view of a raw ID document is now audit-logged**
  (`kyc_document_viewed` in `AuditLog`, tagged `actorType: 'admin'` when
  it's not the account owner viewing their own — see `docs/compliance/gdpr.md`'s
  KYC section).

## Maintenance mode (kill-switch)
See `docs/runbooks/09-emergency-maintenance-mode.md` for the full
operational procedure. Short version: `POST /api/admin/maintenance`
(superadmin) to pause `global` or a specific scope
(send/withdraw/buy/payment/marketplace/staking/vault/key-vault/badge/dex);
every user sees a real, live banner reflecting it — this is not the old
per-browser fake toggle.

## Treasury / withdrawals
- **Withdrawal queue** — items in `pending_review` need a human to
  actually run the Safaricom payout. A withdrawal lands here either because
  `ENABLE_WITHDRAWAL_AUTO_PAYOUT` is off, or because it tripped a per-tx/
  daily cap (`MAX_PAYOUT_KES_PER_TX`/`MAX_PAYOUT_KES_PER_DAY` — see
  `docs/security/treasury-controls.md`) — the note on the withdrawal
  explains which.
- **Reconciliation** (`GET /api/admin/reconciliation/items`,
  `POST /api/admin/reconciliation/run`) — flags purchases where the on-chain
  MLCNS credit succeeded but the liquidity-pool add failed. Note:
  `compensateFailedLiquidity` does not yet perform a real on-chain reversal
  (tracked as a TODO in `services/reconciliationService.js`) — items land
  in `pending_manual` for a human to actually resolve.
- **Burn policies / dynamic thresholds** — configure what percentage of a
  cash-out gets burned vs. sent to treasury, by activity type and by supply
  level.
- **Badge grants** — manually issue a badge to a wallet address, or void a
  purchase.

## Audit log
`GET /api/admin/audit` — every admin action that matters (bans, role
changes, maintenance toggles, KYC decisions, badge voids, KYC document
views) writes here. This is the first place to check when reconstructing
what happened during an incident.

## What's NOT here yet (known gaps)
- No admin-facing "force logout this user's other sessions" button — banning
  blocks further actions but doesn't itself revoke an already-issued JWT
  (see `docs/runbooks/07-suspected-auth-compromise.md`).
- No UI for the treasury per-tx/daily caps themselves — they're
  environment-variable configured (`MAX_PAYOUT_KES_PER_TX`/
  `MAX_PAYOUT_KES_PER_DAY`), not adjustable from the panel.
- No real multi-party approval for treasury-signed transactions — see
  `docs/security/treasury-controls.md`.
