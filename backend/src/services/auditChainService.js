/**
 * auditChainService — the single write path into the tamper-evident audit
 * ledger (models/AuditChain.js).
 *
 * Two properties this module is responsible for, and neither may ever be
 * traded away:
 *
 *  1. NON-FATAL: an audit append must never break or fail the user-facing
 *     flow it is observing. If the DB is down, the chain write is dropped,
 *     logged loudly at error level, and the request continues. (A dropped
 *     event is an auditable gap — the seq counter and log make it visible —
 *     whereas a chain that gates traffic would get disabled under pressure,
 *     which is worse.)
 *
 *  2. SERIALIZED: appends go through a module-level promise queue, so two
 *     concurrent privileged actions can never both read the same head and
 *     race to extend it — prevHash is always the actual current tip. The
 *     unique index on seq is the backstop if the queue is ever bypassed.
 *
 * Payload contents are hashed, never stored (canonical-JSON sha256 in the
 * model) — so callers may pass ids/amounts that would be PII in plaintext
 * without the ledger itself leaking anything.
 */
const AuditChain = require('../models/AuditChain');
const logger = require('../utils/logger');
const { computePayloadHash, computeEntryHash, GENESIS_PREV_HASH } = AuditChain;
// Module-level promise queue. Every append chains onto `queueTail`, so the
// DB read-head → compute → insert sequence is strictly serialised within
// this process. (Cross-process safety relies on the unique seq index +
// single backend instance; multi-instance deployments should move appends
// behind the one writer or use a compare-and-set on seq — see
// docs/TAMPER_PROTECTION.md, "Limits".)
let queueTail = Promise.resolve();

function normalizeActor(actor) {
  if (!actor) return { id: 'system', role: 'system' };
  if (typeof actor === 'string') return { id: actor, role: 'unknown' };
  const id = actor.id || actor._id || null;
  const role = actor.role || 'unknown';
  return { id: String(id == null ? 'unknown' : id), role: String(role) };
}

async function appendAuditEventRaw(actor, action, target, payload) {
  const head = await AuditChain.findOne().sort({ seq: -1 }).lean();
  const prevHash = head ? head.entryHash : GENESIS_PREV_HASH;
  const seq = head ? head.seq + 1 : 0;
  const ts = new Date();
  const actorDoc = normalizeActor(actor);
  const targetStr = target == null ? '' : String(target);
  const payloadHash = computePayloadHash(payload);
  const entryHash = computeEntryHash({ seq, ts, actor: actorDoc, action, target: targetStr, payloadHash, prevHash });

  return AuditChain.create({
    seq, ts, actor: actorDoc, action, target: targetStr, payloadHash, prevHash, entryHash,
  });
}

/**
 * appendAuditEvent(actor, action, target, payload) → Promise<AuditChain entry | null>
 *
 * Never rejects. Resolves with the created entry, or null if the append
 * failed (logged at error level). `actor` is {id, role} (or a string id;
 * or falsy for system). Awaiting is optional — the queue serialises
 * regardless — but awaiting keeps ordering observable to the caller.
 */
async function appendAuditEvent(actor, action, target, payload) {
  // Fast bail when no DB connection exists at all (test suites that mount
  // routes without connecting Mongoose, startup races): attempting the
  // append would sit in Mongoose's command buffer for 10s per call before
  // its own timeout, which turns "non-fatal logging" into 10 seconds of
  // latency on every privileged request. A skipped append is logged, not
  // silently swallowed.
  if (mongooseReadyState() !== 1) {
    logger.warn('auditChain', 'append skipped — no MongoDB connection (event NOT recorded in chain)', { action, target: String(target ?? '') });
    return null;
  }

  const task = queueTail.then(
    () => appendAuditEventRaw(actor, action, target, payload),
    () => appendAuditEventRaw(actor, action, target, payload)
  );

  // Keep the tail un-rejected so one failure can't poison every later
  // append queued behind it.
  queueTail = task.then(() => undefined, () => undefined);

  try {
    return await task;
  } catch (err) {
    logger.error('auditChain', 'AUDIT APPEND FAILED — chain has a gap at the intended next seq', err, {
      action,
      target: String(target ?? ''),
    });
    return null;
  }
}

function mongooseReadyState() {
  try {
    // Lazy require so this module stays loadable in unit tests that mock
    // the model away (badgeSnapshot-style suites that never touch Mongoose).
    return require('mongoose').connection.readyState;
  } catch {
    return 0;
  }
}

/**
 * exportHead() → { seq, entryHash, ts } of the current chain tip, or
 * { seq: -1, entryHash: GENESIS_PREV_HASH, ts: null } for an empty chain
 * (the genesis prevHash doubles as the genesis "head" so anchors of a fresh
 * deployment still commit to something well-defined). Used by
 * jobs/auditChainAnchor.js and the GET /api/admin/integrity/status endpoint.
 */
async function exportHead() {
  const head = await AuditChain.findOne().sort({ seq: -1 }).lean();
  if (!head) return { seq: -1, entryHash: GENESIS_PREV_HASH, ts: null };
  return { seq: head.seq, entryHash: head.entryHash, ts: head.ts };
}

module.exports = { appendAuditEvent, normalizeActor, exportHead };
