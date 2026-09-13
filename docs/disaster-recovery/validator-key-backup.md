# Validator key backup (DR4)

## What's actually at risk

A CometBFT validator has two files that matter, both under
`blockchain_working/config/` (or wherever `--home` points):

- `priv_validator_key.json` — the validator's consensus signing key. Losing
  it permanently = that validator can never sign blocks again (liveness
  loss for that validator, not a chain-wide problem if others are healthy).
  **Two validators signing with the same key at the same height is a
  slashable double-sign** — this is why "just keep 5 copies on 5 laptops"
  is actively dangerous, not just sloppy: every copy is a live signer unless
  something ensures only one is ever running at a time.
- `priv_validator_state.json` — the last height/round signed. This is NOT
  something to restore from an old backup while the key is still running
  elsewhere: restoring a stale state file next to a live key risks
  double-signing at a height already signed. Treat this file as
  disposable/regenerable state, not something to back up at all — it's
  mentioned here only so it's not confused with the key material above.

## The real fix is a remote signer, not a backup script

The industry-standard answer to "how do I protect a validator key without
creating a double-sign risk from having multiple copies" is a **remote
signer with its own double-sign protection** — e.g.
[TMKMS](https://github.com/iqlusioninc/tmkms) or a HashiCorp Vault-backed
signing plugin. The signer holds the key (in an HSM or Vault, ideally),
tracks signed heights itself, and refuses to sign anything at a
height/round it's already signed for — which is what actually prevents the
"leaked backup copy risk" instead of just hiding it.

This is a real integration project (standing up TMKMS or a Vault transit
signing setup, pointing `marketplaced` at it instead of a local key file) —
**tracked as a gap here, not implemented in this pass.** This backend
already uses Vault for treasury signing (`utils/keyManager.js` — see
`docs/security/treasury-controls.md`), which makes Vault the natural choice
to extend to validator signing too, rather than introducing a second
signing infrastructure.

## Cold backup, if you need one today

Until a remote signer is in place, a validator key still needs *some*
recoverable backup (a lost laptop with no other copy is 100% liveness loss
with no path back). The safe way to do that without creating a live
double-sign risk:

1. **Encrypt, then split, never distribute a working plaintext copy.**
   HashiCorp Vault's own unseal mechanism already implements Shamir secret
   sharing — if the key is stored as a Vault secret (recommended, matching
   the treasury-signing pattern already in use), Vault's existing K-of-N
   unseal-key custody model already gives you this without a separate tool.
2. **If not using Vault for this key yet:** encrypt
   `priv_validator_key.json` with GPG to multiple trusted recipients
   (`gpg --encrypt --recipient A --recipient B --recipient C
   priv_validator_key.json`) and store the encrypted blob somewhere durable
   (offsite, matching `scripts/backup.sh`'s `BACKUP_OFFSITE_URI`/
   `BACKUP_GPG_RECIPIENT` pattern) — anyone with only their own private key
   still cannot decrypt it alone if a real K-of-N split is required instead
   of simple multi-recipient encryption (multi-recipient GPG lets ANY one
   recipient decrypt independently — that's multi-*access*, not a quorum;
   for an actual K-of-N *threshold*, split the file with a dedicated tool
   such as `ssss` (`ssss-split -t <K> -n <N>`) before encrypting each share).
3. **Never restore this backup next to a currently-running validator using
   the original key** — a restore is for standing up a *replacement* for a
   permanently-lost key, not for running two copies at once.

## What this pass does NOT do

- Does not implement Shamir splitting in code — no cryptographic
  key-splitting logic was added to this repo. The commands above use
  existing, independently-audited tools (GPG, `ssss`, Vault) rather than a
  custom implementation, which is the right call for key-splitting code
  specifically — this is exactly the kind of primitive not to hand-roll.
- Does not decide who the trusted co-holders of a key share should be —
  that's an organizational/trust decision for whoever operates the
  validator, not something this document can make.
- Does not stand up TMKMS or Vault transit signing — flagged above as the
  real fix, left as a tracked follow-up.
