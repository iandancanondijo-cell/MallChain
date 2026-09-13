# GDPR data-subject rights

Implemented in `backend/src/services/gdprService.js`, exposed at
`GET /api/gdpr/export` and `POST /api/gdpr/delete` (`backend/src/routes/gdpr.js`),
both self-service and requiring the requester's own auth session — there is
no admin-triggered erasure endpoint; the existing `DELETE /api/admin/users/:id`
(`routes/adminPanel.js`) is a separate, unrelated ban/removal action and does
not cascade into any of the models below.

## The core tension: erasure vs. AML/KYC retention

GDPR Article 17 (right to erasure) has a built-in exception at 17(3)(b): it
doesn't apply where processing is necessary for compliance with a legal
obligation. AML/KYC regulations (in Kenya, CBK/FRC guidance; most
jurisdictions have an equivalent) generally require retaining that a
screening happened, its outcome, and the underlying transaction records for
a period after an account closes. That means an erasure request can't just
hard-delete everything — direct PII must go, but the compliance record of
*that a decision was made* has to survive.

**The exact retention period is a legal/policy decision, not a code
decision** — this implementation redacts identity fields immediately but
does not auto-purge the resulting redacted records after N days, because N
hasn't been decided. `KYC.erasedAt` and the redacted-in-place records are
there for a future scheduled purge job once that number exists; building the
purge mechanism without knowing the real target risks encoding a wrong
number as if it were authoritative.

## Per-model treatment

| Model | On erasure |
|---|---|
| User | Anonymized in place (email replaced with a unique `erased-<id>@erased.mallchain.local`, password/googleId/name/username/phone/walletAddress cleared, `banned: true` forced, `erasedAt` set) — **not deleted**, to avoid orphaning every `ref: 'User'` elsewhere (KYC.reviewedBy, other users' `referredBy`, AuditLog history) |
| Notification, UserSettings, ApiKey, Contract | Hard-deleted — no compliance reason to keep these |
| KYC | Identity fields redacted (name/DOB/address/ID number/document/AML raw payload); `status`/`riskLevel`/dates/`userId` kept, `erasedAt` set |
| Message | `text` replaced with a tombstone string; the message row itself stays (deleting it would also remove it from the other participant's conversation history) |
| BadgePurchase, MallcoinPurchase, WithdrawalRequest, LiquidityPoolActivity | `phone` redacted; everything else (walletAddress, amounts, status, txHash) kept for reconciliation/audit |
| MallcoinSale | Same, keyed by `sellerAddress`/`phone` |
| B2CPayout | `sellerPhone` redacted; `sellerAddress` kept |
| WalletTransaction, Transaction, ValidatorApplication, BadgeIssuance, LiquidityReconciliation, IdempotencyKey, MallPointAccount, PendingPayment, Invite | Untouched — no direct PII beyond a `userId`/wallet-address reference, which is either pseudonymous (a chain address) or now points at an anonymized User doc |
| AuditLog | Untouched — including the entry the erasure itself writes (`action: 'gdpr_erasure'`), since a compliance record of *having erased* something is not itself the data that needed erasing |

`walletAddress` is deliberately kept on financial/audit records rather than
redacted like `phone` — on a public blockchain it's already pseudonymous and
publicly visible on-chain, unlike a phone number, and reconciliation
(`services/reconciliationService.js`) depends on it to match records across
models.

## Known gap: `TaskSubmission` / `MinesReviewer`

`TaskSubmission.miner_id`, `MinesReviewer.validator_id`, and
`TaskSubmission.assigned_validators` use a `Mixed` type that holds either a
Mongo `_id` or a wallet address depending on the call site, inconsistently.
Automated erasure deliberately does not touch these two models — matching on
a `Mixed` field correctly needs more certainty about which representation is
in use at each record than the schema itself guarantees, and getting it
wrong risks either missing PII or corrupting unrelated mining/review state.
`MinesReviewer.email` (a denormalized copy) is part of this same gap. This
needs a manual, model-specific migration before it can be folded into
`gdprService.js` — tracked here rather than silently handled or silently
skipped.

## KYC document access

Every view of a raw identity document (`GET /api/kyc/document/:kycId`) is now
audit-logged (`AuditLog`, action `kyc_document_viewed`) — who viewed it,
whether it was the account owner or an admin viewing someone else's, and
which KYC record (`backend/src/controllers/kycController.js`). Previously
this endpoint had no audit trail at all, despite admins being able to view
any user's document.

**Not implemented: a redaction pipeline for the document image itself**
(e.g. masking all but the last few digits of an ID number before display to
anyone other than compliance staff). That needs real image-processing work
(locating and masking a region of a photographed ID document reliably) and
a decision on who counts as "compliance staff" vs. a regular admin — both
better scoped as their own effort than rushed alongside the audit logging
above. Tracked here as a known gap, not silently dropped.

## Password re-confirmation

`POST /api/gdpr/delete` requires the account's current password for
password-based accounts (same bar as changing a password), since erasure is
irreversible. Google-only accounts (no `password` set) skip that check —
there's nothing to confirm against, matching how those accounts already
authenticate everywhere else.
