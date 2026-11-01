/**
 * End-to-end coverage for the tamper-evident audit ledger: real in-memory
 * MongoDB (kyc.model.test.js pattern), the real Mongoose models, the real
 * service queue, and the real verifier — no mocks in the happy path, so
 * what this proves is what actually ships:
 *
 *  - appends form a valid hash chain from the documented genesis;
 *  - concurrent appends serialize (unique seqs, unbroken links);
 *  - the verifier recomputes from genesis and pinpoints first divergence
 *    after a raw-DBA-style rewrite and after a deletion;
 *  - on-chain anchors contradict a rewritten head (anchorMismatch);
 *  - append failures are non-fatal (resolves null, never throws);
 *  - no DB connection ⇒ instant skip, never a 10s buffer stall;
 *  - Mongoose-level update/delete against the models are refused.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const os = require('os');

let mongod;
let AuditChain;
let AnchorRegistry;
let appendAuditEvent;
let verifyAuditChain;

const actor = { id: 'admin-1', role: 'superadmin' };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  // mongodb driver's Jest client-metadata handshake regression — same
  // explicit-adapter workaround as kyc.model.test.js.
  await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
  AuditChain = require('../models/AuditChain');
  AnchorRegistry = require('../models/AnchorRegistry');
  ({ appendAuditEvent } = require('../services/auditChainService'));
  ({ verifyAuditChain } = require('../services/auditChainVerify'));
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}, 30000);

afterEach(async () => {
  await AuditChain.collection.deleteMany({});
  await AnchorRegistry.collection.deleteMany({});
});

async function appendFive() {
  for (let i = 0; i < 5; i++) {
    const entry = await appendAuditEvent(actor, `action_${i}`, `target:${i}`, { index: i, secret: 'not-stored' });
    expect(entry).not.toBeNull();
  }
}

describe('AuditChain hash chain', () => {
  test('genesis prevHash is sha256 of the documented seed', () => {
    const crypto = require('crypto');
    const expected = crypto.createHash('sha256').update('MALLCHAIN-AUDIT-V1').digest('hex');
    expect(AuditChain.GENESIS_PREV_HASH).toBe(expected);
  });

  test('five sequential appends verify clean', async () => {
    await appendFive();

    const result = await verifyAuditChain({});
    expect(result.valid).toBe(true);
    expect(result.firstDivergence).toBeNull();
    expect(result.headSeq).toBe(4);
    expect(result.totalEntries).toBe(5);
    expect(result.headHash).toMatch(/^[0-9a-f]{64}$/);

    const first = await AuditChain.findOne({ seq: 0 }).lean();
    expect(first.prevHash).toBe(AuditChain.GENESIS_PREV_HASH);
  });

  test('payloads are hash-only — no PII ever stored', async () => {
    await appendAuditEvent(actor, 'admin_user_delete', 'user:42', { email: 'someone@example.com', reason: 'fraud investigation details' });
    const raw = await AuditChain.collection.findOne({ seq: 0 });
    const json = JSON.stringify(raw);
    // target ids are fine (non-sensitive references), but payload values —
    // including the email and free-text reason — exist only as a digest.
    expect(json).not.toContain('someone@example.com');
    expect(json).not.toContain('fraud investigation');
    expect(raw.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('concurrent appends serialize: unique seqs, unbroken links', async () => {
    const entries = await Promise.all(
      Array.from({ length: 10 }, (_, i) => appendAuditEvent(actor, 'race_test', `t:${i}`, { i }))
    );
    expect(entries.every((e) => e !== null)).toBe(true);

    const seqs = entries.map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const result = await verifyAuditChain({});
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(10);
  });

  test('canonical JSON: key order does not change payloadHash', () => {
    const a = AuditChain.computePayloadHash({ x: 1, y: { p: 2, q: 3 } });
    const b = AuditChain.computePayloadHash({ y: { q: 3, p: 2 }, x: 1 });
    expect(a).toBe(b);
  });
});

describe('tamper detection', () => {
  test('mutating one entry via raw model update makes verify report the divergent seq', async () => {
    await appendFive();

    // Simulate a DBA with mongosh: bypass Mongoose entirely (the model-level
    // guards below refuse in-app mutation, but raw driver writes — like a
    // real DBA's — always succeed; detection is the point).
    await AuditChain.collection.updateOne({ seq: 2 }, { $set: { action: 'COVER_UP' } });

    const result = await verifyAuditChain({});
    expect(result.valid).toBe(false);
    expect(result.firstDivergence).not.toBeNull();
    expect(result.firstDivergence.seq).toBe(2);
    expect(result.firstDivergence.reason).toMatch(/entryHash does not match recomputation/);
  });

  test('rewriting an entry AND its hash still diverges via prevHash link', async () => {
    await appendFive();

    // Sneaky DBA: change seq 2's action AND recompute its entryHash
    // correctly, but doesn't bother propagating to seq 3's prevHash.
    const e2 = await AuditChain.findOne({ seq: 2 }).lean();
    const forgedHash = AuditChain.computeEntryHash({
      seq: e2.seq, ts: e2.ts, actor: e2.actor, action: 'EDITED',
      target: e2.target, payloadHash: e2.payloadHash, prevHash: e2.prevHash,
    });
    await AuditChain.collection.updateOne({ seq: 2 }, { $set: { action: 'EDITED', entryHash: forgedHash } });

    const result = await verifyAuditChain({});
    expect(result.valid).toBe(false);
    expect(result.firstDivergence.seq).toBe(3);
    expect(result.firstDivergence.reason).toMatch(/prevHash/);
  });

  test('deleting an entry surfaces as a seq gap', async () => {
    await appendFive();
    await AuditChain.collection.deleteOne({ seq: 1 });

    const result = await verifyAuditChain({});
    expect(result.valid).toBe(false);
    expect(result.firstDivergence.seq).toBe(2);
    expect(result.firstDivergence.reason).toMatch(/seq gap/);
  });

  test('a confirmed on-chain anchor contradicted by a rewritten head flags anchorMismatch', async () => {
    await appendFive();
    const head = await AuditChain.findOne({ seq: 4 }).lean();
    await AnchorRegistry.create({
      anchorDate: '2026-10-31',
      headSeq: 4,
      headHash: head.entryHash,
      memo: 'mallchain-audit-anchor:v1 seq=4',
      status: 'confirmed',
      onChainTxHash: 'ABCD1234',
    });

    // Baseline: chain matches its anchor.
    expect((await verifyAuditChain({})).valid).toBe(true);

    // DBA truncates the chain back and rebuilds something shorter and
    // self-consistent — the anchored head hash no longer exists.
    await AuditChain.collection.deleteMany({ seq: { $gte: 3 } });
    await appendAuditEvent(actor, 'fresh_entry', 't:3', { n: 3 });

    const result = await verifyAuditChain({});
    expect(result.anchorMismatch).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.anchors).toHaveLength(1);
    expect(result.anchors[0].confirmed).toBe(true);
    expect(result.anchors[0].matchesChain).toBe(false);
  });
});

describe('non-fatal behavior', () => {
  test('a failing DB write resolves null, never throws, and the flow continues', async () => {
    const spy = jest.spyOn(AuditChain, 'create').mockRejectedValueOnce(new Error('db down'));

    const entry = await appendAuditEvent(actor, 'will_fail', 't:x', {});
    expect(entry).toBeNull();
    spy.mockRestore();

    // Queue is not poisoned: the very next append still works, and the
    // failed event simply never entered the chain.
    const ok = await appendAuditEvent(actor, 'after_failure', 't:y', {});
    expect(ok).not.toBeNull();
    const result = await verifyAuditChain({});
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(1);
    expect(result.headSeq).toBe(0);
  });

  test('no DB connection ⇒ instant skip, no 10s Mongoose buffer stall', async () => {
    await mongoose.disconnect();
    try {
      const start = Date.now();
      const entry = await appendAuditEvent(actor, 'offline', 't:z', {});
      expect(entry).toBeNull();
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
    }
  });
});

describe('append-only guards (application level)', () => {
  test('Model.updateOne / deleteOne / findOneAndUpdate are refused', async () => {
    await appendAuditEvent(actor, 'guard_test', 't:1', {});
    await expect(AuditChain.updateOne({ seq: 0 }, { $set: { action: 'x' } })).rejects.toThrow(/append-only/);
    await expect(AuditChain.deleteOne({ seq: 0 })).rejects.toThrow(/append-only/);
    await expect(AuditChain.findOneAndUpdate({ seq: 0 }, { $set: { action: 'x' } })).rejects.toThrow(/append-only/);
    await expect(AnchorRegistry.updateOne({ headSeq: 0 }, { $set: { headHash: 'x' } })).rejects.toThrow(/append-only/);
  });

  test('saving a loaded (non-new) entry is refused', async () => {
    await appendAuditEvent(actor, 'guard_test2', 't:2', {});
    const doc = await AuditChain.findOne({ seq: 0 });
    doc.action = 'EDITED';
    await expect(doc.save()).rejects.toThrow(/append-only/);
  });

  test('updateOne via middleware is refused even through Model where', async () => {
    await appendAuditEvent(actor, 'guard_test3', 't:3', {});
    await expect(AuditChain.where({ seq: 0 }).updateOne({ $set: { target: 'x' } })).rejects.toThrow(/append-only/);
  });
});

describe('anchor self-chain (verifyAnchorChain)', () => {
  function linkedRow(prevHash, anchorDate, headSeq, headHash) {
    // Resolved at test time (AnchorRegistry is only assigned in beforeAll).
    const { computeAnchorHash } = AnchorRegistry;
    const { anchorHash } = computeAnchorHash({ anchorPrevHash: prevHash, anchorDate, headSeq, headHash }, null);
    return { anchorDate, headSeq, headHash, memo: `m seq=${headSeq}`, status: 'intent', anchorPrevHash: prevHash, anchorHash, anchorSigned: false };
  }

  async function seedTwoAnchors() {
    const { GENESIS_ANCHOR_HASH } = AnchorRegistry;
    const r1 = linkedRow(GENESIS_ANCHOR_HASH, '2026-10-30', 2, 'c'.repeat(64));
    const r2 = linkedRow(r1.anchorHash, '2026-10-31', 4, 'd'.repeat(64));
    await AnchorRegistry.create(r1);
    await AnchorRegistry.create(r2);
    return { r1, r2 };
  }

  test('properly linked anchors verify clean', async () => {
    await seedTwoAnchors();
    const result = await verifyAuditChain({});
    expect(result.anchorChain.broken).toBe(false);
    expect(result.anchorChain.totalAnchors).toBe(2);
  });

  test('deleting an anchor row breaks the link of the row after it', async () => {
    await seedTwoAnchors();
    // DBA deletes the FIRST anchor row: the surviving row's anchorPrevHash
    // (the deleted row's anchorHash) no longer matches the walk's expected
    // genesis prev — the removal is detectable, not silently absorbed.
    await AnchorRegistry.collection.deleteOne({ anchorDate: '2026-10-30' });
    const result = await verifyAuditChain({});
    expect(result.anchorChain.broken).toBe(true);
    expect(result.anchorChain.reason).toMatch(/deleted, reordered or rewritten/);
  });

  test('rewriting an anchor headHash (via raw driver) is detected by recompute', async () => {
    await seedTwoAnchors();
    await AnchorRegistry.collection.updateOne(
      { anchorDate: '2026-10-30' },
      { $set: { headHash: 'f'.repeat(64) } }
    );
    const result = await verifyAuditChain({});
    expect(result.anchorChain.broken).toBe(true);
    expect(result.anchorChain.reason).toMatch(/anchorHash does not match recomputation/);
  });

  test('legacy rows without anchorHash are counted as unlinked, not broken', async () => {
    await AnchorRegistry.create({ anchorDate: '2026-01-01', headSeq: 0, headHash: 'a'.repeat(64), memo: 'old', status: 'confirmed', onChainTxHash: 'X' });
    const result = await verifyAuditChain({});
    expect(result.anchorChain.broken).toBe(false);
    expect(result.anchorChain.unlinked).toBe(1);
  });
});

describe('exportHead', () => {
  test('returns latest seq/hash/ts; genesis-empty head for an empty chain', async () => {
    const { exportHead } = require('../services/auditChainService');

    const empty = await exportHead();
    expect(empty.seq).toBe(-1);
    expect(empty.entryHash).toBe(AuditChain.GENESIS_PREV_HASH);

    await appendAuditEvent(actor, 'e1', 't:1', {});
    const e2 = await appendAuditEvent(actor, 'e2', 't:2', {});
    const head = await exportHead();
    expect(head.seq).toBe(1);
    expect(head.entryHash).toBe(e2.entryHash);
    expect(head.ts).toBeInstanceOf(Date);
  });
});
