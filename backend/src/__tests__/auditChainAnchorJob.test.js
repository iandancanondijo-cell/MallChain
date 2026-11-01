/**
 * Unit coverage for jobs/auditChainAnchor.js — the daily head-hash anchoring
 * broadcast. Mongoose models and the CosmJS signer are mocked (badgeSnapshot
 * style): this tests the JOB'S DECISION LOGIC (what it records, what it
 * broadcasts, how it degrades), not on-chain plumbing.
 */
jest.mock('../models/AuditChain', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/AnchorRegistry', () => {
  // Keep the REAL hash helpers (computeAnchorHash / GENESIS_ANCHOR_HASH) so
  // the job's anchor self-chain is exercised for real; mock only the DB calls.
  const actual = jest.requireActual('../models/AnchorRegistry');
  const registry = {
    findOne: jest.fn(),
    create: jest.fn(),
    updateAnchorStatus: jest.fn(),
    computeAnchorHash: actual.computeAnchorHash,
    GENESIS_ANCHOR_HASH: actual.GENESIS_ANCHOR_HASH,
  };
  return registry;
});
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: jest.fn(),
  },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: {
    connectWithSigner: jest.fn(),
  },
  GasPrice: {
    fromString: jest.fn(() => ({})),
  },
}));

const AuditChain = require('../models/AuditChain');
const AnchorRegistry = require('../models/AnchorRegistry');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');
const { runAuditChainAnchor, anchorMemo, MEMO_PREFIX } = require('../jobs/auditChainAnchor');

const HEAD = { seq: 7, entryHash: 'a'.repeat(64) };

function mockHead(head) {
  AuditChain.findOne.mockReturnValue({
    sort: () => ({ lean: async () => head }),
  });
}

// findOne is called two ways by the job: findOne({headSeq,status}) (the
// already-anchored check, awaited directly) and findOne().sort({_id:-1})
// .lean() (latest anchor row for the self-chain). Route by arity.
let alreadyAnchoredRef = null;
let latestAnchorRef = null;

let sendTokens;

beforeEach(() => {
  jest.clearAllMocks();
  alreadyAnchoredRef = null;
  latestAnchorRef = null;
  AnchorRegistry.findOne.mockImplementation((filter) =>
    filter === undefined
      ? { sort: () => ({ lean: async () => latestAnchorRef }) }
      : Promise.resolve(alreadyAnchoredRef)
  );
  sendTokens = jest.fn().mockResolvedValue({ transactionHash: 'TXHASH123', height: 501, code: 0 });
  DirectSecp256k1HdWallet.fromMnemonic.mockResolvedValue({
    getAccounts: async () => [{ address: 'mall1treasurymainaddress' }],
  });
  SigningStargateClient.connectWithSigner.mockResolvedValue({ sendTokens });
  AnchorRegistry.create.mockImplementation(async (data) => ({ _id: 'anchor1', ...data }));
  AnchorRegistry.updateAnchorStatus.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.AUDIT_ANCHOR_MNEMONIC;
  delete process.env.OPERATOR_MNEMONIC;
  delete process.env.TREASURY_MNEMONIC;
  delete process.env.ANCHOR_HMAC_SECRET;
});

describe('runAuditChainAnchor', () => {
  test('empty chain ⇒ skip without touching the registry', async () => {
    mockHead(null);
    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));
    expect(result).toMatchObject({ ok: true, anchored: false, reason: 'empty-chain' });
    expect(AnchorRegistry.create).not.toHaveBeenCalled();
    expect(sendTokens).not.toHaveBeenCalled();
  });

  test('already-anchored head ⇒ skip, no duplicate broadcast', async () => {
    mockHead(HEAD);
    alreadyAnchoredRef = { _id: 'x', headSeq: 7, status: 'confirmed' };

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));
    expect(result.anchored).toBe(false);
    expect(result.reason).toBe('already-anchored');
    expect(sendTokens).not.toHaveBeenCalled();
  });

  test('signer configured ⇒ broadcasts memo tx and confirms the anchor record', async () => {
    process.env.OPERATOR_MNEMONIC = 'unit test mnemonic not real';
    mockHead(HEAD);

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));

    expect(result).toMatchObject({ ok: true, anchored: true, txHash: 'TXHASH123', headSeq: 7 });
    // Pending record first, then the status transition on success.
    expect(AnchorRegistry.create).toHaveBeenCalledWith(expect.objectContaining({
      anchorDate: '2026-10-31',
      headSeq: 7,
      headHash: HEAD.entryHash,
      status: 'pending',
    }));
    expect(sendTokens).toHaveBeenCalledWith(
      'mall1treasurymainaddress',
      'mall1treasurymainaddress',
      expect.arrayContaining([expect.objectContaining({ denom: expect.any(String) })]),
      'auto',
      `${MEMO_PREFIX} seq=7 hash=${HEAD.entryHash}`
    );
    expect(AnchorRegistry.updateAnchorStatus).toHaveBeenCalledWith(
      'anchor1',
      expect.objectContaining({ status: 'confirmed', onChainTxHash: 'TXHASH123', blockHeight: 501 })
    );
  });

  test('no signer ⇒ intent persisted + no broadcast, never throws', async () => {
    mockHead(HEAD);

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));

    expect(result).toMatchObject({ ok: false, anchored: false, reason: 'no-signer', headSeq: 7 });
    expect(DirectSecp256k1HdWallet.fromMnemonic).not.toHaveBeenCalled();
    expect(AnchorRegistry.create).toHaveBeenCalledWith(expect.objectContaining({
      headSeq: 7,
      headHash: HEAD.entryHash,
      status: 'intent',
    }));
  });

  test('broadcast failure ⇒ record marked failed, job resolves (retried next run)', async () => {
    process.env.TREASURY_MNEMONIC = 'unit test treasury mnemonic';
    mockHead(HEAD);
    sendTokens.mockRejectedValue(new Error('rpc unreachable'));

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));

    expect(result).toMatchObject({ ok: false, anchored: false, reason: 'broadcast-failed' });
    expect(AnchorRegistry.updateAnchorStatus).toHaveBeenCalledWith('anchor1', expect.objectContaining({
      status: 'failed',
      error: 'rpc unreachable',
    }));
  });

  test('non-zero broadcast code is treated as failure', async () => {
    process.env.AUDIT_ANCHOR_MNEMONIC = 'explicit anchor mnemonic first priority';
    mockHead(HEAD);
    sendTokens.mockResolvedValue({ transactionHash: 'X', height: 1, code: 5, rawLog: 'insufficient funds' });

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:30:00Z'));
    expect(result.reason).toBe('broadcast-failed');
  });

  test('AUDIT_ANCHOR_MNEMONIC takes priority over OPERATOR/TREASURY', async () => {
    process.env.AUDIT_ANCHOR_MNEMONIC = 'anchor key';
    process.env.OPERATOR_MNEMONIC = 'operator key';
    mockHead(HEAD);

    await runAuditChainAnchor(new Date());
    expect(DirectSecp256k1HdWallet.fromMnemonic).toHaveBeenCalledWith('anchor key', expect.anything());
  });

  test('memo format stays inside the chain memo size limit', () => {
    const memo = anchorMemo({ seq: 123456789, entryHash: 'b'.repeat(64) });
    expect(memo.length).toBeLessThan(256);
    expect(memo).toContain('seq=123456789');
    expect(memo).toContain('b'.repeat(64));
  });
});

describe('anchor self-chain (anchorPrevHash / anchorHash)', () => {
  test('first anchor links to the 64-zero genesis hash; unsigned SHA-256 without ANCHOR_HMAC_SECRET', async () => {
    process.env.OPERATOR_MNEMONIC = 'unit test mnemonic not real';
    mockHead(HEAD);

    await runAuditChainAnchor(new Date('2026-10-31T00:15:00Z'));

    const created = AnchorRegistry.create.mock.calls[0][0];
    expect(created.anchorPrevHash).toBe(AnchorRegistry.GENESIS_ANCHOR_HASH);
    expect(created.anchorPrevHash).toBe('0'.repeat(64));
    expect(created.anchorSigned).toBe(false);
    const { computeAnchorHash } = AnchorRegistry;
    expect(created.anchorHash).toBe(
      computeAnchorHash({
        anchorPrevHash: created.anchorPrevHash, anchorDate: created.anchorDate,
        headSeq: created.headSeq, headHash: created.headHash,
      }, null).anchorHash
    );
  });

  test('second anchor links to the first anchorHash — rows form a chain', async () => {
    process.env.ANCHOR_HMAC_SECRET = 'test-anchor-secret';
    mockHead(HEAD);
    latestAnchorRef = { anchorHash: 'e'.repeat(64), headSeq: 3 };

    await runAuditChainAnchor(new Date('2026-11-01T00:15:00Z'));

    const created = AnchorRegistry.create.mock.calls[0][0];
    expect(created.anchorPrevHash).toBe('e'.repeat(64));
    expect(created.anchorSigned).toBe(true); // HMAC under the secret
    const { computeAnchorHash } = AnchorRegistry;
    expect(created.anchorHash).toBe(
      computeAnchorHash({
        anchorPrevHash: created.anchorPrevHash, anchorDate: created.anchorDate,
        headSeq: created.headSeq, headHash: created.headHash,
      }, 'test-anchor-secret').anchorHash
    );
  });

  test('chaining lookup failure degrades to an unlinked insert, job still runs', async () => {
    process.env.OPERATOR_MNEMONIC = 'unit test mnemonic not real';
    mockHead(HEAD);
    AnchorRegistry.findOne.mockImplementation((filter) =>
      filter === undefined
        ? { sort: () => ({ lean: async () => { throw new Error('lookup broke'); } }) }
        : Promise.resolve(null)
    );

    const result = await runAuditChainAnchor(new Date('2026-10-31T00:15:00Z'));
    expect(result.ok).toBe(true);
    // Fallback insert carries the original commitment fields, no chain fields.
    expect(AnchorRegistry.create).toHaveBeenCalledWith(expect.objectContaining({ headSeq: 7, status: 'pending' }));
  });
});
