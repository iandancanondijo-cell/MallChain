// Factory mocks (not auto-mock) so Jest never has to load the real
// @cosmjs/proto-signing module tree — @cosmjs/crypto@0.39's argon2 support
// pulls in an ESM-only transitive dependency that Jest's default CJS
// resolution can't parse (same issue documented in mallcoinTxBuilder.test.js
// / dexTxBuilder.test.js). The real signing/broadcast path was verified
// manually against a live wallet + running chain (issued a real on-chain
// badge, confirmed via query, confirmed reissue is rejected) — see the
// Phase 2 plan notes. These tests cover this module's own JS-level logic:
// argument validation, gas math, and broadcast/poll error propagation.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: { connectWithSigner: jest.fn() },
  GasPrice: { fromString: jest.fn(() => ({})) },
  calculateFee: jest.fn((gas) => ({ amount: [{ denom: 'stake', amount: '1000' }], gas: String(gas) })),
}));
jest.mock('../services/badgeProto', () => ({
  MSG_ISSUE_BADGE: '/marketplace.badge.v1.MsgIssueBadge',
  createBadgeRegistry: jest.fn(() => ({})),
}));

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');

const ISSUER = 'mall1issuer';
const RECIPIENT = 'mall1recipient';

/** Mocks both legs of broadcastSignedTx — see mallcoinTxBuilder.test.js for the original. */
function mockFetchSequence(broadcastResults) {
  let broadcastIndex = 0;
  const confirmedByHash = {};

  global.fetch = jest.fn().mockImplementation(async (url, opts) => {
    if (opts && opts.method === 'POST') {
      const next = broadcastResults[broadcastIndex];
      broadcastIndex += 1;
      confirmedByHash[next.txhash] = next;
      return {
        ok: true,
        json: async () => ({ tx_response: { code: 0, txhash: next.txhash, height: '0' } }),
      };
    }
    const match = /hash=0x([A-Za-z0-9]+)/.exec(url);
    const hash = match ? match[1] : null;
    const result = confirmedByHash[hash];
    if (!result) return { json: async () => ({ error: { data: `tx (${hash}) not found` } }) };
    return {
      json: async () => ({
        result: { height: '20', tx_result: { code: result.code ?? 0, log: result.raw_log ?? '' } },
      }),
    };
  });
}

describe('issueBadgeFromMnemonic', () => {
  let fakeClient;

  beforeEach(() => {
    jest.clearAllMocks();
    DirectSecp256k1HdWallet.fromMnemonic.mockResolvedValue({
      getAccounts: async () => [{ address: ISSUER }],
    });
    fakeClient = {
      simulate: jest.fn().mockResolvedValue(100000),
      sign: jest.fn().mockResolvedValue({
        bodyBytes: new Uint8Array([1]),
        authInfoBytes: new Uint8Array([2]),
        signatures: [new Uint8Array([3])],
      }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(fakeClient);
  });

  test('requires a mnemonic', async () => {
    await expect(issueBadgeFromMnemonic({ recipient: RECIPIENT })).rejects.toThrow('Missing mnemonic for badge issuer');
  });

  test('requires a recipient', async () => {
    await expect(issueBadgeFromMnemonic({ mnemonic: 'm' })).rejects.toThrow('Missing recipient address');
  });

  test('signs and broadcasts, returning the tx result', async () => {
    mockFetchSequence([{ txhash: 'BADGEHASH1', code: 0 }]);

    const result = await issueBadgeFromMnemonic({ mnemonic: 'm', recipient: RECIPIENT, badgeType: 'gold' });

    expect(result).toMatchObject({
      txHash: 'BADGEHASH1',
      issuer: ISSUER,
      recipient: RECIPIENT,
      badgeType: 'gold',
    });
    expect(fakeClient.sign).toHaveBeenCalledWith(
      ISSUER,
      [expect.objectContaining({
        typeUrl: '/marketplace.badge.v1.MsgIssueBadge',
        value: { creator: ISSUER, recipient: RECIPIENT, badgeType: 'gold' },
      })],
      expect.any(Object),
      ''
    );
  });

  test('defaults badgeType to gold when not specified', async () => {
    mockFetchSequence([{ txhash: 'BADGEHASH2', code: 0 }]);
    const result = await issueBadgeFromMnemonic({ mnemonic: 'm', recipient: RECIPIENT });
    expect(result.badgeType).toBe('gold');
  });

  test('falls back to a default gas estimate when simulation fails', async () => {
    fakeClient.simulate.mockRejectedValue(new Error('simulate down'));
    mockFetchSequence([{ txhash: 'BADGEHASH3', code: 0 }]);

    const result = await issueBadgeFromMnemonic({ mnemonic: 'm', recipient: RECIPIENT });
    expect(result.txHash).toBe('BADGEHASH3');
  });

  test('surfaces the on-chain rawLog when the tx fails at broadcast (e.g. unauthorized issuer)', async () => {
    mockFetchSequence([{ txhash: 'BADGEHASH4', code: 4, raw_log: 'creator is not the configured badge issuer' }]);

    await expect(issueBadgeFromMnemonic({ mnemonic: 'm', recipient: RECIPIENT })).rejects.toThrow(
      'creator is not the configured badge issuer'
    );
  });
});
