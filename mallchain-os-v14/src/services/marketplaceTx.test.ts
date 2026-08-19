/**
 * Unit tests for marketplaceTx: client-side signing + broadcast of real
 * x/marketplace escrow actions. Regression coverage for the "Marketplace is
 * a pure local simulation" gap — checkout/advance-status/dispute used to
 * only mutate localStorage via store.applyTx, never building or
 * broadcasting a real transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';
import { createEscrow, releaseFunds, openDispute, MarketplaceTxError } from './marketplaceTx';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SELLER = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';

async function realAddress(): Promise<string> {
  const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'mall' });
  const [account] = await wallet.getAccounts();
  return account.address;
}

function mockAccountAndBroadcast(txHash = 'ESCROWTXHASH') {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/api/send/account/')) {
      return Promise.resolve({ ok: true, data: { success: true, notFound: false, accountNumber: 5, sequence: 2 } });
    }
    if (path.startsWith('/api/send/status/')) {
      return Promise.resolve({
        ok: true,
        data: {
          success: true,
          status: 'confirmed',
          code: 0,
          events: [
            { type: 'escrow_created', attributes: [{ key: 'escrow_id', value: 'escrow-42' }] },
          ],
        },
      });
    }
    return Promise.resolve({ ok: false, error: 'unexpected path: ' + path });
  });
  vi.mocked(api.post).mockResolvedValue({ ok: true, data: { success: true, txHash } });
}

describe('marketplaceTx', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('createEscrow rejects when the stored mnemonic does not derive the claimed buyer address', async () => {
    await expect(
      createEscrow({
        mnemonic: TEST_MNEMONIC,
        buyer: 'mall1thisisnotwhatthatmnemonicactuallyderives0000',
        seller: SELLER,
        amount: '1000000',
        denom: 'stake',
        description: 'test order',
        disputeWindowSeconds: 3600,
      })
    ).rejects.toBeInstanceOf(MarketplaceTxError);

    expect(api.post).not.toHaveBeenCalled();
  });

  it('createEscrow signs, broadcasts, and reads escrow_id back from the confirmed tx events', async () => {
    mockAccountAndBroadcast('CREATEHASH');
    const buyer = await realAddress();

    const result = await createEscrow({
      mnemonic: TEST_MNEMONIC,
      buyer,
      seller: SELLER,
      amount: '32500000',
      denom: 'stake',
      description: 'Nairobi Roast Coffee',
      disputeWindowSeconds: 604800,
    });

    expect(result.txHash).toBe('CREATEHASH');
    expect(result.escrowId).toBe('escrow-42');

    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, { txBytes: string }];
    expect(path).toBe('/api/marketplace/escrow/broadcast');
    expect(typeof body.txBytes).toBe('string');
    expect(body.txBytes.length).toBeGreaterThan(0);
  });

  it('createEscrow surfaces an error when the tx fails on-chain', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/api/send/account/')) {
        return Promise.resolve({ ok: true, data: { success: true, notFound: false, accountNumber: 5, sequence: 2 } });
      }
      return Promise.resolve({ ok: true, data: { success: true, status: 'confirmed', code: 5, events: [] } });
    });
    vi.mocked(api.post).mockResolvedValue({ ok: true, data: { success: true, txHash: 'FAILHASH' } });
    const buyer = await realAddress();

    await expect(
      createEscrow({
        mnemonic: TEST_MNEMONIC,
        buyer,
        seller: SELLER,
        amount: '1000000',
        denom: 'stake',
        description: 'x',
        disputeWindowSeconds: 3600,
      })
    ).rejects.toThrow(/failed on-chain/);
  });

  it('releaseFunds signs release_by as the buyer', async () => {
    mockAccountAndBroadcast('RELEASEHASH');
    const buyer = await realAddress();

    const result = await releaseFunds({ mnemonic: TEST_MNEMONIC, buyer, escrowId: 'escrow-42' });

    expect(result.txHash).toBe('RELEASEHASH');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('openDispute signs opener as the buyer', async () => {
    mockAccountAndBroadcast('DISPUTEHASH');
    const buyer = await realAddress();

    const result = await openDispute({ mnemonic: TEST_MNEMONIC, buyer, escrowId: 'escrow-42' });

    expect(result.txHash).toBe('DISPUTEHASH');
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
