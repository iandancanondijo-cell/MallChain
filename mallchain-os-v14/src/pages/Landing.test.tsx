/**
 * The landing page's network status table, tested for the one thing it got
 * wrong in production: it reported a rate-limited API as an unreachable
 * network.
 *
 * The visitors reading this table are not signed in, so they share the
 * anonymous 300-requests-per-15-minutes-per-IP budget — during a traffic
 * burst (or one scripted probe) every status request answers 429 and the old
 * code rendered "Mallchain Network: UNREACHABLE / Could not reach
 * /api/blockchain/health" for a chain that was producing blocks normally. So
 * these tests assert the wording, not just the data: each situation has to be
 * described as itself, and a rate-limited or fallback answer must never
 * produce an outage claim or an invented price.
 *
 * Assertions are scoped to the table body / the status head rather than the
 * whole section, because the explanatory copy above the table legitimately
 * names all four failure kinds.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import Landing from './Landing';
import type { NetworkStatusState, NetworkOverview } from '../services/networkStatus';

const { statusRef } = vi.hoisted(() => ({
  statusRef: { current: null as unknown },
}));

vi.mock('../hooks/useLivePrice', () => ({
  useLivePrice: () => ({
    buyKes: 0.62, sellKes: 0.58, midKes: 0.6, pointPriceKes: 2,
    conversionRate: '1 MP ≈ 3.33 MLCNS', loading: false, error: false, estimating: false,
  }),
}));

vi.mock('../hooks/useNetworkStatus', () => ({
  // The reload stub is the default; a test can put its own on the state
  // object to observe the refresh button.
  useNetworkStatus: () => ({ reload: () => Promise.resolve(), ...statusRef.current }),
}));

function overview(overrides: Partial<NetworkOverview> = {}): NetworkOverview {
  return {
    generatedAt: new Date('2026-11-11T16:19:41Z').toISOString(),
    cachedForMs: 10000,
    fromCache: false,
    sources: {
      chain: { ok: true, error: null },
      explorer: { ok: true, error: null },
      price: { ok: true, error: null },
    },
    chain: {
      reachable: true, producing: true,
      chainId: 'mallchain-1', moniker: 'mallchain-validator', nodeVersion: '0.38.19',
      height: 328919, latestBlockTime: '2026-11-11T16:19:35Z',
      averageBlockTime: 5.4, totalTxs: 4211, blockAgeMs: 6650,
      staleThresholdMs: 60000, error: null,
    },
    explorer: { ok: true, recentBlockCount: 3, error: null },
    price: { ok: true, midKes: 0.6, buyKes: 0.62, sellKes: 0.58, pointPriceKes: 2, source: 'onchain', error: null },
    restEndpoint: 'http://127.0.0.1:1317',
    ...overrides,
  } as NetworkOverview;
}

function state(partial: Partial<NetworkStatusState>): NetworkStatusState {
  return { overview: null, outcome: null, loading: false, lastAttemptAt: Date.now(), retryAfterSeconds: null, ...partial };
}

/** A successful poll: services/networkStatus.ts keeps `overview` in sync with
 *  an `ok` outcome, and the rows read the retained snapshot, so tests must set
 *  both the way the real subscriber does. */
function served(ov: NetworkOverview): NetworkStatusState {
  return state({ overview: ov, outcome: { kind: 'ok', status: 200, overview: ov } });
}

function renderTable() {
  render(<Landing navigate={() => {}} />);
  const section = document.getElementById('network-status');
  const body = () => section?.querySelector('tbody')?.textContent ?? '';
  const head = () => section?.querySelector('.status-head')?.textContent ?? '';
  const foot = () => section?.querySelector('.status-foot')?.textContent ?? '';
  return {
    body,
    head,
    foot,
    text: () => section?.textContent ?? '',
    row: (label: string) => {
      const row = Array.from(section?.querySelectorAll('tbody tr') ?? [])
        .find((tr) => (tr.querySelector('.svc')?.textContent ?? '').trim() === label);
      return {
        pill: row?.querySelector('.pill')?.textContent?.trim() ?? '',
        detail: row?.querySelector('.det')?.textContent ?? '',
        exists: Boolean(row),
      };
    },
  };
}

beforeEach(() => {
  document.getElementById('root')?.replaceChildren();
});

describe('Landing network status table', () => {
  test('a healthy feed prints the real height and names the network', () => {
    statusRef.current = served(overview());
    const t = renderTable();
    expect(t.head()).toContain('Live from mallchain-1');
    const net = t.row('Mallchain Network');
    expect(net.pill).toBe('Live');
    expect(net.detail).toContain('#328,919');
    expect(t.row('Transaction index').detail).toContain('4,211 transactions in this node');
    expect(t.row('Blockchain Explorer').pill).toBe('Live');
    expect(t.row('Mallcoin (MLCNS) price').detail).toContain('read from the on-chain market');
    expect(t.body()).not.toMatch(/coming soon/i);
  });

  test('a rate-limited feed says rate-limited, and never claims the network is unreachable', () => {
    statusRef.current = state({
      outcome: { kind: 'rate_limited', status: 429, retryAfterSeconds: 240 },
      retryAfterSeconds: 240,
    });
    const t = renderTable();
    expect(t.head()).toContain('rate-limited');
    expect(t.head()).toContain('240s');
    expect(t.row('Mallchain Network').detail).toMatch(/the request budget, not the network/i);
    expect(t.row('Mallchain Network').pill).toBe('Rate-limited');
    expect(t.body()).not.toMatch(/unreachable/i);
    // No measurement is shown while the feed has none.
    expect(t.body()).not.toMatch(/#3\d{5}/);
    expect(t.row('Mallcoin (MLCNS) price').detail).not.toMatch(/KSh/);
  });

  test('a rate-limited feed keeps showing the last good check, labelled with its age and reason', () => {
    statusRef.current = state({
      overview: overview(),
      outcome: { kind: 'rate_limited', status: 429, retryAfterSeconds: 12 },
      retryAfterSeconds: 12,
    });
    const t = renderTable();
    const net = t.row('Mallchain Network');
    // Hiding a real height that is 20 seconds old would be its own lie, so the
    // values stay — but every one of them names the cool-down and the last
    // good check instead of looking current.
    expect(net.pill).toBe('Live');
    expect(net.detail).toContain('#328,919');
    expect(net.detail).toMatch(/status feed rate-limited, retrying in 12s/);
    expect(net.detail).toMatch(/last good check/);
    expect(t.head()).toContain('rate-limited');
    expect(t.foot()).toContain('single status request every 30s');
    // The cool-down counts down and the refresh button reflects it instead of
    // inviting another request into the bucket that is full.
    const button = Array.from(document.querySelectorAll('button.status-refresh'))[0];
    expect(button?.textContent).toContain('Retry in 12s');
  });

  test('only a transport failure is called unreachable', () => {
    statusRef.current = state({ outcome: { kind: 'unreachable', status: 0 } });
    const t = renderTable();
    expect(t.head()).toContain('API unreachable right now');
    expect(t.row('Mallchain Network').pill).toBe('Unreachable');
    expect(t.row('Mallchain Network').detail).toContain('/api/blockchain/overview');
    expect(t.body()).not.toMatch(/rate-limited/i);
  });

  test('a 5xx from the status API is reported as an API error with its code', () => {
    statusRef.current = state({
      outcome: { kind: 'server_error', status: 503, code: 'NETWORK_OVERVIEW_UNAVAILABLE' },
    });
    const t = renderTable();
    expect(t.head()).toContain('503');
    expect(t.row('Mallchain Network').pill).toBe('API error');
    expect(t.row('Mallchain Network').detail).toContain('NETWORK_OVERVIEW_UNAVAILABLE');
  });

  test('a node that answers but is not producing blocks reads as stalled', () => {
    const ov = overview({
      chain: {
        ...overview().chain,
        producing: false,
        blockAgeMs: 300000,
        latestBlockTime: new Date(Date.now() - 300000).toISOString(),
      },
    });
    statusRef.current = served(ov);
    const t = renderTable();
    const net = t.row('Mallchain Network');
    expect(net.pill).toBe('Stalled');
    expect(t.head()).toContain('Live from mallchain-1');
    expect(net.detail).toMatch(/300s/);
    expect(net.detail).toMatch(/stale threshold 60s/);
  });

  test('a fallback price is withheld and labelled, not shown as the network rate', () => {
    const ov = overview({
      sources: { chain: { ok: true, error: null }, explorer: { ok: true, error: null }, price: { ok: false, error: 'market_price_fallback' } },
      price: { ok: false, midKes: null, buyKes: null, sellKes: null, pointPriceKes: 2, source: 'fallback', error: 'market_price_fallback' },
    });
    statusRef.current = served(ov);
    const t = renderTable();
    const row = t.row('Mallcoin (MLCNS) price');
    expect(row.pill).toBe('Unverified');
    expect(row.detail).not.toMatch(/KSh/);
    expect(row.detail).toMatch(/no price is displayed/);
  });

  test('an explorer feed that returns nothing is a failure with its reason, not "coming soon"', () => {
    const ov = overview({
      sources: { chain: { ok: true, error: null }, explorer: { ok: false, error: 'connect ECONNREFUSED' }, price: { ok: true, error: null } },
      explorer: { ok: false, recentBlockCount: 0, error: 'connect ECONNREFUSED' },
    });
    statusRef.current = served(ov);
    const t = renderTable();
    const row = t.row('Blockchain Explorer');
    expect(row.pill).toBe('Not responding');
    expect(row.detail).toContain('ECONNREFUSED');
    expect(t.body()).not.toMatch(/coming soon/i);
  });

  test('a chain snapshot that reports no tx index says so instead of printing zero', () => {
    statusRef.current = served(overview({ chain: { ...overview().chain, totalTxs: null } }));
    const t = renderTable();
    expect(t.row('Transaction index').detail).toMatch(/no transaction index/);
    expect(t.row('Transaction index').detail).not.toMatch(/\b0\b/);
  });

  test('the tx index row never calls itself a chain-wide total', () => {
    statusRef.current = served(overview());
    const t = renderTable();
    expect(t.row('Transaction index').detail).toMatch(/this node/);
    expect(t.body()).not.toMatch(/total transactions/i);
  });

  test('the first check says it is checking rather than guessing', () => {
    statusRef.current = state({ loading: true, lastAttemptAt: null });
    const t = renderTable();
    expect(t.head()).toContain('Checking the network…');
    expect(t.row('Mallchain Network').pill).toBe('Checking');
    expect(t.body()).not.toMatch(/unreachable/i);
    expect(t.foot()).toContain('First check in progress');
  });

  test('the refresh button re-runs the shared poll', async () => {
    const reload = vi.fn(async () => {});
    statusRef.current = { ...served(overview()), reload };
    render(<Landing navigate={() => {}} />);
    const button = Array.from(document.querySelectorAll('button.status-refresh'))[0];
    fireEvent.click(button!);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
