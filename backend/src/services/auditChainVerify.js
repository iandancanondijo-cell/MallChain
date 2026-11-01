/**
 * auditChainVerify — recompute-and-compare integrity check for the
 * tamper-evident audit ledger.
 *
 * Always walks the WHOLE chain from genesis (a partial verify proves
 * nothing about the unverified prefix), and reports the first divergence:
 * a broken hash link, a mutated field, or a deleted/inserted entry (seq
 * gap). Stored payloads are hashes only, so per-entry verification checks
 * that each entry's own fields still produce its entryHash — rewriting any
 * field (or substituting a different payloadHash) breaks that equation.
 *
 * Then cross-checks every AnchorRegistry record: an anchor whose headHash
 * no longer matches the chain at that seq means the DB was rewritten —
 * even a fully self-consistent fabricated chain is contradicted by the
 * public on-chain witness. This is the layer a raw mongosh rewrite cannot
 * erase (see docs/TAMPER_PROTECTION.md).
 */
const AuditChain = require('../models/AuditChain');
const AnchorRegistry = require('../models/AnchorRegistry');
const { computeEntryHash, GENESIS_PREV_HASH } = AuditChain;
const { computeAnchorHash, GENESIS_ANCHOR_HASH } = AnchorRegistry;

/**
 * Walk the anchor rows in insertion order and check their self-chain:
 * every anchorHash must recompute from (anchorPrevHash|date|headSeq|headHash)
 * and anchorPrevHash must equal the previous row's anchorHash. Rows written
 * while ANCHOR_HMAC_SECRET was set recompute as HMAC; rows written in
 * unsigned mode recompute as plain SHA-256. Returns null when the chain is
 * intact, else the first broken row's info.
 */
async function verifyAnchorChain() {
  const rows = await AnchorRegistry.find().sort({ _id: 1 }).lean();
  let expectedPrev = GENESIS_ANCHOR_HASH;
  let unlinked = 0;
  for (const row of rows) {
    // Rows written before anchor chaining existed (or by the job's
    // chaining-failure fallback) carry no anchorHash — they cannot prove
    // anything, so they neither pass nor fail: counted, then the walk
    // re-syncs on their own anchorPrevHash.
    if (row.anchorHash == null) {
      unlinked += 1;
      expectedPrev = row.anchorPrevHash || GENESIS_ANCHOR_HASH;
      continue;
    }
    const prevOk = (row.anchorPrevHash || GENESIS_ANCHOR_HASH) === expectedPrev;
    let hashOk;
    if (row.anchorSigned) {
      if (!process.env.ANCHOR_HMAC_SECRET) {
        return { broken: true, reason: 'signed anchors present but ANCHOR_HMAC_SECRET is not configured — cannot verify', seq: row.headSeq, unlinked };
      }
      hashOk = computeAnchorHash({ anchorPrevHash: row.anchorPrevHash, anchorDate: row.anchorDate, headSeq: row.headSeq, headHash: row.headHash }).anchorHash === row.anchorHash;
    } else {
      hashOk = computeAnchorHash({ anchorPrevHash: row.anchorPrevHash, anchorDate: row.anchorDate, headSeq: row.headSeq, headHash: row.headHash }, null).anchorHash === row.anchorHash;
    }
    if (!prevOk || !hashOk) {
      return {
        broken: true,
        reason: !prevOk
          ? 'anchorPrevHash does not match previous anchor (an anchor row was deleted, reordered or rewritten)'
          : 'anchorHash does not match recomputation (an anchor field was altered)',
        seq: row.headSeq,
        date: row.anchorDate,
        unlinked,
      };
    }
    expectedPrev = row.anchorHash;
  }
  return { broken: false, totalAnchors: rows.length, unlinked };
}

function recompute(entry) {
  return computeEntryHash({
    seq: entry.seq,
    ts: entry.ts,
    actor: { id: entry.actor?.id ?? '', role: entry.actor?.role ?? '' },
    action: entry.action,
    target: entry.target ?? '',
    payloadHash: entry.payloadHash,
    prevHash: entry.prevHash,
  });
}

/**
 * verifyAuditChain({ from, to }) →
 * { valid, headSeq, headHash, totalEntries, firstDivergence,
 *   anchorMismatch, anchorChain, anchors: [{ date, headHash, onChainTxHash, confirmed, matchesChain, status }] }
 *
 * `from`/`to` do NOT narrow the recomputation (the whole chain is always
 * recomputed — see header); they filter the returned anchors list by headSeq.
 */
async function verifyAuditChain({ from, to } = {}) {
  const entries = await AuditChain.find().sort({ seq: 1 }).lean();

  let firstDivergence = null;
  let expectedPrevHash = GENESIS_PREV_HASH;
  let expectedSeq = 0;
  // seq -> true when this entry AND the whole prefix recompute cleanly.
  // Anchor matching needs prefix-clean integrity, not just a local match.
  const intactThrough = [];
  let prefixIntact = true;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq && !firstDivergence) {
      firstDivergence = {
        seq: entry.seq,
        reason: `seq gap: expected ${expectedSeq}, found ${entry.seq} (entry deleted, inserted, or reordered)`,
      };
    }
    if (entry.seq !== expectedSeq) {
      // Re-anchor expectations after a gap so the walk continues and later
      // field-level tampering is still reported rather than cascading.
      expectedSeq = entry.seq;
      expectedPrevHash = entry.prevHash;
      prefixIntact = false;
    }

    let reason = null;
    if (entry.prevHash !== expectedPrevHash) {
      reason = 'prevHash does not match previous entryHash (chain link broken)';
    } else if (recompute(entry) !== entry.entryHash) {
      reason = 'entryHash does not match recomputation (a field on this entry was altered)';
    }
    if (reason && !firstDivergence) firstDivergence = { seq: entry.seq, reason };
    if (reason) prefixIntact = false;

    intactThrough[entry.seq] = prefixIntact;
    expectedPrevHash = entry.entryHash;
    expectedSeq += 1;
  }

  const head = entries.length > 0 ? entries[entries.length - 1] : null;

  const allAnchors = await AnchorRegistry.find().sort({ headSeq: 1 }).lean();
  const anchors = allAnchors
    .filter((a) => {
      if (from !== undefined && a.headSeq < Number(from)) return false;
      if (to !== undefined && a.headSeq > Number(to)) return false;
      return true;
    })
    .map((a) => {
      const stored = entries.find((e) => e.seq === a.headSeq);
      // matchesChain: the ledger today, recomputed from genesis, still
      // produces the exact headHash the public chain witnessed at seq a.headSeq.
      const matchesChain = Boolean(
        stored &&
        intactThrough[a.headSeq] === true &&
        stored.entryHash === a.headHash
      );
      return {
        date: a.anchorDate,
        headHash: a.headHash,
        onChainTxHash: a.onChainTxHash || null,
        confirmed: a.status === 'confirmed' && Boolean(a.onChainTxHash),
        matchesChain,
        status: a.status,
      };
    });

  // A confirmed (on-chain) anchor that no longer matches the local chain is
  // the smoking gun: the public record contradicts the database.
  const anchorMismatch = anchors.some((a) => a.confirmed && !a.matchesChain);

  // Anchor rows must also chain to each other (protects against deleting /
  // rewriting whole anchor rows in a way the headHash cross-check alone
  // might miss, e.g. when nothing ever confirmed on-chain).
  const anchorChain = await verifyAnchorChain();

  return {
    valid: firstDivergence === null && !anchorMismatch && !anchorChain.broken,
    headSeq: head ? head.seq : -1,
    headHash: head ? head.entryHash : null,
    totalEntries: entries.length,
    firstDivergence,
    anchorMismatch,
    anchorChain,
    anchors,
  };
}

module.exports = { verifyAuditChain, verifyAnchorChain };
