// Coverage for GET /api/mallpoints/price (handoff §9.4: "Mallpoints rate has no
// dedicated public endpoint — the UI reads it from /api/economy/state").
//
// What this route is responsible for, and therefore what is asserted here:
// 1. It answers from the single source of truth (`economyConstants`), not a
//    copy of the constant, and it says *where* the number came from. A client
//    reading "2" cannot otherwise tell a deployment that configured KSh 2 from
//    one that never set MALLPOINT_PRICE_KES and is on the built-in default.
// 2. The MLPTS->MLCNS ratio is the same figure the convert flow settles with
//    (the fiat-pegged oracle, already clamped to the on-chain bounds) — not a
//    display approximation of it.
// 3. The peg does not depend on the chain, so an oracle failure costs the
//    caller the ratio and nothing else. `conversion: null`, not a stale number.
// 4. `/price` resolves as itself. `/:address` is registered after it, and a
//    route ordering mistake would answer this request with "address not found"
//    shaped data instead of a price.
const request = require('supertest');
const express = require('express');

jest.mock('../models/MallPointAccount', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/user', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../services/mallpointsService', () => ({
  getChainUserPoints: jest.fn(),
  getConversionWindow: jest.fn(),
  mergePoints: jest.fn(),
  buildConversionStatus: jest.fn(),
}));
jest.mock('../services/badgeService', () => ({ getUserBadgeInfo: jest.fn() }));
jest.mock('../services/faucetService', () => ({ creditMlcns: jest.fn() }));
jest.mock('../services/mallcoinService', () => ({
  getMlptsPerMlcnsScale: jest.fn().mockReturnValue(1000000),
  getMarketPrice: jest.fn(),
  getChainParams: jest.fn(),
}));
jest.mock('../services/liquidityActivityService', () => ({ recordLiquidityActivity: jest.fn() }));
jest.mock('../mallwallet/security/verifyAdr036', () => ({ verifyConvertSignature: jest.fn() }));
// The oracle is what turns the peg plus the live MLCNS price into a rate. It
// reads the chain and Redis behind the scenes; this suite is about the route's
// contract, so it is stubbed with values and asserted on passthrough.
jest.mock('../services/conversionRateOracle', () => ({
  getDynamicConversionRate: jest.fn(),
  RATE_SCALE: 1000000,
}));

const MallPointAccount = require('../models/MallPointAccount');
const { getDynamicConversionRate } = require('../services/conversionRateOracle');
const { DEFAULT_MALLPOINT_PRICE_KES } = require('../services/economyConstants');
const mallpointsRouter = require('../routes/mallpoints');

describe('GET /api/mallpoints/price', () => {
  let app;
  const ORIGINAL_PRICE = process.env.MALLPOINT_PRICE_KES;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mallpoints', mallpointsRouter);
  });

  afterAll(() => {
    // process.env is shared with whatever test file runs next in this worker.
    if (ORIGINAL_PRICE === undefined) delete process.env.MALLPOINT_PRICE_KES;
    else process.env.MALLPOINT_PRICE_KES = ORIGINAL_PRICE;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MALLPOINT_PRICE_KES;
    getDynamicConversionRate.mockResolvedValue({
      proposedRate: 3225806,
      minRate: 1000,
      maxRate: 100000000,
      mlptsPriceKes: 2,
      mlcnsMidPriceKes: 0.62,
      rateScale: 1000000,
      clamped: false,
      source: 'fiat-pegged-oracle',
    });
  });

  async function getPrice() {
    const res = await request(app).get('/api/mallpoints/price');
    expect(res.status).toBe(200);
    return res.body;
  }

  test('publishes the configured default and says so', async () => {
    const body = await getPrice();
    expect(body.success).toBe(true);
    expect(body.pointPriceKes).toBe(DEFAULT_MALLPOINT_PRICE_KES);
    expect(body.pegSource).toBe('default');
    expect(body.currency).toBe('KES');
    expect(body.defaultPointPriceKes).toBe(DEFAULT_MALLPOINT_PRICE_KES);
  });

  test('reports the environment value as configured, not as the default', async () => {
    process.env.MALLPOINT_PRICE_KES = '3.5';
    const body = await getPrice();
    expect(body.pointPriceKes).toBe(3.5);
    expect(body.pegSource).toBe('environment');
    // The default stays visible so a client can tell "moved" from "unset".
    expect(body.defaultPointPriceKes).toBe(DEFAULT_MALLPOINT_PRICE_KES);
  });

  test('an unusable MALLPOINT_PRICE_KES falls back and is reported as default', async () => {
    process.env.MALLPOINT_PRICE_KES = 'two';
    const body = await getPrice();
    expect(body.pointPriceKes).toBe(DEFAULT_MALLPOINT_PRICE_KES);
    expect(body.pegSource).toBe('default');
  });

  test('carries the settleable MLPTS->MLCNS ratio with its own provenance', async () => {
    const body = await getPrice();
    expect(body.conversion).toMatchObject({
      proposedRate: 3225806,
      rateScale: 1000000,
      minRate: 1000,
      maxRate: 100000000,
      clamped: false,
      mlcnsMidPriceKes: 0.62,
      source: 'fiat-pegged-oracle',
    });
    // 3,225,806 / 1e6 — the number /convert actually mints with, and a
    // human-readable form so a surface does not re-derive it and round
    // differently from the rest of the app.
    expect(body.conversion.valueRatio).toBeCloseTo(3.225806, 6);
    expect(body.conversion.human).toBe('1 MP ≈ 3.23 MLCNS');
  });

  test('keeps the peg when the oracle cannot answer, and publishes no ratio', async () => {
    getDynamicConversionRate.mockRejectedValue(new Error('chain unreachable'));
    const body = await getPrice();
    expect(body.status).toBeUndefined();
    expect(body.pointPriceKes).toBe(DEFAULT_MALLPOINT_PRICE_KES);
    // null = "the ratio is unknown", which is what the client renders as a
    // dash. A fabricated 1:1 here would look like a measured rate.
    expect(body.conversion).toBe(null);
  });

  test('/price is not swallowed by /:address', async () => {
    const body = await getPrice();
    expect(body.pointPriceKes).toBeDefined();
    expect(body.balance).toBeUndefined();
    // The address route reads the point account; this one must not.
    expect(MallPointAccount.findOne).not.toHaveBeenCalled();
  });

  test('/price is public — no wallet signature, no bearer token', async () => {
    const res = await request(app).get('/api/mallpoints/price');
    expect(res.status).toBe(200);
  });

  test('asOf is a real timestamp, so a client can tell how old the quote is', async () => {
    const before = Date.now();
    const body = await getPrice();
    const at = Date.parse(body.asOf);
    expect(Number.isNaN(at)).toBe(false);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
  });
});
