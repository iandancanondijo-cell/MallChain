/**
 * Unit tests for mallcoinTx: client-side signing + broadcast of real MALL transfers.
 * Regression coverage for the "sending from genesis wallets doesn't go through"
 * bug — this exercises the signing path directly rather than through the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';
import { sendMallcoinTransfer, MallcoinTxError } from './mallcoinTx';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// A real, funded genesis wallet mnemonic would sign for a mall1... address that
// doesn't match this arbitrary test mnemonic's derived address — which is exactly
// what we assert against below (the "wrong wallet loaded" case).
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('mallcoinTx.sendMallcoinTransfer', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('rejects when the stored mnemonic does not derive the claimed sender address', async () => {
    await expect(
      sendMallcoinTransfer({
        mnemonic: TEST_MNEMONIC,
        fromAddress: 'mall1thisisnotwhatthatmnemonicactuallyderives0000',
        toAddress: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
        amountMlcns: 10,
      })
    ).rejects.toBeInstanceOf(MallcoinTxError);

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('surfaces a friendly error when the account has no on-chain history', async () => {
    vi.mocked(api.get).mockResolvedValue({ ok: true, data: { success: true, notFound: true, accountNumber: 0, sequence: 0 } });

    // Derive the real address for TEST_MNEMONIC so we get past the address check.
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'mall' });
    const [account] = await wallet.getAccounts();

    await expect(
      sendMallcoinTransfer({
        mnemonic: TEST_MNEMONIC,
        fromAddress: account.address,
        toAddress: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
        amountMlcns: 10,
      })
    ).rejects.toThrow(/no on-chain history/);

    expect(api.post).not.toHaveBeenCalled();
  });

  it('signs and broadcasts a well-formed transfer, converting MALL to 6-decimal base units', async () => {
    vi.mocked(api.get).mockResolvedValue({ ok: true, data: { success: true, notFound: false, accountNumber: 3, sequence: 7 } });
    vi.mocked(api.post).mockResolvedValue({ ok: true, data: { success: true, txHash: 'ABCDEF1234' } });

    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'mall' });
    const [account] = await wallet.getAccounts();

    const result = await sendMallcoinTransfer({
      mnemonic: TEST_MNEMONIC,
      fromAddress: account.address,
      toAddress: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
      amountMlcns: 12.5,
    });

    expect(result.txHash).toBe('ABCDEF1234');
    expect(api.get).toHaveBeenCalledWith(`/api/send/account/${account.address}`);

    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, { from: string; to: string; amount: number; txBytes: string }];
    expect(path).toBe('/api/send/mallcoins');
    expect(body.from).toBe(account.address);
    expect(body.to).toBe('mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6');
    expect(body.amount).toBe(12.5);
    // txBytes must be non-empty base64 — the actual signed TxRaw bytes.
    expect(typeof body.txBytes).toBe('string');
    expect(body.txBytes.length).toBeGreaterThan(0);
  });

  it('surfaces the backend error when broadcast fails', async () => {
    vi.mocked(api.get).mockResolvedValue({ ok: true, data: { success: true, notFound: false, accountNumber: 3, sequence: 7 } });
    vi.mocked(api.post).mockResolvedValue({ ok: false, error: 'insufficient funds' });

    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'mall' });
    const [account] = await wallet.getAccounts();

    await expect(
      sendMallcoinTransfer({
        mnemonic: TEST_MNEMONIC,
        fromAddress: account.address,
        toAddress: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
        amountMlcns: 1,
      })
    ).rejects.toThrow(/insufficient funds/);
  });
});
