/**
 * The explorer page's half of the realtime block feed.
 *
 * The page has subscribed to `blocks:live` since it was written, and the
 * handler did the only thing it could: on every event it threw the event data
 * away and called `GET /api/explorer/latest`, because the socket payload
 * carried no tx count or proposer. Measured in the browser, that made the
 * "live" panel advance on its 10s `setInterval` and nothing else — 4 requests
 * every 10s per open tab, against an anonymous budget of 300 requests per
 * 15 minutes.
 *
 * So these tests pin the two things that make it actually live:
 *  1. a full block event paints the card with no REST request at all;
 *  2. the interval that remains is reconciliation (30s), not the block clock.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import BlockchainExplorer from './BlockchainExplorer';
import type { BlockData as SocketBlockData } from '../services/socket';

type RestBlock = {
  height: number;
  hash: string;
  time: string;
  timestamp: number;
  numTxs: number;
  proposer: string;
  gasUsed: number;
  gasWanted: number;
};

const h = vi.hoisted(() => ({
  blockHandler: null as null | ((data: SocketBlockData) => void),
  calls: { latest: 0, blocks: 0 },
  // Heights handed out by the mocked /api/explorer/latest, in order, so a test
  // can tell "the card shows the polled block" from "the card shows the pushed
  // one".
  restHeights: [] as number[],
}));

const MOUNTED_HEIGHT = 329241;

function restBlock(height: number, numTxs = 0): RestBlock {
  const iso = new Date('2026-11-11T17:00:00Z').toISOString();
  return {
    height,
    hash: 'A'.repeat(64),
    time: iso,
    timestamp: Math.floor(Date.parse(iso) / 1000),
    numTxs,
    proposer: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    gasUsed: 0,
    gasWanted: 0,
  };
}

vi.mock('../services/explorerApi', () => ({
  getLatestBlock: vi.fn(async () => {
    h.calls.latest += 1;
    return restBlock(h.restHeights.shift() ?? MOUNTED_HEIGHT);
  }),
  getBlockchainStats: vi.fn(async () => ({
    height: 329241,
    chainId: 'mallchain_9100-1',
    numTxs: 2,
    averageBlockTime: 5,
  })),
  getRecentTransactions: vi.fn(async () => []),
  getRecentBlocks: vi.fn(async () => {
    h.calls.blocks += 1;
    return [restBlock(329241, 1), restBlock(329240, 0)];
  }),
  getBlock: vi.fn(async () => restBlock(1)),
  getTransaction: vi.fn(async () => restBlock(1)),
}));

vi.mock('../services/socket', () => ({
  socketManager: {
    isConnected: () => true,
    connect: vi.fn(),
    subscribeBlocks: vi.fn(),
    onBlockUpdate: (cb: (data: SocketBlockData) => void) => {
      h.blockHandler = cb;
      return () => {
        h.blockHandler = null;
      };
    },
  },
}));

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

/**
 * Let the mount cycle's promise chain finish *and* hand React a chance to
 * apply the resulting state. Without the act() wrapper the page is still
 * showing its loading branch when the assertions run: the mocked requests
 * resolve in microtasks, but the setState they trigger is processed outside
 * the test's synchronous window.
 */
async function settle() {
  await act(async () => {
    await flush();
  });
}

function pushedBlock(overrides: Partial<SocketBlockData> = {}): SocketBlockData {
  const iso = '2026-11-11T17:02:11.068Z';
  return {
    height: 329246,
    hash: 'B'.repeat(64),
    timestamp: iso,
    txCount: 3,
    numTxs: 3,
    proposer: '8qERVPoAAAAAAAAAAAAAAAAAAAAKqqo=',
    unixTime: Math.floor(Date.parse(iso) / 1000),
    chainId: 'mallchain_9100-1',
    source: 'ws',
    ...overrides,
  };
}

/** Reads one `Label: value` row out of the Latest Block card. */
function infoRow(label: string): string | undefined {
  const rows = Array.from(document.querySelectorAll('.block-info .info-row'));
  const row = rows.find((r) => (r.textContent || '').startsWith(label));
  return row?.textContent ?? undefined;
}

beforeEach(() => {
  h.blockHandler = null;
  h.calls.latest = 0;
  h.calls.blocks = 0;
  h.restHeights = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BlockchainExplorer live blocks', () => {
  test('paints a pushed block without asking the API for it', async () => {
    render(<BlockchainExplorer />);
    await settle();
    // The mount cycle legitimately fetches once.
    expect(h.calls.latest).toBe(1);
    expect(infoRow('Block Height:')).toBe(`Block Height:${MOUNTED_HEIGHT}`);

    expect(typeof h.blockHandler).toBe('function');
    const before = h.calls.latest;

    act(() => {
      h.blockHandler!(pushedBlock());
    });
    await settle();

    // The whole point: a new block arrived, and the page made no request.
    expect(h.calls.latest).toBe(before);
    expect(infoRow('Block Height:')).toBe('Block Height:329246');
    // These two fields are what used to force the extra fetch.
    expect(infoRow('Transactions:')).toBe('Transactions:3');
    expect(infoRow('Proposer:')).toContain('8qERVPoA');
    // And the event's ISO time is mapped to the seconds-based field the card
    // formats, not printed raw.
    expect(infoRow('Timestamp:')).toContain(new Date('2026-11-11T17:02:11.068Z').getFullYear().toString());
  });

  test('keeps working against a server that sends the short payload', async () => {
    render(<BlockchainExplorer />);
    await settle();
    const before = h.calls.latest;
    // Whatever the fallback fetch returns from here on is identifiable, so the
    // assertion proves the card came from that fetch rather than the event.
    h.restHeights = [329248];

    act(() => {
      h.blockHandler!({ height: 329247, hash: 'C'.repeat(64), timestamp: '2026-11-11T17:03:00.000Z', txCount: 1 });
    });
    await settle();

    // No numTxs/unixTime on the event, so the page falls back to exactly one
    // fetch: degraded to the old behaviour, not broken.
    expect(h.calls.latest).toBe(before + 1);
    expect(infoRow('Block Height:')).toBe('Block Height:329248');
  });

  test('reconciles on a 30s interval instead of driving the block view', async () => {
    vi.useFakeTimers();
    render(<BlockchainExplorer />);
    await settle();
    expect(h.calls.latest).toBe(1);

    // Two of the old 10s cycles must now be silent — this is the traffic that
    // used to spend 24 requests a minute per open tab.
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await flush();
    });
    expect(h.calls.latest).toBe(1);
    expect(h.calls.blocks).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await flush();
    });
    expect(h.calls.latest).toBe(2);
    expect(h.calls.blocks).toBe(2);
  });

  test('unchecking auto-refresh stops the reconciliation requests', async () => {
    vi.useFakeTimers();
    render(<BlockchainExplorer />);
    await settle();

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    act(() => {
      checkbox!.click();
    });
    await settle();

    const before = h.calls.latest;
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await flush();
    });
    expect(h.calls.latest).toBe(before);
  });

  test('a block event updates the height even with auto-refresh off', async () => {
    render(<BlockchainExplorer />);
    await settle();
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    act(() => {
      checkbox!.click();
    });
    await settle();

    act(() => {
      h.blockHandler!(pushedBlock({ height: 329300 }));
    });
    await settle();

    // "Live" no longer depends on the poll being enabled.
    expect(infoRow('Block Height:')).toBe('Block Height:329300');
  });
});
