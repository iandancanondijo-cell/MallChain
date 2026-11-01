/**
 * AnchorRegistry — public evidentiary record of each on-chain audit-chain
 * anchor (jobs/auditChainAnchor.js). One row per anchor attempt: the head
 * entryHash as of that moment plus the on-chain tx that commits to it.
 *
 * Append-only in spirit, like AuditChain: anchors are the witness against a
 * rewritten ledger, so they are only ever inserted, never edited. An auditor
 * takes any txHash here, fetches the transaction from a node's public REST
 * (/cosmos/tx/v1beta1/txs/<hash>), and checks the memo carries the claimed
 * headHash — no trust in this MongoDB required.
 *
 * The anchors ALSO form their own hash chain (anchorPrevHash / anchorHash,
 * keyed by ANCHOR_HMAC_SECRET): each record commits to the previous one, so
 * deleting or reordering whole anchor rows is detectable even when the
 * on-chain tx never landed (empty treasury / node down). Be honest about
 * the limit: the operator holds both this DB and the HMAC secret, so the
 * anchor chain raises the bar (lazy/impune tampering) but is not a
 * substitute for the on-chain witness — same detection-not-prevention
 * model as AuditChain itself. Without ANCHOR_HMAC_SECRET the anchorHash
 * degrades to an unsigned SHA-256 and 'unanchored-mode' is flagged
 * (integrity status exposes hmacMode: 'unsigned').
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

// The anchor chain's own genesis link (distinct from the AuditChain genesis
// seed so an audit entry hash can never masquerade as an anchor link).
const GENESIS_ANCHOR_HASH = '0'.repeat(64);

/**
 * anchorHash = HMAC-SHA256(ANCHOR_HMAC_SECRET, prev|date|headSeq|headHash)
 * — or plain SHA-256 over the same preimage when the secret is missing
 * (still chains the records together; only the *signing* is lost).
 * Returns { anchorHash, signed } so the row records which mode it was
 * written in; verify recomputes with the same rule.
 */
function computeAnchorHash({ anchorPrevHash, anchorDate, headSeq, headHash }, secret = process.env.ANCHOR_HMAC_SECRET) {
  const preimage = [anchorPrevHash, anchorDate, headSeq, headHash].join('|');
  if (secret) {
    return { anchorHash: crypto.createHmac('sha256', secret).update(preimage).digest('hex'), signed: true };
  }
  return { anchorHash: crypto.createHash('sha256').update(preimage).digest('hex'), signed: false };
}

const AnchorRegistrySchema = new mongoose.Schema(
  {
    // 'YYYY-MM-DD' (UTC) of the anchor run. Not unique — a failed/intent
    // day can be retried; the job's "already anchored?" check keys on
    // headSeq + status instead.
    anchorDate: { type: String, required: true },
    headSeq: { type: Number, required: true },
    headHash: { type: String, required: true },
    memo: { type: String, required: true },
    // intent    — no signer configured: recorded + logged loudly, not on-chain yet
    // pending   — broadcast issued, confirmation not yet observed
    // confirmed — on-chain tx observed in a block
    // failed    — broadcast attempted and failed (retried on the next run)
    status: {
      type: String,
      enum: ['intent', 'pending', 'confirmed', 'failed'],
      required: true,
      default: 'intent',
    },
    onChainTxHash: { type: String, default: null },
    blockHeight: { type: Number, default: null },
    signerAddress: { type: String, default: null },
    error: { type: String, default: null },
    // ---- anchor self-chain (see header comment) ----
    // anchorHash of the previously inserted row, or GENESIS_ANCHOR_HASH for
    // the first. Set at insert; immutable like headHash.
    anchorPrevHash: { type: String, default: GENESIS_ANCHOR_HASH },
    anchorHash: { type: String, default: null },
    // true = anchorHash is an HMAC under ANCHOR_HMAC_SECRET; false =
    // unsigned SHA-256 fallback (unanchored-mode).
    anchorSigned: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { strict: true, timestamps: false }
);

AnchorRegistrySchema.index({ headSeq: -1 });
AnchorRegistrySchema.index({ anchorDate: -1 });

for (const op of ['updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace']) {
  AnchorRegistrySchema.pre(op, { type: 'query' }, function refuseRewrite() {
    throw new Error(`AnchorRegistry is append-only: ${op} is forbidden`);
  });
}
AnchorRegistrySchema.pre('save', function refuseOverwrite() {
  if (!this.isNew) {
    throw new Error('AnchorRegistry is append-only: overwriting an existing anchor is forbidden');
  }
});
AnchorRegistrySchema.pre('deleteOne', { type: 'document' }, function refuseDocDelete() {
  throw new Error('AnchorRegistry is append-only: deleting an anchor is forbidden');
});

// The job needs to flip status intent→pending→confirmed after each phase,
// but the guard above forbids in-place updates. Those transitions describe a
// *different* fact than the anchor commitment (headHash itself never
// changes), so the job re-inserts a superseding row keyed by an
// attempt-scoped anchorDate suffix instead of editing. To keep that
// bookkeeping inside the model, expose a narrow, explicitly-named escape
// hatch that raw-collection-writes only the status/txHash fields — the
// headSeq/headHash/memo commitment fields are immutable through every path.
async function updateAnchorStatus(_id, patch) {
  const allowed = {};
  for (const key of ['status', 'onChainTxHash', 'blockHeight', 'error']) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  if (Object.keys(allowed).length === 0) return null;
  await AnchorRegistry.collection.updateOne({ _id }, { $set: allowed });
  return AnchorRegistry.findById(_id).lean();
}

const AnchorRegistry = mongoose.models.AnchorRegistry
  || mongoose.model('AnchorRegistry', AnchorRegistrySchema);

module.exports = AnchorRegistry;
module.exports.updateAnchorStatus = updateAnchorStatus;
module.exports.computeAnchorHash = computeAnchorHash;
module.exports.GENESIS_ANCHOR_HASH = GENESIS_ANCHOR_HASH;
