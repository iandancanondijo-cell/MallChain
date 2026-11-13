/**
 * The price history's durability contract — backend-handoff-2026-11-09 §1
 * (windowed price series + a null-safe 7d aggregate) and §2 (market cap).
 *
 * What this pins down, in the order it would hurt to get wrong:
 *
 *  1. A range the backend cannot actually reach back to answers `null`. The
 *     old `aggregateChangeForRange` fell back to "the oldest sample I have",
 *     so a process that started seconds ago reported ten minutes of drift
 *     under a `7d` label, and no client could tell that apart from a genuinely
 *     flat week. The frontend worked around it by recomputing the trend from
 *     the raw samples; that workaround is deleted once this holds.
 *  2. Samples survive a restart. They live in Mongo (one bucket per minute),
 *     not only in the process's array, so `?window=7d` can be answered after
 *     the poller has been up for a minute.
 *  3. `?window=` downsamples to the number of points asked for and says
 *     whether the returned series really covers the window.
 *  4. A market cap is composed only from chain reads — circulating supply from
 *     emission_state, price from the market price endpoint — and 502s rather
 *     than guessing when either is missing.
 *
 * axios (chain REST) and the MarketPriceSample model are mocked; mongoose is
 * mocked down to the one field the controller looks at, `connection.readyState`,
 * so the "store unavailable" branch is a real branch rather than a timeout.
 */
jest.mock('axios');
jest.mock('mongoose', () => ({ connection: { readyState: 0 } }));
jest.mock('../models/MarketPriceSample', () => ({
  aggregate: jest.fn(),
  updateOne: jest.fn(),
  deleteMany: jest.fn(),
}));

const PRICE = { market_price: { buy_price: 210, sell_price: 190, last_update_height: 4242 } };

function freshLoad({ readyState = 1 } = {}) {
  jest.resetModules();
  const mongoose = require('mongoose');
  mongoose.connection.readyState = readyState;
  const Sample = require('../models/MarketPriceSample');
  Sample.aggregate.mockReset().mockResolvedValue([]);
  Sample.updateOne.mockReset().mockResolvedValue({ acknowledged: true });
  Sample.deleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
  const axios = require('axios');
  axios.get.mockReset();
  const ctrl = require('../controllers/marketController');
  return { ctrl, Sample, axios };
}

function mockRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

const MIN = 60 * 1000;

describe('GET /api/market/price — aggregates answer null when the range is not covered', () => {
  test('a 7d aggregate is null when nothing reaches back a week', async () => {
    const { ctrl, axios } = freshLoad({ readyState: 0 });
    axios.get.mockResolvedValue({ data: PRICE });

    const res = mockRes();
    await ctrl.getMarketPrice({ query: {} }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.market_price.mid).toBe(2.0);
    expect(body.aggregates['7d']).toBeNull();
    expect(body.aggregates['24h']).toBeNull();
    // Nothing in the response pretends a fresh process has a week of history.
    expect(body.store.persisted).toBe(false);
  });

  test('a 7d aggregate comes from the durable store when the process cannot reach back', async () => {
    const { ctrl, axios, Sample } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * MIN;
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * MIN;
    Sample.aggregate.mockResolvedValue([
      { ts: eightDaysAgo, mid: 1.0, buy: 1.05, sell: 0.95 },
      { ts: sixDaysAgo, mid: 1.8, buy: 1.9, sell: 1.7 },
    ]);

    const res = mockRes();
    await ctrl.getMarketPrice({ query: {} }, res);

    const agg = res.json.mock.calls[0][0].aggregates['7d'];
    expect(agg).not.toBeNull();
    expect(agg.source).toBe('store');
    expect(agg.past).toBe(1.0);
    expect(agg.pct).toBeCloseTo(100, 5);
    expect(new Date(agg.since).getTime()).toBeLessThanOrEqual(Date.now() - 7 * 24 * 60 * MIN);
  });

  test('a short range still prefers this process own second-accurate samples', async () => {
    const { ctrl, axios, Sample } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });
    // The store knows nothing about 10 minutes ago; memory is what answers.
    Sample.aggregate.mockResolvedValue([]);
    const { priceHistory } = ctrl._internals;
    priceHistory.length = 0;
    priceHistory.push({ ts: Date.now() - 11 * MIN, mid: 2.5 });

    const res = mockRes();
    await ctrl.getMarketPrice({ query: {} }, res);

    const agg = res.json.mock.calls[0][0].aggregates['10m'];
    expect(agg.source).toBe('process');
    expect(agg.past).toBe(2.5);
    expect(agg.pct).toBeCloseTo(-20, 5);
    priceHistory.length = 0;
  });
});

describe('GET /api/market/price?window=', () => {
  test('downsamples the store to the requested number of points and reports coverage', async () => {
    const { ctrl, axios, Sample } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });
    const now = Date.now();
    const rows = Array.from({ length: 8 }, (_, i) => ({
      ts: now - (7 - i) * 24 * 60 * MIN,
      mid: 1 + i / 10,
      buy: 1 + i / 10,
      sell: 1 + i / 10,
    }));
    Sample.aggregate.mockResolvedValue(rows);

    const res = mockRes();
    await ctrl.getMarketPrice({ query: { window: '7d', points: '20' } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.history).toHaveLength(rows.length);
    expect(body.window).toMatchObject({ requested: '7d', source: 'store', covered: true });
    expect(body.window.windowMs).toBe(7 * 24 * 60 * 60 * 1000);

    // 7 days of minute buckets at <=20 points is a 504-minute group.
    const pipeline = Sample.aggregate.mock.calls[0][0];
    const group = pipeline.find((s) => s.$group);
    expect(group.$group._id.$floor.$divide[1]).toBe(Math.ceil((7 * 24 * 60) / 20));
  });

  test('says covered:false rather than drawing a short series as a full window', async () => {
    const { ctrl, axios, Sample } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });
    Sample.aggregate.mockResolvedValue([
      { ts: Date.now() - 5 * MIN, mid: 2.0, buy: 2.0, sell: 2.0 },
    ]);

    const res = mockRes();
    await ctrl.getMarketPrice({ query: { window: '7d' } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.window.covered).toBe(false);
    expect(body.aggregates['7d']).toBeNull();
  });

  test('caps the point count so one poll cannot pull every bucket it has', async () => {
    const { ctrl, axios, Sample } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });
    Sample.aggregate.mockResolvedValue([]);

    await ctrl.getMarketPrice({ query: { window: '30d', points: '100000' } }, mockRes());

    const pipeline = Sample.aggregate.mock.calls[0][0];
    const group = pipeline.find((s) => s.$group);
    expect(group.$group._id.$floor.$divide[1]).toBe(Math.ceil((30 * 24 * 60) / 500));
  });

  test('an unknown window name falls back to this process samples, still labelled', async () => {
    const { ctrl, axios } = freshLoad();
    axios.get.mockResolvedValue({ data: PRICE });

    const res = mockRes();
    await ctrl.getMarketPrice({ query: { window: 'forever' } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.window.requested).toBeNull();
    expect(body.window.source).toBe('process');
    expect(body.window.covered).toBe(false);
  });
});

describe('the poller writes through to the durable store', () => {
  test('upserts one minute bucket per sample', async () => {
    const { ctrl, Sample } = freshLoad();
    const bucket = Math.floor(Date.now() / MIN);

    const stored = await ctrl._internals.storeSample({
      ts: bucket * MIN + 1500,
      buy: 2.1,
      sell: 1.9,
      mid: 2.0,
      height: 4242,
    });

    expect(stored).toBe(true);
    const [filter, update] = Sample.updateOne.mock.calls[0];
    expect(filter).toEqual({ bucket });
    expect(update.$set).toMatchObject({ buy: 2.1, sell: 1.9, mid: 2.0, height: 4242 });
  });

  test('reports it stored nothing when the database is not connected', async () => {
    const { ctrl, Sample } = freshLoad({ readyState: 0 });

    const stored = await ctrl._internals.storeSample({ ts: Date.now(), buy: 2, sell: 2, mid: 2, height: null });

    expect(stored).toBe(false);
    expect(Sample.updateOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/market/cap', () => {
  const EMISSION = { emission_state: { total_supply: 1_000_000_000_000, circulating: 250_000_000_000_000 } };

  test('multiplies chain circulating supply by the chain price, with no constant in sight', async () => {
    const { ctrl, axios } = freshLoad();
    axios.get.mockImplementation((url) =>
      Promise.resolve(url.includes('emission_state') ? { data: EMISSION } : { data: PRICE })
    );

    const res = mockRes();
    await ctrl.getMarketCap({}, res);

    const body = res.json.mock.calls[0][0];
    expect(body.totalSupply).toBe(1_000_000);
    expect(body.circulatingSupply).toBe(250_000_000);
    expect(body.priceKes).toBe(2);
    expect(body.marketCapKes).toBe(500_000_000);
    expect(body.currency).toBe('KES');
    expect(body.asOfHeight).toBe(4242);
    expect(body.supplyFallback).toBeNull();
    expect(typeof body.asOf).toBe('string');
  });

  test('carries the genesis fallback through instead of calling starting supply live', async () => {
    const { ctrl, axios } = freshLoad();
    axios.get.mockImplementation((url) =>
      url.includes('emission_state')
        ? Promise.reject(new Error('econnrefused'))
        : Promise.resolve({ data: PRICE })
    );
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-genesis-'));
    fs.mkdirSync(path.join(home, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(home, 'config', 'genesis.json'),
      JSON.stringify({ app_state: { mlcoin: { emission_state: { total_supply: 9_000_000, circulating: 4_000_000 } } } })
    );
    const prev = process.env.MARKETPLACED_HOME;
    process.env.MARKETPLACED_HOME = home;

    try {
      const res = mockRes();
      await ctrl.getMarketCap({}, res);
      const body = res.json.mock.calls[0][0];
      expect(body.supplyFallback).toBe('genesis');
      expect(body.circulatingSupply).toBe(4);
    } finally {
      process.env.MARKETPLACED_HOME = prev;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('502s when either half of the product is missing', async () => {
    const { ctrl, axios } = freshLoad();

    axios.get.mockImplementation((url) =>
      url.includes('emission_state') ? Promise.resolve({ data: {} }) : Promise.resolve({ data: PRICE })
    );
    const noSupply = mockRes();
    await ctrl.getMarketCap({}, noSupply);
    expect(noSupply.status).toHaveBeenCalledWith(502);

    axios.get.mockImplementation((url) =>
      url.includes('emission_state') ? Promise.resolve({ data: EMISSION }) : Promise.resolve({ data: {} })
    );
    const noPrice = mockRes();
    await ctrl.getMarketCap({}, noPrice);
    expect(noPrice.status).toHaveBeenCalledWith(502);
  });

  test('502s on a zero price rather than reporting a zero cap as a measurement', async () => {
    const { ctrl, axios } = freshLoad();
    axios.get.mockImplementation((url) =>
      url.includes('emission_state')
        ? Promise.resolve({ data: EMISSION })
        : Promise.resolve({ data: { market_price: { buy_price: 0, sell_price: 0 } } })
    );

    const res = mockRes();
    await ctrl.getMarketCap({}, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
