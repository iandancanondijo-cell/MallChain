# Disaster recovery plan (DR1)

## Scope

Three independent stateful systems, each with its own recovery path:

| System | Backup mechanism | Restore mechanism |
|---|---|---|
| MongoDB (users, KYC, transactions, everything off-chain) | `scripts/backup.sh` (`mongodump`, optionally GPG-encrypted, optionally shipped offsite) | `scripts/restore.sh` |
| Chain data (`blockchain_working/`, all on-chain state incl. x/vault) | Same `scripts/backup.sh` run, tarball of the data dir | Same `scripts/restore.sh` |
| Redis (JWT denylist, rate-limit counters, payment-callback DLQ) | **Not backed up** — see below | N/A |

## RTO / RPO targets

**These are proposed starting points, not yet a signed-off SLA** — the real
targets are a business decision (how much data loss and downtime is
tolerable) that should be confirmed with whoever owns that call before this
doc is treated as a commitment.

| System | RPO (max data loss) | RTO (max time to restore) |
|---|---|---|
| MongoDB | Time since last backup — see the restore-drill cadence (weekly, `.github/workflows/restore-drill.yml`); run `scripts/backup.sh` more often than weekly for a tighter RPO than that | Under 1 hour for `scripts/restore.sh` itself on a reasonably-sized dataset; add time for provisioning a replacement Mongo instance if the original host itself is lost |
| Chain data | Same as Mongo — backups are taken together in one `scripts/backup.sh` run | Same restore mechanics, but a chain node replaying/re-syncing after restore takes additional real time proportional to chain height — budget for this separately from the file restore itself |
| Redis | N/A (see below) | Immediate — a fresh empty Redis is a **safe**, not a degraded, starting state |

## Why Redis has no backup and that's intentional

Every real use of Redis in this backend (`middleware/tokenDenylist.js`,
rate limiting, `mallwallet/queue/paymentCallbackQueue.js`) is designed to
**fail open** if Redis is unreachable or empty — losing it does not corrupt
anything, it just means:
- Every previously-revoked JWT becomes valid again until it naturally
  expires (see `middleware/tokenDenylist.js`) — bounded by JWT expiry, not
  unbounded.
- Rate limits reset (temporary, self-healing).
- Any M-Pesa/payout callback that hadn't yet been retried from the DLQ is
  lost — but the underlying `WithdrawalRequest`/`MallcoinPurchase`
  documents in MongoDB (which ARE backed up) still exist and can be
  reconciled manually.

Losing Redis is an availability/security-hygiene concern (see the
JWT-denylist implication above — worth knowing about), not a data-loss
disaster requiring its own backup pipeline.

## Recovery procedure (full outage)

1. Provision replacement infrastructure (managed Mongo, Redis, compute — see
   `infra/terraform/`, an account/provisioning decision, not automatable
   here).
2. Restore MongoDB: `./scripts/restore.sh <backup-name> --yes` against the
   new Mongo instance (`MONGO_URI` env var pointed at it).
3. Restore chain data the same way, onto a fresh `marketplaced` node; let it
   catch up if any blocks were produced after the backup was taken (only
   possible if the node was still partially live — a full restore from a
   backup taken while stopped has no gap to catch up on).
4. Redis: start empty — no restore step.
5. Bring the backend up pointed at the restored Mongo + fresh Redis + the
   chain node; run `scripts/smoke-test.sh` against it before considering the
   incident resolved.
6. Follow `docs/runbooks/post-incident-review-template.md` afterward.

## Explicitly out of scope here (see other docs)

- Validator key loss/compromise — `docs/disaster-recovery/validator-key-backup.md`.
- A specific incident's step-by-step response — `docs/runbooks/`.
- Treasury operator-key compromise — `docs/security/treasury-controls.md`.
