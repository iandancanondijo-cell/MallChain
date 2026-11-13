/**
 * The shared Mallpoints rate poller.
 *
 * The rate-only screens — the Mallpoints purchase page and the Mines
 * leaderboard — used to borrow `pointPriceKes` from `services/livePrice.ts`,
 * which meant asking `/api/economy/state` (the backend's heaviest economy
 * route: two chain reads, the emission schedule, the treasury balances) for one
 * integer, and spending the anonymous per-IP budget on it. These cases pin what
 * replaced that: one interval for the whole tab against the dedicated
 * `/api/mallpoints/price`, the provenance fields surviving the trip, and the
 * two honesty rules the screens depend on — no rate is ever invented locally,
 * and a failed read keeps the last one rather than blanking a figure a payment
 * was quoted from.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { mallpointsApi } from './mallpointsApi';
import {
  getMallpointsPeg,
  refreshMallpointsPeg,
  subscribeMallpointsPrice,
} from './mallpointsPrice';

vi.mock('./mallpointsApi', () => ({
  mallpointsApi: { getPrice: vi.fn(), getBalance: vi.fn(), convert: vi.fn() },
}));

const getPrice = vi.mocked(mallpointsApi.getPrice);

function priceResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      success: true,
      currency: 'KES',
      pointPriceKes: 2,
      pegSource: 'environment',
      defaultPointPriceKes: 2,
      conversion: {
        valueRatio: 3.225806,
        human: '1 MP ≈ 3.23 MLCNS',
        proposedRate: 3225806,
        rateScale: 1000000,
        minRate: 1000,
        maxRate: 100000000,
        clamped: false,
        mlcnsMidPriceKes: 0.62,
        mlptsPriceKes: 2,
        source: 'fiat-pegged-oracle',
      },
      asOf: new Date().toISOString(),
      ...over,
    },
  } as Awaited<ReturnType<typeof mallpointsApi.getPrice>>;
}

async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

// Like livePrice, this module keeps one snapshot and one interval for the tab,
// so every subscription goes through watch() and is released in afterEach —
// otherwise a leaked subscriber keeps the interval running into the next case.
const cleanups: Array<() => void> = [];
function watch(): void {
  cleanups.push(subscribeMallpointsPrice(() => {}));
}

beforeEach(() => {
  getPrice.mockReset();
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('subscribeMallpointsPrice', () => {
  // Declared first on purpose: this module holds one snapshot for the tab, so
  // the "nothing has been read yet" state only exists before the first test
  // below runs.
  test('nothing is assumed before the server has answered', () => {
    // The purchase page gates paying on this: a locally-defaulted KSh 2 would
    // show one total and STK-push another.
    expect(getMallpointsPeg().pointPriceKes).toBeNull();
    expect(getMallpointsPeg().loading).toBe(true);
  });

  test('every subscriber reads one poll', async () => {
    getPrice.mockResolvedValue(priceResponse());
    watch();
    watch();
    await settle();
    expect(getPrice).toHaveBeenCalledTimes(1);
    expect(getMallpointsPeg().pointPriceKes).toBe(2);
  });

  test('a second subscriber gets the current rate immediately', async () => {
    getPrice.mockResolvedValue(priceResponse({ pointPriceKes: 3.5, pegSource: 'environment' }));
    watch();
    await settle();

    const received: Array<number | null> = [];
    const un = subscribeMallpointsPrice((p) => received.push(p.pointPriceKes));
    expect(received).toEqual([3.5]);
    expect(getPrice).toHaveBeenCalledTimes(1);
    un();
  });

  test('carries the peg provenance and the settleable ratio', async () => {
    getPrice.mockResolvedValue(priceResponse({ pegSource: 'default' }));
    watch();
    await settle();

    const p = getMallpointsPeg();
    // "2 because nobody configured it" is a different fact from "2 because a
    // deployment chose it", and the screen that says which is this module's
    // only supplier of that field.
    expect(p.pegSource).toBe('default');
    expect(p.defaultPointPriceKes).toBe(2);
    expect(p.conversion?.proposedRate).toBe(3225806);
    expect(p.conversionRate).toBe('1 MP ≈ 3.23 MLCNS');
    expect(p.loading).toBe(false);
    expect(p.error).toBe(false);
  });

  test('publishes no ratio when the server has none', async () => {
    // The backend answers with the peg plus `conversion: null` when its oracle
    // cannot reach the chain. Nothing here turns that into a guessed 1:1.
    getPrice.mockResolvedValue(priceResponse({ conversion: null }));
    watch();
    await settle();

    const p = getMallpointsPeg();
    expect(p.pointPriceKes).toBe(2);
    expect(p.conversion).toBe(null);
    expect(p.conversionRate).toBeNull();
  });

  test('a failed read keeps the rate that a quote was priced from', async () => {
    getPrice.mockResolvedValueOnce(priceResponse({ pointPriceKes: 4 }));
    watch();
    await settle();
    expect(getMallpointsPeg().pointPriceKes).toBe(4);

    getPrice.mockResolvedValueOnce({ ok: false, error: 'rate limited' } as never);
    await refreshMallpointsPeg();
    await settle();

    const p = getMallpointsPeg();
    expect(p.error).toBe(true);
    expect(p.pointPriceKes).toBe(4);
  });

  test('once every subscriber is gone the interval stops too', async () => {
    vi.useFakeTimers();
    try {
      getPrice.mockResolvedValue(priceResponse());
      const un1 = subscribeMallpointsPrice(() => {});
      const un2 = subscribeMallpointsPrice(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(getPrice).toHaveBeenCalledTimes(1);
      un1();
      un2();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(getPrice).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('the interval keeps the rate current while something is watching', async () => {
    vi.useFakeTimers();
    try {
      getPrice.mockResolvedValue(priceResponse());
      const un = subscribeMallpointsPrice(() => {});
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getPrice.mock.calls.length).toBeGreaterThan(1);
      un();
    } finally {
      vi.useRealTimers();
    }
  });
});
