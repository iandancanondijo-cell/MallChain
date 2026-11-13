/**
 * The shared price poller.
 *
 * useLivePrice used to fetch /api/economy/state inside its own effect, so a
 * dashboard rendering three price surfaces made three identical anonymous
 * requests every 30 seconds against a 300-per-15-minutes-per-IP budget. The
 * two things pinned here are the cost (one poll, N subscribers) and the honesty
 * of the fallback case: when the economy feed answers with the deployment's
 * configured defaults instead of a measured market price, the price must not be
 * presented as live anywhere in the app.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { economyApi } from './economyApi';
import { getLivePrice, refreshLivePrice, subscribeLivePrice } from './livePrice';

vi.mock('./economyApi', () => ({
  economyApi: { getState: vi.fn() },
}));

// The price room, stood up as the small surface this module actually uses:
// subscribePrice() to join, onPriceUpdate() to be told. The real SocketManager
// would open a websocket, and what these cases pin is what the shared snapshot
// does with a push — no transport involved.
const socketStub = vi.hoisted(() => {
  const listeners = new Set<(p: never) => void>();
  return {
    listeners,
    subscribePrice: vi.fn(),
    onPriceUpdate: (cb: (p: never) => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    push: (p: unknown) => { for (const cb of listeners) cb(p as never); },
  };
});

vi.mock('./socket', () => ({
  socketManager: {
    subscribePrice: socketStub.subscribePrice,
    onPriceUpdate: socketStub.onPriceUpdate,
  },
}));

const getState = vi.mocked(economyApi.getState);

function stateResponse(market: Record<string, unknown>) {
  return {
    ok: true,
    data: {
      mlcnsPriceKes: 0.62,
      market,
      pointPriceKes: 2,
      conversion: { rate: '1 MP ≈ 3.33 MLCNS', valueRatio: 3.33, live: true, source: 'oracle', clamped: false },
      emission: {},
      schedule: { phaseMonths: 36, phases: [] },
      wallets: null,
      user: null,
      timestamp: new Date().toISOString(),
    },
  } as Awaited<ReturnType<typeof economyApi.getState>>;
}

async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  getState.mockReset();
});

describe('subscribeLivePrice', () => {
  test('every subscriber reads one poll', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 1.36, sellPriceKes: 1.3, midPriceKes: 1.33 }));
    const seen: number[] = [];
    const un1 = subscribeLivePrice(() => seen.push(1));
    const un2 = subscribeLivePrice(() => seen.push(2));
    await settle();
    expect(getState).toHaveBeenCalledTimes(1);
    expect(getLivePrice().midKes).toBe(1.33);
    un1();
    un2();
  });

  test('a second subscriber gets the current snapshot immediately', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 1.36, sellPriceKes: 1.3, midPriceKes: 1.33 }));
    const un1 = subscribeLivePrice(() => {});
    await settle();
    const received: Array<number | null> = [];
    const un2 = subscribeLivePrice((p) => received.push(p.midKes));
    expect(received).toEqual([1.33]);
    expect(getState).toHaveBeenCalledTimes(1);
    un1();
    un2();
  });

  test('a fallback price is reported as estimating with no numbers', async () => {
    getState.mockResolvedValue(stateResponse({
      buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6, fallback: true,
    }));
    const un = subscribeLivePrice(() => {});
    await settle();
    const p = getLivePrice();
    expect(p.estimating).toBe(true);
    expect(p.midKes).toBeNull();
    expect(p.buyKes).toBeNull();
    expect(p.sellKes).toBeNull();
    expect(p.conversionRate).toBeNull();
    // The pegged Mallpoints rate is a peg, not a measurement, so it stays.
    expect(p.pointPriceKes).toBe(2);
    expect(p.loading).toBe(false);
    un();
  });

  test('a failed poll keeps the last verified values but marks the feed errored', async () => {
    getState.mockResolvedValueOnce(stateResponse({ buyPriceKes: 1.36, sellPriceKes: 1.3, midPriceKes: 1.33 }));
    const un = subscribeLivePrice(() => {});
    await settle();
    expect(getLivePrice().midKes).toBe(1.33);

    getState.mockResolvedValueOnce({ ok: false, error: 'rate limited' } as Awaited<ReturnType<typeof economyApi.getState>>);
    await refreshLivePrice();
    await settle();

    const p = getLivePrice();
    expect(p.error).toBe(true);
    expect(p.midKes).toBe(1.33);
    un();
  });

  test('once every subscriber is gone the interval stops too', async () => {
    vi.useFakeTimers();
    try {
      getState.mockResolvedValue(stateResponse({ buyPriceKes: 1.36, sellPriceKes: 1.3, midPriceKes: 1.33 }));
      const un1 = subscribeLivePrice(() => {});
      const un2 = subscribeLivePrice(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(getState).toHaveBeenCalledTimes(1);
      un1();
      un2();
      await vi.advanceTimersByTimeAsync(120000);
      expect(getState).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** A `price:current` payload exactly as services/priceEngine.js emits it. */
function pushed(over: Record<string, unknown> = {}) {
  return {
    buyPriceKes: 0.72,
    sellPriceKes: 0.7,
    midPriceKes: 0.71,
    mlptsPriceKes: 2,
    usd: null,
    volume24h: null,
    change24h: null,
    source: 'chain',
    asOf: new Date().toISOString(),
    ...over,
  };
}

describe('price room pushes', () => {
  // The server half of this (backend/src/services/priceEngine.js) used to be a
  // stub that emitted `{ mallcoin: { usd: 0, kes: 0 } }`, and nothing on this
  // side listened even once it was real. These cases pin the consumer: a push
  // is the price now, the poll steps aside while pushes are arriving, and the
  // one field the price room does not carry survives the push.
  //
  // This module deliberately keeps state between cases (one snapshot, one
  // interval, one room binding for the whole tab), so every subscription here
  // goes through watch() and is released in afterEach — a leaked subscriber
  // would otherwise keep the interval alive into the next case and make an
  // unrelated assertion fail on someone else's leftover.
  const cleanups: Array<() => void> = [];
  function watch(): void {
    cleanups.push(subscribeLivePrice(() => {}));
  }
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  test('the price room is joined once for the tab, not once per subscriber', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
    watch();
    await settle();
    watch();
    watch();
    await settle();

    // One listener for the whole app: three price cards on a dashboard must not
    // mean three handlers firing on every push (the same multiplication the
    // single-interval rule above exists to prevent).
    expect(socketStub.listeners.size).toBe(1);
  });

  test('a push becomes the shared price without another REST read', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
    watch();
    await settle();
    const before = getState.mock.calls.length;

    socketStub.push(pushed());

    const p = getLivePrice();
    expect(p.midKes).toBe(0.71);
    expect(p.buyKes).toBe(0.72);
    expect(p.estimating).toBe(false);
    expect(p.error).toBe(false);
    expect(getState).toHaveBeenCalledTimes(before);
  });

  test('a push keeps the conversion rate that only /api/economy/state carries', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
    watch();
    await settle();
    expect(getLivePrice().conversionRate).toBe('1 MP ≈ 3.33 MLCNS');

    socketStub.push(pushed());

    expect(getLivePrice().conversionRate).toBe('1 MP ≈ 3.33 MLCNS');
  });

  test('a fallback push is estimating, never a measured price', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
    watch();
    await settle();
    expect(getLivePrice().midKes).toBe(0.6);

    socketStub.push(pushed({ source: 'configured-default' }));

    const p = getLivePrice();
    expect(p.estimating).toBe(true);
    expect(p.midKes).toBeNull();
    expect(p.buyKes).toBeNull();
    expect(p.conversionRate).toBeNull();
    // The Mallpoints peg is a peg, so it survives a fallback on both feeds.
    expect(p.pointPriceKes).toBe(2);
  });

  test('a malformed push changes nothing', async () => {
    getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
    watch();
    await settle();

    socketStub.push({ source: 'chain' });
    socketStub.push(null);

    expect(getLivePrice().midKes).toBe(0.6);
  });

  test('the poll stands down while pushes arrive and resumes when they stop', async () => {
    vi.useFakeTimers();
    try {
      getState.mockResolvedValue(stateResponse({ buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6 }));
      watch();
      await vi.advanceTimersByTimeAsync(0);
      expect(getState).toHaveBeenCalledTimes(1);

      socketStub.push(pushed());

      // One poll interval: the socket fed us 30s ago, so REST is not asked.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(getState).toHaveBeenCalledTimes(1);

      // Past the freshness window the poll is the only source left, and it
      // comes back — that is what keeps the conversion rate alive and the
      // display working on a tab whose websocket died.
      await vi.advanceTimersByTimeAsync(150_000);
      expect(getState.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
