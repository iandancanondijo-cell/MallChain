/**
 * GET /api/blockchain/overview — the aggregated public status feed.
 *
 * This endpoint exists because the landing page's status table used to make
 * three anonymous requests per poll, and when the shared per-IP budget ran
 * out those 429s were rendered to visitors as "network UNREACHABLE". The
 * contract being pinned here is therefore mostly about *not lying*:
 *
 *  1. Every source reports for itself. A chain that answers but is not
 *     producing blocks is `reachable: true, producing: false`, never "down";
 *     an explorer feed that throws does not drag the chain row down with it.
 *  2. A substituted number never passes as a measurement. When mallcoinService
 *     answers with the deployment's configured default price (its `fallback`
 *     flag), `price.ok` is false and the numbers are withheld — this is the
 *     exact case where the old UI printed "read from the on-chain market".
 *  3. One poll = one build. The process-wide cache with in-flight dedup is
 *     what keeps N browsers from multiplying chain queries, so it is asserted,
 *     and `NETWORK_OVERVIEW_TTL_MS=0` must still disable it (that is the knob
 *     an operator reaches for when the cache itself is suspect).
 *  4. An internal explosion is a 503 that names itself, not an empty table.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../config', () => ({
  config: {
    chain: { rest: 'http://localhost:1317', rpc: 'http://localhost:26657', id: 'mallchain-1' },
  },
}));

// The chain half of the overview comes from blockchainController's
// non-throwing snapshot; the rest of that module's handlers are mounted by the
// same router file and only need to exist as no-ops here.
jest.mock('../controllers/blockchainController', () => ({
  chainStatusSnapshot: jest.fn(),
  getEmissionState: jest.fn(),
  getTransactions: jest.fn(),
  getMarketTrades: jest.fn(),
  getMarketPrice: jest.fn(),
  getStats: jest.fn(),
  getHealth: jest.fn(),
}));

jest.mock('../services/mallcoinService', () => ({ getMarketPrice: jest.fn() }));
jest.mock('../services/economyConstants', () => ({ getMallpointPriceKes: jest.fn() }));
jest.mock('../services/explorerService', () => ({ getRecentBlocks: jest.fn() }));

const blockchainController = require('../controllers/blockchainController');
const mallcoinService = require('../services/mallcoinService');
const economyConstants = require('../services/economyConstants');
const explorerService = require('../services/explorerService');
const { errorHandler } = require('../utils/errorHandler');
const { resetOverviewCache } = require('../controllers/networkOverviewController');

function buildApp() {
  const app = express();
  app.use('/api/blockchain', require('../routes/blockchain'));
  app.use(errorHandler());
  return app;
}

const HEALTHY_SNAPSHOT = {
  reachable: true,
  chainId: 'mallchain-1',
  moniker: 'mallchain-node',
  nodeVersion: 'v0.9.0',
  height: 327000,
  latestBlockTime: new Date().toISOString(),
  averageBlockTime: 5.02,
  totalTxs: 4211,
  error: null,
};

function healthyFeeds() {
  blockchainController.chainStatusSnapshot.mockResolvedValue({ ...HEALTHY_SNAPSHOT });
  explorerService.getRecentBlocks.mockResolvedValue([{ height: 327000 }, { height: 326999 }]);
  mallcoinService.getMarketPrice.mockResolvedValue({
    buyPriceKes: 1.36,
    sellPriceKes: 1.3,
    midPriceKes: 1.33,
  });
  economyConstants.getMallpointPriceKes.mockReturnValue(2);
}

let previousTtl;

beforeEach(() => {
  jest.resetAllMocks();
  previousTtl = process.env.NETWORK_OVERVIEW_TTL_MS;
  delete process.env.NETWORK_OVERVIEW_TTL_MS;
  resetOverviewCache();
  healthyFeeds();
});

afterEach(() => {
  if (previousTtl === undefined) delete process.env.NETWORK_OVERVIEW_TTL_MS;
  else process.env.NETWORK_OVERVIEW_TTL_MS = previousTtl;
  resetOverviewCache();
});

describe('GET /api/blockchain/overview', () => {
  test('is public and reports all three feeds when everything answers', async () => {
    const res = await request(buildApp()).get('/api/blockchain/overview');

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual({
      chain: { ok: true, error: null },
      explorer: { ok: true, error: null },
      price: { ok: true, error: null },
    });
    expect(res.body.chain).toMatchObject({
      reachable: true,
      producing: true,
      chainId: 'mallchain-1',
      moniker: 'mallchain-node',
      nodeVersion: 'v0.9.0',
      height: 327000,
      averageBlockTime: 5.02,
      totalTxs: 4211,
    });
    expect(res.body.explorer).toMatchObject({ ok: true, recentBlockCount: 2 });
    expect(res.body.price).toMatchObject({ ok: true, midKes: 1.33, source: 'onchain' });
    expect(res.body.restEndpoint).toBe('http://localhost:1317');
    expect(typeof res.body.generatedAt).toBe('string');
  });

  test('a node that answers but is not producing blocks is stalled, not down', async () => {
    // Pinned rather than inherited: "stalled" is defined by
    // CHAIN_STALE_BLOCK_MS, so the assertion has to control it.
    const previous = process.env.CHAIN_STALE_BLOCK_MS;
    process.env.CHAIN_STALE_BLOCK_MS = '60000';
    blockchainController.chainStatusSnapshot.mockResolvedValue({
      ...HEALTHY_SNAPSHOT,
      latestBlockTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    let res;
    try {
      res = await request(buildApp()).get('/api/blockchain/overview');
    } finally {
      if (previous === undefined) delete process.env.CHAIN_STALE_BLOCK_MS;
      else process.env.CHAIN_STALE_BLOCK_MS = previous;
    }

    expect(res.status).toBe(200);
    // Reachable is true, so the UI must not claim an unreachable API…
    expect(res.body.sources.chain.ok).toBe(true);
    expect(res.body.chain.reachable).toBe(true);
    // …but producing is false, so it must not claim a healthy chain either.
    expect(res.body.chain.producing).toBe(false);
    expect(res.body.chain.blockAgeMs).toBeGreaterThan(4 * 60 * 1000);
    expect(res.body.chain.staleThresholdMs).toBe(60000);
  });

  test('reports the chain as down without inventing a height, and leaves the other rows alone', async () => {
    blockchainController.chainStatusSnapshot.mockResolvedValue({
      reachable: false,
      chainId: null,
      moniker: null,
      nodeVersion: null,
      height: null,
      latestBlockTime: null,
      averageBlockTime: null,
      totalTxs: null,
      error: 'BLOCKCHAIN_UNAVAILABLE',
    });

    const res = await request(buildApp()).get('/api/blockchain/overview');

    // A status feed reporting a down network is data, not a transport failure,
    // so it answers 200 with the failure in the body.
    expect(res.status).toBe(200);
    expect(res.body.sources.chain).toEqual({ ok: false, error: 'BLOCKCHAIN_UNAVAILABLE' });
    expect(res.body.chain.height).toBeNull();
    expect(res.body.chain.producing).toBe(false);
    expect(res.body.chain.blockAgeMs).toBeNull();
    // The price and explorer rows keep reporting what they actually saw.
    expect(res.body.sources.price.ok).toBe(true);
    expect(res.body.sources.explorer.ok).toBe(true);
  });

  test('withholds a fallback price instead of presenting a configured default as live', async () => {
    mallcoinService.getMarketPrice.mockResolvedValue({
      buyPriceKes: 0.62,
      sellPriceKes: 0.58,
      midPriceKes: 0.6,
      fallback: true,
    });

    const res = await request(buildApp()).get('/api/blockchain/overview');

    expect(res.status).toBe(200);
    expect(res.body.sources.price).toEqual({ ok: false, error: 'market_price_fallback' });
    expect(res.body.price.ok).toBe(false);
    expect(res.body.price.source).toBe('fallback');
    expect(res.body.price.midKes).toBeNull();
    expect(res.body.price.buyKes).toBeNull();
    // MLPTS is a peg, not a measurement, so it stays displayed.
    expect(res.body.price.pointPriceKes).toBe(2);
  });

  test('an explorer feed that throws is reported as its own failure', async () => {
    explorerService.getRecentBlocks.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:26657'));

    const res = await request(buildApp()).get('/api/blockchain/overview');

    expect(res.status).toBe(200);
    expect(res.body.sources.explorer.ok).toBe(false);
    expect(res.body.sources.explorer.error).toMatch(/ECONNREFUSED/);
    expect(res.body.explorer.recentBlockCount).toBe(0);
    expect(res.body.sources.chain.ok).toBe(true);
  });

  test('an explorer that answers with zero blocks says so rather than calling it live', async () => {
    explorerService.getRecentBlocks.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/blockchain/overview');

    expect(res.body.sources.explorer).toEqual({ ok: false, error: 'no_blocks_returned' });
  });

  test('serves concurrent and follow-up polls from one build', async () => {
    const app = buildApp();

    const [a, b] = await Promise.all([
      request(app).get('/api/blockchain/overview'),
      request(app).get('/api/blockchain/overview'),
    ]);
    expect(blockchainController.chainStatusSnapshot).toHaveBeenCalledTimes(1);
    expect(a.body.chain.height).toBe(b.body.chain.height);

    const third = await request(app).get('/api/blockchain/overview');
    expect(third.body.fromCache).toBe(true);
    expect(blockchainController.chainStatusSnapshot).toHaveBeenCalledTimes(1);
  });

  test('NETWORK_OVERVIEW_TTL_MS=0 disables the cache', async () => {
    process.env.NETWORK_OVERVIEW_TTL_MS = '0';
    const app = buildApp();

    await request(app).get('/api/blockchain/overview');
    const second = await request(app).get('/api/blockchain/overview');

    expect(second.body.fromCache).toBe(false);
    expect(blockchainController.chainStatusSnapshot).toHaveBeenCalledTimes(2);
  });

  test('an unexpected internal failure is a named 503, not an empty table', async () => {
    blockchainController.chainStatusSnapshot.mockRejectedValue(new Error('exploded'));

    const res = await request(buildApp()).get('/api/blockchain/overview');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NETWORK_OVERVIEW_UNAVAILABLE');
  });
});
