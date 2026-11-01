# Tamper Protection — the Audit Chain (honest threat model)

## The question this answers

"Can we lock even the owner of Mallchain out from tampering with the chain's
data?"

**No — not with today's topology — and any system that claims otherwise is
lying to you.** Backend and MongoDB run on one machine under one operator.
That operator holds root: they can edit data below the application with
`mongosh`, swap the disk, or rewrite the binary. Cryptography cannot *stop*
someone who owns the machine. What this feature does instead is make
tampering **detectable and forensic**: any edit, deletion or reordering of
audit history breaks a hash chain, and the daily publication of the chain's
head onto the Mallchain means even a fully rewritten, internally consistent
database is contradicted by a public record the operator does not control.

## What was built

| Piece | File | Guarantees |
|---|---|---|
| Hash-chained audit ledger | `backend/src/models/AuditChain.js` | Every entry's `entryHash = sha256(seq|ts|actor|action|target|payloadHash|prevHash)`. Genesis links to `sha256("MALLCHAIN-AUDIT-V1")`. Payloads are hashed, never stored — no PII leaks from the ledger. Mongoose-level update/delete on this collection throw (append-only at the application layer). |
| Write path | `backend/src/services/auditChainService.js` | `appendAuditEvent()` is serialized (module queue) and **non-fatal** — an audit failure logs at error level and never breaks the user flow. `exportHead()` returns `{seq, entryHash, ts}` for anchoring. |
| Verification | `backend/src/services/auditChainVerify.js` | Recomputes the WHOLE chain from genesis (a partial verify proves nothing), reports the first divergence (broken link, mutated field, seq gap), cross-checks every anchor against the ledger today, and verifies the anchor rows' own HMAC chain. |
| On-chain anchors | `backend/src/jobs/auditChainAnchor.js` | Daily 00:15 UTC: broadcasts a memo-tx to the chain (`CHAIN_RPC`) whose memo is `mallchain-audit-anchor:v1 seq=<n> hash=<hex>`. Tolerates zero treasury balance / fee failures: the attempt is persisted (status `intent`/`pending`/`failed`) regardless, and anchor rows chain to each other (`anchorPrevHash`/`anchorHash`, HMAC under `ANCHOR_HMAC_SECRET`) so the witness sequence is itself tamper-evident even when nothing reaches the block. |
| Mutation hooks | `routes/adminPanel.js` (`chainAudit`), `routes/settings.js`, `routes/security.js`, `routes/mines.js` (manual credit/deduct), `routes/withdraw.js`, `routes/mallpoints.js` (conversion settlement) | Every privileged action appends `admin_*` (or `settings_*` / `mallpoints_conversion_settled`) entries with actor id+role, target and a digest of what changed. |
| Superadmin surfaces | `GET /api/admin/audit-chain`, `GET /api/admin/audit-chain/verify`, `GET /api/admin/integrity/status`, `POST /api/admin/integrity/verify` | Chain browsing + one-click full verification; the Integrity section of the Platform window renders these. `unanchored-mode` is reported when `ANCHOR_HMAC_SECRET` is missing or no anchor has ever confirmed. |

## What this proves

1. **Internal consistency** — any Mongoose-level or field-level rewrite of
   audit history is found by recompute, with the exact first-divergent seq.
2. **External witness** — once an anchor tx is in a block, every full node
   publicly records "as of height H the audit head was hash X". A fabricated
   chain cannot match that witness. Independent auditors need only the
   txHash (`/cosmos/tx/v1beta1/txs/<hash>`) — no trust in this MongoDB.
3. **Accountability** — each entry names actor id/role, action, target, and
   a digest of the change, from the moment the action succeeded.

## What this cannot prevent (residual trust model)

- The operator with root can **delete the whole chain and the anchor
  registry** and start a new one. Mitigation: anchors older than the wipe
  remain on-chain forever — an unexplained "chain restart" is itself the
  evidence. Mitigation still planned: replicate the ledger to a second
  machine.
- The operator can **stop appending** (disable the hook in code). The
  absence of expected events, plus the counter/seq jump at the next
  restart, is detectable but not blocked.
- **`ANCHOR_HMAC_SECRET` is held by the same operator**, so the anchor
  self-chain is detection-grade only; the *on-chain* memo is the part
  nobody can silently rewrite. Until an anchor confirms on-chain, the
  status page says `unanchored-mode` — treat that mode as degraded, not
  normal.
- Timestamps come from the same (unsynchronised) machine.
- Multi-process/multi-instance backends would need a shared compare-and-set
  seq writer (currently a module-level queue + unique `seq` index backstop).

## Roadmap to actual prevention

1. **Multi-validator anchoring set** — have independent operators (or a
   hosted second service) verify + re-broadcast the daily head; a quorum
   signature makes rewriting the ledger require colluding outside the one
   machine. This is the real answer to "lock the owner out".
2. **Separate audit writer** — a second process/box holding only
   append permissions to a replica the app's admin cannot mutate.
3. External timestamping (RFC-3161 or a second public chain) for anchors.

Until (1) exists, the honest sentence is: **tampering by the owner is
detectable, provable after the fact, and publicly witnessed once anchors
confirm — but it is not prevented.**
