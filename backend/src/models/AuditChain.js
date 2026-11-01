/**
 * AuditChain — the tamper-evident, hash-chained audit ledger.
 *
 * Every entry commits to every entry before it: entryHash covers the entry's
 * own fields AND prevHash (the previous entry's entryHash), so rewriting,
 * reordering, or deleting ANY historical entry changes every hash after it
 * and is detectable by recompute (services/auditChainVerify.js). Daily head
 * hashes are anchored on-chain (jobs/auditChainAnchor.js) so even a
 * "consistent-looking" rewritten chain — one a raw DBA with mongosh could
 * fabricate — is contradicted by a public on-chain record. See
 * docs/TAMPER_PROTECTION.md for the exact guarantees and their limits.
 *
 * Append-only by construction:
 *  - no PII is ever stored — only sha256 of the canonical JSON payload;
 *  - every mutating query (update / delete / replaceOne family, incl.
 *    findOneAndUpdate) throws at the Mongoose layer; legitimate history is
 *    never edited —
 *    correcting an event means appending a new one;
 *  - `seq` is unique, so a racing duplicate-seq append fails hard rather
 *    than silently forking the chain (auditChainService serializes appends
 *    to avoid ever hitting this in practice).
 * Raw-collection writes bypass the middleware guard — that is exactly the
 * DBA threat model anchoring (not the schema) defends against.
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

// Domain-seeded so no historical entryHash can ever collide with an
// "ordinary" hash of any other structure the app computes.
const GENESIS_SEED = 'MALLCHAIN-AUDIT-V1';
const GENESIS_PREV_HASH = sha256Hex(GENESIS_SEED);

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic JSON: object keys sorted recursively at every depth, so
 * {a:1,b:2} and {b:2,a:1} hash identically. undefined values are dropped
 * (JSON.stringify semantics); non-JSON-safe payloads fall back to String().
 */
function canonicalJson(value) {
  return JSON.stringify(sortValue(value));

  function sortValue(v) {
    if (v === undefined) return undefined;
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(sortValue);
    // Date instances survive as ISO strings via JSON.stringify downstream;
    // normalise explicitly so hashing is stable regardless of caller.
    if (v instanceof Date) return v.toISOString();
    const out = {};
    for (const key of Object.keys(v).sort()) {
      const sorted = sortValue(v[key]);
      if (sorted !== undefined) out[key] = sorted;
    }
    return out;
  }
}

function computePayloadHash(payload) {
  return sha256Hex(canonicalJson(payload === undefined ? {} : payload));
}

/**
 * entryHash = sha256(seq|ts|actorId|actorRole|action|target|payloadHash|prevHash)
 * ts is normalised to ISO so a stored-and-reloaded Date hashes identically.
 */
function computeEntryHash({ seq, ts, actor, action, target, payloadHash, prevHash }) {
  const tsIso = (ts instanceof Date ? ts : new Date(ts)).toISOString();
  return sha256Hex([
    seq, tsIso, actor.id, actor.role, action, target, payloadHash, prevHash,
  ].join('|'));
}

const AuditChainSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, unique: true },
    ts: { type: Date, required: true },
    actor: {
      id: { type: String, required: true },
      role: { type: String, required: true },
    },
    action: { type: String, required: true },
    target: { type: String, required: true, default: '' },
    payloadHash: { type: String, required: true },
    prevHash: { type: String, required: true },
    entryHash: { type: String, required: true },
  },
  // strict (default) rejects unknown fields; no timestamps — ts is
  // hash-covered and set by the service, not mutated by Mongoose.
  { strict: true, timestamps: false }
);

AuditChainSchema.index({ action: 1, seq: -1 });
AuditChainSchema.index({ 'actor.id': 1, seq: -1 });

// ============ APPEND-ONLY GUARD ============
// Any Mongoose-level mutation other than insert is refused. This stops the
// application itself (bugs, future routes copy-pasted from elsewhere) from
// rewriting history; it is NOT a defence against someone with mongosh —
// that is what the on-chain anchors are for (see docs/TAMPER_PROTECTION.md).
const QUERY_MUTATION_OPS = [
  'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
];
for (const op of QUERY_MUTATION_OPS) {
  // { type: 'query' } is required for deleteOne/deleteMany — without it
  // Mongoose treats those registrations as *document* middleware and
  // Model.deleteOne() would sail straight through the guard.
  // (Mongoose 9 middleware has no `next` callback — throw directly.)
  AuditChainSchema.pre(op, { type: 'query' }, function refuseTampering() {
    throw new Error(`AuditChain is append-only: ${op} is forbidden (correcting history means appending a new entry)`);
  });
}

// doc.deleteOne() / doc.save() on a loaded entry are refused the same way;
// only brand-new documents (isNew) may be saved.
AuditChainSchema.pre('save', function refuseOverwrite() {
  if (!this.isNew) {
    throw new Error('AuditChain is append-only: mutating an existing entry from the document side is forbidden');
  }
});
AuditChainSchema.pre('deleteOne', { type: 'document' }, function refuseDocDelete() {
  throw new Error('AuditChain is append-only: deleting an existing entry is forbidden');
});

const AuditChain = mongoose.models.AuditChain
  || mongoose.model('AuditChain', AuditChainSchema);

module.exports = AuditChain;
module.exports.GENESIS_PREV_HASH = GENESIS_PREV_HASH;
module.exports.GENESIS_SEED = GENESIS_SEED;
module.exports.sha256Hex = sha256Hex;
module.exports.canonicalJson = canonicalJson;
module.exports.computePayloadHash = computePayloadHash;
module.exports.computeEntryHash = computeEntryHash;
