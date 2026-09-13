# Treasury signing and payout controls

## How treasury signing works today

Every on-chain treasury-controlled operation — badge issuance
(`services/badgeTxBuilder.js`), burns (`services/burnTxBuilder.js` via
`services/sellBurnService.js`), and liquidity pool add/remove
(`services/dexTxBuilder.js`) — signs with a single raw `OPERATOR_MNEMONIC`
environment variable, read directly at each call site. This is a genuine
single point of failure: whoever has that mnemonic (or compromises the
process holding it in memory) can unilaterally sign any of these operations.

Two separate "treasury mnemonic" abstractions already exist in this
codebase — `utils/keyManager.js` (Vault-backed, with a `TEST_MODE` env-var
fallback) and `utils/keystore.js` (a differently-shaped variant) — but
**neither is actually used by any of the real signing call sites above**;
both are effectively dead code today, only exercised by their own tests.
Wiring the real payout paths through Vault-backed signing (so the mnemonic
never lives in this process's environment at all) is a prerequisite for any
real improvement here and is tracked separately from this document.

## What's implemented: per-tx / daily payout caps (SEC3)

`services/treasuryLimitsService.js`, wired into
`services/b2cPayoutService.js`'s `initiateB2CPayout` (the single choke
point both `routes/withdraw.js` and `routes/buy.js`'s `/sell` call through):

- `MAX_PAYOUT_KES_PER_TX` — a single B2C payout above this is held rather
  than sent to Safaricom at all.
- `MAX_PAYOUT_KES_PER_DAY` — a payout that would push the day's cumulative
  total (tracked in `models/TreasuryDailyPayout.js`, one doc per UTC day)
  over this is held the same way.

A held payout does **not** fail the underlying sale/withdrawal — the sale
and any on-chain burn have already completed by this point — it sets
`WithdrawalRequest.status = 'pending_review'` with a note explaining why, so
an admin can complete the Safaricom payout manually once they've verified it.

Both caps are **opt-in**: unset means no limit at all, identical to
behavior before this existed. There's no universally safe default figure —
see `.env.example`'s `MAX_PAYOUT_KES_PER_TX`/`MAX_PAYOUT_KES_PER_DAY` entries.
`treasuryLimitsService.warnIfUnconfigured()` (called at backend startup)
logs a warning if `ENABLE_WITHDRAWAL_AUTO_PAYOUT` is on but either cap is
unset in production.

## What's NOT implemented: real multi-party approval

**This is a genuine gap this pass does not close**, and can't be closed
with code alone: a real quorum/multi-sig requires actual independent key
holders — real humans, each with their own key material, agreeing to a
threshold signing ceremony. That's an operational/organizational decision
(who holds a key share, how many of them must agree, how a
signing session actually happens) that has to be made by the people running
this system, not invented here.

Two real paths exist once that decision is made:

1. **Cosmos SDK native multisig account** — replace the single operator
   account with a `multisig` pubkey (N public keys, K-of-N threshold).
   Every one of the transaction builders above would need to move from
   "sign and broadcast immediately" to "build an unsigned tx → collect K
   signatures from separate signers → combine → broadcast," which is a
   real workflow/UI change, not a config flag.
2. **A lighter application-level two-person rule** — a second admin
   approves a pending treasury action before the (still single-key) backend
   actually signs and broadcasts it. Cheaper to build than real multisig,
   but the underlying key is still one point of failure if compromised
   directly (an attacker with the mnemonic doesn't need the approval flow at
   all — this only raises the bar for a compromised *admin session*, not a
   compromised *key*).

The caps above (SEC3) are a real, immediate risk-reduction step available
without either of those — they bound the blast radius of a single signing
event or a single bad day, which is meaningfully better than no ceiling at
all, but they are not multi-party approval and should not be presented as
such.
