/**
 * Component-level test for WalletSend — the flow behind commit a81288e
 * ("Send never worked for real (mall1...) addresses, including genesis
 * wallets"). Unlike mallcoinTx.test.ts (which exercises the signing service
 * directly), this drives the actual component through user interaction —
 * address entry, review, and the PIN-gated authorize step — the layer
 * where all three original bugs (address validation, hardcoded word list,
 * local-only simulation) actually lived.
 *
 * The authorize step now calls services/mnemonicAccess.ts's requestMnemonic()
 * (shows a PIN challenge modal, <PinChallengeHost/>, that isn't rendered by
 * this component-level test) instead of reading st.wallet.mnemonic directly
 * — mocked here to resolve/reject exactly like a real PIN entry would.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WalletSend from './WalletSend';
import { store } from '../../store/store';
import { sendMallcoinTransfer, MallcoinTxError } from '../../services/mallcoinTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { authService } from '../../services/auth';
import { RateLimitError } from '../../services/api';

/**
 * The live-value box under the amount field is driven entirely by these two
 * hooks, so the tests control them directly: `price` is whatever the oracle
 * poll last returned, and `toDisplay` is the identity function (KES shown in
 * KES) because the FX layer has its own tests in services/currency.
 */
const PRICE_LOADING = { midKes: null, loading: true, error: false };
const PRICE_READY = { midKes: 0.62, loading: false, error: false };
const PRICE_FAILED = { midKes: null, loading: false, error: true };
let price: { midKes: number | null; loading: boolean; error: boolean } = PRICE_LOADING;

vi.mock('../../hooks/useLivePrice', () => ({
  useLivePrice: () => price,
}));

vi.mock('../../services/currency', () => ({
  useCurrencyConverter: () => (amount: number | null) =>
    price.midKes === null || amount === null ? null : amount,
}));

vi.mock('../../services/mallcoinTx', () => ({
  sendMallcoinTransfer: vi.fn(),
  MallcoinTxError: class MallcoinTxError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('../../services/faucetApi', () => ({
  faucetApi: { fundGas: vi.fn() },
}));

vi.mock('../../services/mnemonicAccess', () => ({
  requestMnemonic: vi.fn(),
}));

const SENDER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const RECIPIENT_ADDRESS = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';
const UNIFORM_MNEMONIC = Array(12).fill('abandon').join(' ');

describe('WalletSend', () => {
  beforeEach(() => {
    store.reset();
    sessionStorage.clear();
    price = PRICE_LOADING;
    vi.mocked(sendMallcoinTransfer).mockReset();
    vi.mocked(requestMnemonic).mockReset();
    vi.mocked(requestMnemonic).mockResolvedValue(UNIFORM_MNEMONIC);

    // WalletSend now verifies the server-side wallet link (the 403
    // wallet_not_linked gate on POST /api/send/mallcoins) before broadcasting.
    // Default: the server already has this exact address linked, so the
    // signing flow proceeds; individual tests override these as needed.
    vi.spyOn(authService, 'getServerWalletLink').mockReset().mockResolvedValue({ ok: true, address: SENDER_ADDRESS });
    vi.spyOn(authService, 'linkWallet').mockReset().mockResolvedValue({ ok: true });

    store.state.wallet.address = SENDER_ADDRESS;
    store.state.wallet.pinEncryptedMnemonic = 'encrypted-blob';
    store.state.balances.MALL = 100;
    store.commit();
  });

  test('happy path: fills recipient/amount, reviews, authorizes, and broadcasts a real signed transfer', async () => {
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'REALTXHASH123',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });

    fireEvent.click(screen.getByText(/Review transaction/i));
    expect(screen.getByText('Review')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Continue to sign/i));
    expect(screen.getByText(/Authorize transaction/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1));

    // The core regression: a real signed-transfer call, not a local
    // store.applyTx simulation, with the exact address/amount the user
    // entered — matching what the fixed WalletSend actually does.
    expect(sendMallcoinTransfer).toHaveBeenCalledWith({
      mnemonic: UNIFORM_MNEMONIC,
      fromAddress: SENDER_ADDRESS,
      toAddress: RECIPIENT_ADDRESS,
      amountMlcns: 10,
    });

    await waitFor(() => expect(screen.getByText('REALTXHASH123')).toBeInTheDocument());
    expect(screen.getByText('Sent 10 MALL')).toBeInTheDocument();
  });

  test('cancelling the PIN challenge never calls sendMallcoinTransfer', async () => {
    vi.mocked(requestMnemonic).mockResolvedValue(null);
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(requestMnemonic).toHaveBeenCalledTimes(1));
    expect(sendMallcoinTransfer).not.toHaveBeenCalled();
  });

  test('an invalid (non-bech32) recipient address is rejected before reaching review', async () => {
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));

    await waitFor(() => expect(screen.getByText(/Invalid address — expected/i)).toBeInTheDocument());
    expect(screen.queryByText('Transaction Summary')).not.toBeInTheDocument();
  });

  test('surfaces the no-on-chain-history error with a way to get gas, instead of a raw error', async () => {
    vi.mocked(sendMallcoinTransfer).mockRejectedValue(
      new MallcoinTxError('needs a small stake balance for gas', 'NO_ON_CHAIN_HISTORY')
    );

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    expect(await screen.findByText(/Get fee tokens/i)).toBeInTheDocument();
  });

  test('an unlinked wallet is explicitly linked before broadcasting — the send still goes through', async () => {
    // Server says no link at all; WalletSend must run the PIN-verified
    // link-wallet flow itself instead of firing blind into the 403.
    vi.mocked(authService.getServerWalletLink).mockResolvedValue({ ok: true, address: null });
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'LINKEDTX456',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(authService.linkWallet).toHaveBeenCalledWith(SENDER_ADDRESS, { mnemonic: UNIFORM_MNEMONIC }));
    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('LINKEDTX456')).toBeInTheDocument();
  });

  test('a 403 wallet_not_linked from the broadcast triggers exactly one link-and-retry', async () => {
    // Pre-check passes (stale confirmation), but the relay still rejects —
    // the component must force one explicit re-link and rebroadcast once.
    vi.mocked(sendMallcoinTransfer)
      .mockRejectedValueOnce(new MallcoinTxError('wallet_not_linked'))
      .mockResolvedValueOnce({
        txHash: 'RETRYTX789',
        from: SENDER_ADDRESS,
        to: RECIPIENT_ADDRESS,
        amount: 10,
      });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(2));
    expect(authService.linkWallet).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('RETRYTX789')).toBeInTheDocument();
  });

  test('a failed best-effort link no longer blocks the send — txBytes signature is the authorization', async () => {
    // Multi-wallet: the server has no link and the explicit link attempt
    // fails, but the broadcast is still attempted and succeeds — the
    // backend relays any tx signed by the sender's own key.
    vi.mocked(authService.getServerWalletLink).mockResolvedValue({ ok: true, address: null });
    vi.mocked(authService.linkWallet).mockResolvedValue({ ok: false, reason: 'link_rejected_by_server' });
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'UNLINKEDTX55',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(authService.linkWallet).toHaveBeenCalledWith(SENDER_ADDRESS, { mnemonic: UNIFORM_MNEMONIC }));
    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('UNLINKEDTX55')).toBeInTheDocument();
    expect(screen.queryByText(/Link wallet now/i)).not.toBeInTheDocument();
  });

  test('a persistent wallet_not_linked from the broadcast surfaces a clear error after exactly one retry', async () => {
    vi.mocked(sendMallcoinTransfer).mockRejectedValue(new MallcoinTxError('wallet_not_linked'));
    vi.mocked(authService.linkWallet).mockResolvedValue({ ok: false, reason: 'link_rejected_by_server' });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    expect(await screen.findByText(/didn't accept your wallet's signature/i)).toBeInTheDocument();
    // no endless retries: broadcast attempted once, auto-link once
    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1));
    expect(authService.linkWallet).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Link wallet now/i)).not.toBeInTheDocument();
  });

  test('the amount field shows a live-value box with the typed amount priced in fiat', async () => {
    price = PRICE_READY;
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });

    const box = document.querySelector('.wo-value-box') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.dataset.state).toBe('ready');
    // 10 MALL × 0.62 = 6.20 shown as the headline figure, plus the rate and
    // the amount+fee total (10.05 MALL) the send will actually debit.
    await waitFor(() => expect(box.textContent).toMatch(/6\.2/));
    expect(box.textContent).toContain('1 MALL ≈');
    expect(box.textContent).toContain('10.05 MALL');
    expect((box.querySelector('.wo-value-figure') as HTMLElement).textContent).not.toBe('—');
    expect((box.querySelector('.wo-value-state') as HTMLElement).textContent).toContain('on-chain buy/sell prices');
  });

  test('the live-value box stays on screen and says so when the price feed fails', async () => {
    price = PRICE_FAILED;
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });

    const box = document.querySelector('.wo-value-box') as HTMLElement;
    expect(box.dataset.state).toBe('unavailable');
    expect((box.querySelector('.wo-value-figure') as HTMLElement).textContent).toBe('—');
    expect(box.textContent).toContain('Live price unavailable');
    // No invented number anywhere in the box while the feed is down.
    expect(box.textContent).not.toMatch(/1 MALL ≈ [^n]/);
  });

  test('the live-value box distinguishes "still loading" from "no rate"', () => {
    render(<WalletSend />);
    const box = document.querySelector('.wo-value-box') as HTMLElement;
    expect(box.dataset.state).toBe('loading');
    expect(box.textContent).toContain('Loading the live MALL price');
  });

  test('Sent step tells the truth: renders the confirmed block height from the confirmation result', async () => {
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'HEIGHTTX88',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
      confirmed: true,
      height: '589',
      timestamp: '2026-11-01T12:00:05Z',
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    // The old residual bug: static "pending confirmation on-chain" forever.
    // After confirmation resolves, the Sent step must state the height.
    expect(await screen.findByText(/confirmed on-chain at height 589/i)).toBeInTheDocument();
    expect(screen.getByText('Sent 10 MALL')).toBeInTheDocument();
    expect(screen.getByText('HEIGHTTX88')).toBeInTheDocument();
    expect(screen.queryByText(/awaiting confirmation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending confirmation on-chain/i)).not.toBeInTheDocument();
  });

  test('a 429 with Retry-After disables the Authorize button with a countdown and the PIN modal never re-opens', async () => {
    vi.mocked(sendMallcoinTransfer).mockRejectedValue(
      new RateLimitError('Too many financial operations. Please try again later.', 120)
    );

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    // First attempt goes through the PIN (once), then the 429 surfaces.
    await waitFor(() => expect(requestMnemonic).toHaveBeenCalledTimes(1));

    const authButton = screen.getByRole('button', { name: /Authorize & broadcast/i });
    expect(await screen.findByText(/Too many sends — try again in \d{1,2}:\d{2}/i)).toBeInTheDocument();
    expect(authButton).toBeDisabled();

    // While limited the PIN UI must not accept input: clicking again must NOT
    // re-prompt the mnemonic/PIN nor re-hit the broadcast endpoint.
    fireEvent.click(authButton);
    await new Promise((r) => setTimeout(r, 0));
    expect(requestMnemonic).toHaveBeenCalledTimes(1);
    expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1);
  });

  test('a confirmation timeout after a successful broadcast shows an honest pending warning, not a failure', async () => {
    // Broadcast settled; confirmation polling timed out. The coins may well
    // have arrived — the Sent step must say so instead of implying failure.
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'PENDINGTX7',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
      confirmed: false,
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText(/Review transaction/i));
    fireEvent.click(screen.getByText(/Continue to sign/i));
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    expect(
      await screen.findByText(/Broadcast succeeded — confirmation still pending; funds may already have arrived\. Check Transactions\./i)
    ).toBeInTheDocument();
    expect(screen.getByText('Sent 10 MALL')).toBeInTheDocument();
    expect(screen.getByText('PENDINGTX7')).toBeInTheDocument();
    expect(screen.queryByText(/Timed out/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
