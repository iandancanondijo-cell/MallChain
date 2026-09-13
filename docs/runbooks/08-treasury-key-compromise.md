# Runbook: Suspected treasury operator-key compromise

Use when there's reason to believe `OPERATOR_MNEMONIC` has leaked (exposed
in a log, committed to a repo, a compromised host that had it in env/memory).

**Read `docs/security/treasury-controls.md` first** — every on-chain
treasury operation (badge issuance, burns, liquidity add/remove) signs with
this single key today; there is no multi-sig/quorum requirement standing
between a leaked key and an attacker moving funds.

## Immediate containment
1. **Enable global maintenance mode** (`docs/runbooks/09-emergency-maintenance-mode.md`)
   for at minimum `badge`, `dex`, and anywhere burns are triggered — this
   stops the BACKEND from initiating new treasury-signed transactions,
   but does **not** stop the attacker from broadcasting their own
   transactions directly against the chain using the leaked key. Maintenance
   mode is not a substitute for rotating the key.
2. **Rotate `OPERATOR_MNEMONIC`** — generate a new key, fund/authorize it
   for whatever the operator account needs to do on-chain, update the
   secret in every environment that has it (`infra/k8s/01-secrets.example.yaml`'s
   shape, or wherever it's actually stored — Vault, if `utils/keyManager.js`
   has been wired in for this key, which it currently is not — see the
   treasury-controls doc's "dead code" note).
3. Redeploy every service holding the old key so it's actually gone from
   running process memory, not just the secret store.

## Investigate
- Check on-chain history for the operator address for any transaction the
  backend didn't itself initiate — cross-reference against
  `TreasuryLedger`/`AuditLog`/`BadgeIssuance` records: anything on-chain
  with no corresponding backend record is the compromise's actual blast
  radius.
- Check how the key leaked (log line? env var exposed via an error
  response? committed to git?) — that path needs closing regardless of
  the rotation above.

## Follow-up
- File `docs/runbooks/post-incident-review-template.md`.
- If this incident is the reason multi-party approval finally gets built,
  that's the right lesson to draw — see treasury-controls.md's two real
  paths (native multisig vs. a lighter two-person rule).
