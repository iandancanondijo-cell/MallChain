/**
 * Mallpoints purchase is the one screen where the app asks for real money, so
 * every figure on it has to be the server's. These tests pin that: the rate
 * comes from the server's dedicated Mallpoints price endpoint
 * (GET /api/mallpoints/price, via hooks/useMallpointsPrice.ts), the KES total
 * is derived from it, the quote the phone receives is the one the server
 * reserved, and nothing can be paid while the rate is unknown. The page used to
 * multiply by a hardcoded `MALLPOINT_PRICE_KES = 2`, which quoted one total and
 * charged another the moment `MALLPOINT_PRICE_KES` moved in the deployment.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MallpointsPurchase from './MallpointsPurchase';
import { store } from '../store/store';
import { toastBus, type ToastItem } from '../components/ui';

const { getMock, postMock, priceRef } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  priceRef: { current: { pointPriceKes: null as number | null, loading: true, error: false } },
}));

vi.mock('../services/api', () => ({ api: { get: getMock, post: postMock } }));
vi.mock('../hooks/useMallpointsPrice', () => ({ useMallpointsPrice: () => priceRef.current }));
vi.mock('../services/auth', () => ({ authService: { linkWallet: vi.fn() } }));
vi.mock('../features/wallet/walletGate', () => ({
  useWalletGate: () => ({ gate: { blocked: false, state: 'ready' }, refresh: vi.fn() }),
  reportLinkFailure: vi.fn(() => false),
  linkAttemptGuard: vi.fn(() => null),
}));

const WALLET = 'mall1buyerpurchasewalletaddressxxxxxxxxx';

function serverRate(kes: number | null, { loading = false, error = false } = {}) {
  priceRef.current = { pointPriceKes: kes, loading, error };
}

/** The route answers /api/creator-space/balance with the linked wallet, which
 *  is what moves the page off the "connect a wallet" screen. */
function stubBalance() {
  getMock.mockImplementation(async (path: string) => {
    if (path === '/api/creator-space/balance') {
      return { ok: true, data: { ok: true, mlpts_balance: 12, walletAddress: WALLET } };
    }
    return { ok: false, error: `unexpected GET ${path}` };
  });
}

let toasts: ToastItem[] = [];

function renderPage() {
  const view = render(<MallpointsPurchase navigate={() => {}} />);
  return {
    ...view,
    amount: () => screen.getByDisplayValue('50') as HTMLInputElement,
    payButton: () => Array.from(document.querySelectorAll('button')).find((b) => /Pay with M-Pesa/.test(b.textContent || '')) as HTMLButtonElement,
  };
}

/** Lets the component's awaited API calls settle without relying on timers. */
async function flush(times = 12) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

describe('MallpointsPurchase pricing', () => {
  beforeEach(() => {
    store.reset();
    store.state.user.authed = true;
    store.state.wallet.address = WALLET;
    store.commit();
    getMock.mockReset();
    postMock.mockReset();
    toasts = [];
    toastBus.listeners.add((t) => toasts.push(t));
    stubBalance();
    serverRate(3);
  });

  afterEach(() => {
    toastBus.listeners.clear();
    vi.restoreAllMocks();
  });

  test('quotes the total from the server rate, not a constant', async () => {
    renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    expect(screen.getByText('3 KES / MLPTS')).toBeInTheDocument();
    // 50 MLPTS entered by default × the server's 3 KES.
    expect(screen.getByText('150 KES')).toBeInTheDocument();
    // routes/mallpointsPurchase.js refuses a quote under KSH 10 → 4 MLPTS at 3 KES.
    expect(screen.getByText(/minimum 4 MLPTS \(KSH 10\)/)).toBeInTheDocument();
  });

  test('the same screen priced at a different server rate follows it', async () => {
    serverRate(7);
    renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    expect(screen.getByText('7 KES / MLPTS')).toBeInTheDocument();
    expect(screen.getByText('350 KES')).toBeInTheDocument();
    expect(screen.getByText(/minimum 2 MLPTS \(KSH 10\)/)).toBeInTheDocument();
  });

  test('reserves the quote for the KSH amount the buyer was shown', async () => {
    postMock.mockResolvedValue({ ok: true, data: { ok: true, quoteId: 'q-1', amountKes: 150, mallpointsAmount: 50, pricePerMallpoint: 3 } });
    const page = renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    fireEvent.change(screen.getByPlaceholderText('254712345678'), { target: { value: '254701234567' } });
    fireEvent.click(page.payButton());

    await waitFor(() => expect(postMock).toHaveBeenCalledWith(
      '/api/mallpoints/purchase/reserve',
      { amount_kes: 150, address: WALLET },
    ));
  });

  test('pays no attention to a stale client figure once the server has priced the quote', async () => {
    // The rate moved between page load and reserve: the phone must be pushed
    // the quote the server actually created, not the previewed number.
    postMock.mockImplementation(async (path: string) => {
      if (path === '/api/mallpoints/purchase/reserve') {
        return { ok: true, data: { ok: true, quoteId: 'q-2', amountKes: 210, mallpointsAmount: 70, pricePerMallpoint: 3 } };
      }
      if (path === '/api/mallpoints/purchase/mpesa') return { ok: true, data: { ok: true } };
      return { ok: false, error: `unexpected POST ${path}` };
    });
    const page = renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    fireEvent.change(screen.getByPlaceholderText('254712345678'), { target: { value: '254701234567' } });
    fireEvent.click(page.payButton());

    expect(await screen.findByText(/Check your phone/)).toBeInTheDocument();
    expect(screen.getByText(/210 KES/)).toBeInTheDocument();
    expect(screen.getByText(/70 MLPTS/)).toBeInTheDocument();
  });

  test('refuses a purchase under the KSH 10 floor without asking for a quote', async () => {
    const page = renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    fireEvent.change(page.amount(), { target: { value: '3' } });
    fireEvent.click(page.payButton());

    await waitFor(() => expect(toasts.map((t) => t.text)).toContain('Minimum purchase is KSH 10 — 4 MLPTS at 3 KES each'));
    expect(postMock).not.toHaveBeenCalled();
  });

  test('while the rate is still loading nothing is priced and paying is disabled', async () => {
    serverRate(null, { loading: true });
    const page = renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    expect(screen.getByText('loading the current rate…')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the current Mallpoints rate from the network…')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(page.payButton().disabled).toBe(true);
    expect(postMock).not.toHaveBeenCalled();
  });

  test('a failed rate read says so and keeps paying disabled rather than assuming 2', async () => {
    serverRate(null, { error: true });
    const page = renderPage();
    await screen.findByText(/Your balance: 12 MLPTS/);

    expect(screen.getByText('rate unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Could not load the current Mallpoints rate/)).toBeInTheDocument();
    expect(screen.queryByText('2 KES / MLPTS')).toBeNull();
    expect(page.payButton().disabled).toBe(true);
  });

  test('keeps the quote reference on screen when a confirmed payment fails to credit', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/api/mallpoints/purchase/reserve') {
        return { ok: true, data: { ok: true, quoteId: 'q-lost', amountKes: 150, mallpointsAmount: 50, pricePerMallpoint: 3 } };
      }
      if (path === '/api/mallpoints/purchase/mpesa') return { ok: true, data: { ok: true } };
      if (path === '/api/mallpoints/purchase/credit') return { ok: true, data: { ok: false, error: 'credit refused: quote already spent' } };
      return { ok: false, error: `unexpected POST ${path}` };
    });
    getMock.mockImplementation(async (path: string) => {
      if (path === '/api/creator-space/balance') return { ok: true, data: { ok: true, mlpts_balance: 12, walletAddress: WALLET } };
      if (path.startsWith('/api/mallpoints/purchase/status/')) return { ok: true, data: { status: 'confirmed' } };
      return { ok: false, error: `unexpected GET ${path}` };
    });

    // Only the 3s status poll is faked; the awaited fetches still settle on
    // their own, so the flow can be driven without letting microtasks freeze.
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    try {
      const page = renderPage();
      // waitFor's own timers are faked for the whole block, so this test reads
      // the DOM after flushing promises instead of using findBy*.
      await flush();

      fireEvent.change(screen.getByPlaceholderText('254712345678'), { target: { value: '254701234567' } });
      fireEvent.click(page.payButton());
      await flush();
      expect(screen.getByText(/Check your phone/)).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });

      expect(screen.getByText('A payment landed but was not credited')).toBeInTheDocument();
      expect(screen.getByText(/q-lost/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
