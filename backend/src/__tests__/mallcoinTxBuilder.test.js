// Factory mocks (not auto-mock) so Jest never has to load the real
// @cosmjs/proto-signing module tree — @cosmjs/crypto@0.39's argon2 support
// pulls in an ESM-only transitive dependency that Jest's default CJS
// resolution can't parse, which auto-mocking would otherwise trigger.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1Wallet: { fromKey: jest.fn() },
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: { connectWithSigner: jest.fn() },
  GasPrice: { fromString: jest.fn(() => ({})) },
  calculateFee: jest.fn((gas) => ({ amount: [{ denom: 'stake', amount: '1000' }], gas: String(gas) })),
}));
jest.mock('../services/mlcoinProto', () => ({
  MSG_TRANSFER_MALLCOIN: '/marketplace.mlcoin.v1.MsgTransferMallcoin',
  createMlcoinRegistry: jest.fn(() => ({})),
}));

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');
const { transferAndFundGas } = require('../services/mallcoinTxBuilder');

/**
 * Mocks global.fetch for both legs of broadcastSignedTx: the POST broadcast
 * (BROADCAST_MODE_SYNC / CheckTx) and the GET poll against CometBFT's
 * /tx?hash= (DeliverTx confirmation). `broadcastResults` supplies one
 * {txhash, code, raw_log?} per broadcast call, in call order; each is then
 * immediately "confirmed" as that same result on the first poll.
 */
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
        json: async () => ({
          tx_response: { code: 0, txhash: next.txhash, height: '0' },
        }),
      };
    }

    // GET poll: `${CHAIN_RPC}/tx?hash=0x{hash}`
    const match = /hash=0x([A-Za-z0-9]+)/.exec(url);
    const hash = match ? match[1] : null;
    const result = confirmedByHash[hash];
    if (!result) {
      return { json: async () => ({ error: { data: `tx (${hash}) not found` } }) };
    }
    return {
      json: async () => ({
        result: {
          height: '20',
          tx_result: { code: result.code ?? 0, log: result.raw_log ?? '' },
        },
      }),
    };
  });
}

describe('transferAndFundGas', () => {
  const SENDER = 'mall1sender';
  const RECIPIENT = 'mall1recipient';

  let fakeClient;
  let signCalls;

  beforeEach(() => {
    jest.clearAllMocks();
    signCalls = [];

    DirectSecp256k1HdWallet.fromMnemonic.mockResolvedValue({
      getAccounts: async () => [{ address: SENDER }],
    });

    fakeClient = {
      getChainId: jest.fn().mockResolvedValue('mallchain-1'),
      // Sequence is fetched exactly once, up front, then tracked locally —
      // this mock should never be asked for it a second time.
      getSequence: jest.fn().mockResolvedValue({ accountNumber: 7, sequence: 5 }),
      simulate: jest.fn().mockResolvedValue(100000),
      sign: jest.fn().mockImplementation(async (address, msgs, fee, memo, explicitSignerData) => {
        signCalls.push({ msgTypeUrl: msgs[0].typeUrl, explicitSignerData });
        return { bodyBytes: new Uint8Array([1]), authInfoBytes: new Uint8Array([2]), signatures: [new Uint8Array([3])] };
      }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(fakeClient);

    mockFetchSequence([
      { txhash: 'HASH1', code: 0 },
      { txhash: 'HASH2', code: 0 },
    ]);
  });

  test('fetches the account sequence exactly once and increments it locally between the two signatures', async () => {
    await transferAndFundGas({
      mnemonic: 'test mnemonic',
      toAddress: RECIPIENT,
      amountMlcns: 250,
      amountStake: '10',
    });

    expect(fakeClient.getSequence).toHaveBeenCalledTimes(1);
    expect(fakeClient.sign).toHaveBeenCalledTimes(2);

    expect(signCalls[0].msgTypeUrl).toBe('/marketplace.mlcoin.v1.MsgTransferMallcoin');
    expect(signCalls[0].explicitSignerData).toEqual({ accountNumber: 7, sequence: 5, chainId: 'mallchain-1' });

    expect(signCalls[1].msgTypeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(signCalls[1].explicitSignerData).toEqual({ accountNumber: 7, sequence: 6, chainId: 'mallchain-1' });
  });

  test('returns both tx hashes once each is confirmed on-chain', async () => {
    const result = await transferAndFundGas({
      mnemonic: 'test mnemonic',
      toAddress: RECIPIENT,
      amountMlcns: 250,
      amountStake: '10',
    });

    expect(result.transfer.txHash).toBe('HASH1');
    expect(result.transfer.amountMlcns).toBe(250);
    expect(result.gasFunding.txHash).toBe('HASH2');
    expect(result.gasFunding.amount).toBe('10');
  });

  test('skips gas funding entirely when fundGas is false, issuing only one signature', async () => {
    const result = await transferAndFundGas({
      mnemonic: 'test mnemonic',
      toAddress: RECIPIENT,
      amountMlcns: 250,
      fundGas: false,
    });

    expect(fakeClient.sign).toHaveBeenCalledTimes(1);
    expect(result.gasFunding).toBeNull();
  });

  test('reports a gas-funding failure without discarding the already-successful transfer', async () => {
    mockFetchSequence([
      { txhash: 'TRANSFERHASH', code: 0 },
      { txhash: 'GASHASH', code: 5, raw_log: 'account sequence mismatch, expected 7, got 6' },
    ]);

    const result = await transferAndFundGas({
      mnemonic: 'test mnemonic',
      toAddress: RECIPIENT,
      amountMlcns: 250,
      amountStake: '10',
    });

    expect(result.transfer.txHash).toBe('TRANSFERHASH');
    expect(result.gasFunding.error).toContain('account sequence mismatch');
  });

  test('throws if the transfer itself fails once confirmed on-chain, even though CheckTx accepted it', async () => {
    mockFetchSequence([{ txhash: 'TRANSFERHASH', code: 5, raw_log: 'insufficient funds' }]);

    await expect(
      transferAndFundGas({
        mnemonic: 'test mnemonic',
        toAddress: RECIPIENT,
        amountMlcns: 250,
        fundGas: false,
      })
    ).rejects.toThrow('insufficient funds');
  });

  test('signs with the funding account derived from a private key when mnemonic is not provided', async () => {
    const { DirectSecp256k1Wallet } = require('@cosmjs/proto-signing');
    DirectSecp256k1Wallet.fromKey.mockResolvedValue({
      getAccounts: async () => [{ address: SENDER }],
    });
    mockFetchSequence([{ txhash: 'HASH1', code: 0 }]);

    const result = await transferAndFundGas({
      privateKeyHex: 'aabbcc',
      toAddress: RECIPIENT,
      amountMlcns: 100,
      fundGas: false,
    });

    expect(DirectSecp256k1Wallet.fromKey).toHaveBeenCalled();
    expect(result.transfer.from).toBe(SENDER);
  });
});
