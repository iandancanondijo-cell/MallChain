/**
 * The 7-day chart's trend chip — the surface that was compensating for a
 * backend that could not say "I have no week of history".
 *
 * marketController.js used to answer `aggregates['7d']` from its oldest sample
 * whenever nothing reached into the window, so a backend that had been up ten
 * minutes printed "+0.31% MALL · 7d" — a weekly number that was not one. The
 * endpoint now returns `null` for an uncovered range (see
 * backend/src/__tests__/marketPriceHistory.test.js), and this file pins what
 * the dashboard does with that: a covered window states the backend's own
 * aggregate, an uncovered one states no percentage at all and says how far the
 * recorded history actually reaches.
 *
 * The chip is read off the rendered component rather than a pure function so
 * that a label computed but never printed still counts as a failure.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WalletFlowChart from './WalletFlowChart';
import { fetchMarketPrice } from '../../services/marketPriceApi';
import { usePerformance } from '../../services/performanceApi';

vi.mock('../../services/marketPriceApi', () => ({
  fetchMarketPrice: vi.fn(),
}));

vi.mock('../../services/performanceApi', () => ({
  usePerformance: vi.fn(),
}));

// The chart plots KES for these tests; the FX layer is not under test and its
// rate hook reads settings.
vi.mock('../../services/currency', () => ({
  useCurrencyConverter: () => (value: number | null) => value,
}));

const DAY_MS = 86_400_000;

/** Daily flow of zero: the holdings walk is flat, so price changes are visible alone. */
function mount(perf: { series: { date: string; net: number }[] }) {
  vi.mocked(usePerformance).mockReturnValue({
    data: { series: perf.series } as never,
    loading: false,
    error: null,
    reload: () => {},
  });
}

async function priceResponse(body: unknown) {
  vi.mocked(fetchMarketPrice).mockResolvedValue(body as never);
}

function dayDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10));
  return out;
}

const FLAT_FLOW = { series: dayDates(7).map((date) => ({ date, net: 0 })) };

beforeEach(() => {
  vi.clearAllMocks();
  mount(FLAT_FLOW);
});

afterEach(() => {
  cleanup();
});

function renderChart() {
  render(
    <WalletFlowChart
      address="mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f"
      balanceCoins={100}
      midKes={2}
      currency="KES"
    />
  );
}

describe('7-day trend chip', () => {
  test('asks the backend for the window it draws, downsampled', async () => {
    await priceResponse({ market_price: { mid: 2 }, history: [], aggregates: {}, window: { requested: '7d' } });
    renderChart();
    await screen.findByText(/7-day balance trend/);
    expect(fetchMarketPrice).toHaveBeenCalledWith({ window: '7d', points: 90 });
  });

  test('states the backend aggregate when the window is covered', async () => {
    const now = Date.now();
    await priceResponse({
      market_price: { mid: 2.1 },
      history: Array.from({ length: 8 }, (_, i) => ({ ts: now - (7 - i) * DAY_MS, mid: 2 })),
      window: { requested: '7d', windowMs: 7 * DAY_MS, points: 8, source: 'store', covered: true, firstTs: now - 7 * DAY_MS, lastTs: now },
      aggregates: {
        '7d': { pct: 4.5, latest: 2.1, past: 2.01, since: new Date(now - 7 * DAY_MS).toISOString(), spanMs: 7 * DAY_MS, source: 'store' },
      },
      store: { persisted: true, oldestTs: now - 9 * DAY_MS, newestTs: now, bucketMs: 60_000, retentionMs: 40 * DAY_MS },
    });

    renderChart();

    const chip = await screen.findByText('+4.50% MALL · 7d');
    expect(chip.className).toContain('up');
    // Every day had a sample, so no caveat about valuing days at today's rate.
    expect(screen.queryByText(/valued at the current rate/)).toBeNull();
  });

  test('refuses to state a weekly percentage the backend could not measure', async () => {
    const now = Date.now();
    await priceResponse({
      market_price: { mid: 2.1 },
      history: [{ ts: now - 12 * 60 * 60 * 1000, mid: 2.05 }, { ts: now - 60 * 60 * 1000, mid: 2.1 }],
      window: {
        requested: '7d', windowMs: 7 * DAY_MS, points: 2, source: 'store', covered: false,
        firstTs: now - 12 * 60 * 60 * 1000, lastTs: now - 60 * 60 * 1000,
      },
      aggregates: { '7d': null, '24h': null },
      store: { persisted: true, oldestTs: now - 12 * 60 * 60 * 1000, newestTs: now, bucketMs: 60_000, retentionMs: 40 * DAY_MS },
    });

    renderChart();

    expect(await screen.findByText('No 7d trend recorded')).toBeTruthy();
    expect(screen.queryByText(/% MALL/)).toBeNull();
    expect(screen.getByText(/Recorded MALL price history covers 11h,/)).toBeTruthy();
  });

  test('says no samples rather than inventing a span when the store is empty', async () => {
    await priceResponse({
      market_price: { mid: 2.1 },
      history: [],
      window: { requested: '7d', windowMs: 7 * DAY_MS, points: 0, source: 'process', covered: false, firstTs: null, lastTs: null },
      aggregates: { '7d': null },
      store: { persisted: false, oldestTs: null, newestTs: null, bucketMs: 60_000, retentionMs: 40 * DAY_MS },
    });

    renderChart();

    expect(await screen.findByText('No 7d trend recorded')).toBeTruthy();
    expect(screen.getByText(/no recorded MALL price samples/)).toBeTruthy();
  });
});
