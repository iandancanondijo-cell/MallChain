// Regression coverage for routes/buy.js's actual route wiring — the
// STK-push double-submit guard and the DLQ enqueue-on-failure behavior
// added for T1 (M-Pesa reliability). Nothing else in this test suite
// exercises these routes directly (buyValidation.test.js only tests the Joi
// schemas, buyGateService.test.js only tests the gate middleware in
// isolation), which is exactly how a prior version of these route-level
// changes went unnoticed for a while — this file closes that gap.
const request = require('supertest');
const express = require('express');
const axios = require('axios');

jest.mock('axios');
// paymentSummary() (used by both /reserve and /mpesa responses) reads the
// phone back through this static, so the mock has to provide it or every
// successful quote 500s on the way out.
jest.mock('../models/MallcoinPurchase', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  decryptPhone: jest.fn(() => ({ phone: '254712345678' })),
}));
jest.mock('../models/MallcoinSale', () => ({ create: jest.fn() }));
jest.mock('../models/B2CPayout', () => ({ create: jest.fn() }));
jest.mock('../models/WithdrawalRequest', () => ({ create: jest.fn() }));
jest.mock('../models/LiquidityReconciliation', () => ({ create: jest.fn(), findOne: jest.fn() }));
// /mpesa now requires an Idempotency-Key (see buy.js) — this suite isn't
// testing that middleware itself (withdrawIdempotency.test.js does, via
// withdraw.js's identical use of it), so a fully-permissive mock keeps
// these tests focused on the STK double-submit guard they're actually
// named for.
jest.mock('../models/IdempotencyKey', () => ({
  findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  create: jest.fn().mockResolvedValue({}),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));
jest.mock('../controllers/liquidityController', () => ({
  addLiquidityToPool: jest.fn(),
  fetchPoolsFromBlockchain: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/b2cPayoutService', () => ({ initiateB2CPayout: jest.fn(), handlePayoutCallback: jest.fn() }));
jest.mock('../services/sellBurnService', () => ({ executeSellBurnWorkflow: jest.fn() }));
jest.mock('../services/liquidityActivityService', () => ({
  recordBuyLiquidityActivity: jest.fn().mockResolvedValue(undefined),
  recordWithdrawLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/buyGateService', () => ({
  getBuyGateStatus: jest.fn().mockResolvedValue({ locked: false }),
  requireDirectBuyUnlocked: () => (_req, _res, next) => next(),
}));
jest.mock('../services/sellGateService', () => ({
  checkSellLiquidity: jest.fn(),
  SELL_POOL_ID: 2,
}));
// /reserve consults the pool-cap service before quoting. It resolves chain
// pool values through modules this suite doesn't load, so stub it the same
// way the buy/sell gates are stubbed — the cap itself has its own tests.
jest.mock('../services/liquidityPoolCapService', () => ({
  isPoolCapReached: jest.fn().mockResolvedValue(false),
  getPoolCapStatus: jest.fn().mockResolvedValue({ reached: false, poolValueKes: 0, capKes: 500000 }),
  invalidateCache: jest.fn(),
}));
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn().mockResolvedValue({ buyPriceKes: 1, sellPriceKes: 1 }),
}));
// Only the callback processor is stubbed (this suite asserts on DLQ enqueue
// behaviour); describeFailure is the real translator, so a route change that
// starts calling it fails loudly here instead of 500ing in production.
jest.mock('../services/mpesaCallbackService', () => ({
  ...jest.requireActual('../services/mpesaCallbackService'),
  processMpesaCallback: jest.fn(),
}));
jest.mock('../mallwallet/queue/paymentCallbackQueue', () => ({
  enqueueFailedCallback: jest.fn().mockResolvedValue(true),
}));
jest.mock('../utils/circuitBreaker', () => ({
  createBlockchainBreaker: () => ({ execute: (fn) => fn() }),
  createPaymentBackoff: () => ({ execute: (fn) => fn() }),
}));
jest.mock('../config', () => ({
  config: {
    payment: {
      safaricom: {
        apiBaseUrl: 'https://sandbox.safaricom.co.ke',
        consumerKey: 'key',
        consumerSecret: 'secret',
        businessShortCode: '174379',
        passkey: 'passkey',
        securityCredential: 'cred',
        stkCallbackUrl: 'http://localhost:4000/api/buy/mpesa/callback',
      },
    },
    chain: { broadcastMode: 'BROADCAST_MODE_SYNC' },
    // /reserve now verifies the wallet belongs to the authenticated user via
    // fieldEncryption.blindIndex, which needs 32-byte hex keys.
    secrets: {
      fieldEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      fieldBlindIndexKey: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    },
  },
}));
// /reserve now sits behind requireAuth + a wallet-ownership check. These
// tests exercise idempotency and the STK double-submit guard, not auth —
// a permissive middleware plus a User stub whose wallet maps to the same
// _id keeps that out of scope (the ownership rejection has its own test).
jest.mock('../middleware/requireAuth', () => () => (req, _res, next) => {
  req.user = { _id: 'user-1' };
  next();
});
jest.mock('../models/user', () => ({
  findOne: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({ _id: 'user-1' }),
  }),
}));

const MallcoinPurchase = require('../models/MallcoinPurchase');
const IdempotencyKey = require('../models/IdempotencyKey');
const User = require('../models/user');
const { processMpesaCallback } = require('../services/mpesaCallbackService');
const { enqueueFailedCallback } = require('../mallwallet/queue/paymentCallbackQueue');
const buyRoutes = require('../routes/buy');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/buy', buyRoutes);
  return app;
}

const VALID_PHONE = '254712345678';

describe('POST /api/buy/mpesa — STK push double-submit guard', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fires a real STK push for a fresh, pending quote', async () => {
    const purchase = {
      quoteId: 'quote-1',
      status: 'pending',
      fiatAmount: 100,
      currency: 'KES',
      save: jest.fn().mockResolvedValue(undefined),
    };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);
    axios.get.mockResolvedValue({ data: { access_token: 'test-token' } });
    // Daraja's synchronous acceptance shape: ResponseCode '0' plus a
    // CheckoutRequestID. Anything else means no prompt was ever delivered.
    axios.post.mockResolvedValue({ data: { ResponseCode: '0', ResponseDescription: 'Success. The service request has been submitted successfully', CheckoutRequestID: 'chk-1' } });

    const res = await request(buildApp())
      .post('/api/buy/mpesa')
      .set('Idempotency-Key', 'test-key-1')
      .send({ quoteId: 'quote-1', phone: VALID_PHONE, amount: 100 });

    expect(res.status).toBe(200);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(purchase.status).toBe('payment_initiated');
    expect(res.body.duplicate).toBeUndefined();
  });

  test('HTTP 200 with ResponseCode "1" is a refusal, not an initiated quote', async () => {
    // Safaricom answers 200 even when it will not deliver the push. Marking
    // that `payment_initiated` left the UI polling a quote forever and
    // reporting a cancellation the buyer never made.
    const purchase = {
      quoteId: 'quote-1b',
      status: 'pending',
      fiatAmount: 100,
      currency: 'KES',
      save: jest.fn().mockResolvedValue(undefined),
    };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);
    axios.get.mockResolvedValue({ data: { access_token: 'test-token' } });
    axios.post.mockResolvedValue({
      data: { ResponseCode: '1', ErrorMessage: 'Invalid Access Laptop MSISDN', errorCode: '40400' },
    });

    const res = await request(buildApp())
      .post('/api/buy/mpesa')
      .set('Idempotency-Key', 'test-key-1b')
      .send({ quoteId: 'quote-1b', phone: VALID_PHONE, amount: 100 });

    expect(res.status).toBe(400);
    // The raw Daraja text is kept as the trailing attribution, but the buyer
    // reads a merchant-side explanation first — this refusal was never theirs.
    expect(res.body.error).toMatch(/payment line was not reachable/i);
    expect(res.body.error).toContain('Invalid Access Laptop MSISDN');
    expect(purchase.status).toBe('pending');
    expect(purchase.reason).toMatch(/payment line was not reachable/i);
  });

  test('does NOT fire a second STK push for a quote already past pending (double-submit/retry)', async () => {
    const purchase = {
      quoteId: 'quote-2',
      status: 'payment_initiated',
      paymentId: 'chk-existing',
      fiatAmount: 100,
      currency: 'KES',
      save: jest.fn().mockResolvedValue(undefined),
    };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);

    const res = await request(buildApp())
      .post('/api/buy/mpesa')
      .set('Idempotency-Key', 'test-key-2')
      .send({ quoteId: 'quote-2', phone: VALID_PHONE, amount: 100 });

    expect(res.status).toBe(200);
    expect(axios.post).not.toHaveBeenCalled();
    expect(res.body.duplicate).toBe(true);
    expect(res.body.status).toBe('payment_initiated');
  });
});

describe('POST /api/buy/mpesa/callback — DLQ on processing failure', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enqueues the raw callback for retry when processing throws', async () => {
    processMpesaCallback.mockRejectedValue(new Error('mongo blip'));

    const res = await request(buildApp())
      .post('/api/buy/mpesa/callback')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'chk-1', ResultCode: 0 } } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ResultCode: 1 });
    expect(enqueueFailedCallback).toHaveBeenCalledWith(
      'mpesa',
      expect.objectContaining({ Body: expect.anything() })
    );
  });

  test('does not enqueue anything when processing succeeds', async () => {
    processMpesaCallback.mockResolvedValue({ ResultCode: 0 });

    const res = await request(buildApp())
      .post('/api/buy/mpesa/callback')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'chk-1', ResultCode: 0 } } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ResultCode: 0 });
    expect(enqueueFailedCallback).not.toHaveBeenCalled();
  });
});

// A client retry (timeout, double-tap) previously meant a second
// MallcoinPurchase reserved, or a second STK push fired, for the same
// buy intent — these lock in the Idempotency-Key requirement added to
// both routes to close that gap (same pattern already proven for
// withdraw.js's /mpesa in withdrawIdempotency.test.js).
describe('POST /api/buy/reserve idempotency', () => {
  const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
  const reserveBody = { walletAddress: VALID_ADDRESS, phone: VALID_PHONE, amount: 100, fiat: '160', currency: 'KES' };

  beforeEach(() => {
    jest.clearAllMocks();
    MallcoinPurchase.create.mockResolvedValue({ quoteId: 'q1', fiatAmount: 160, currency: 'KES' });
  });

  test('rejects a request with no Idempotency-Key header', async () => {
    const res = await request(buildApp()).post('/api/buy/reserve').send(reserveBody);

    expect(res.status).toBe(400);
    expect(MallcoinPurchase.create).not.toHaveBeenCalled();
  });

  test('a fresh key proceeds and reserves exactly one quote', async () => {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(buildApp())
      .post('/api/buy/reserve')
      .set('Idempotency-Key', 'reserve-key-1')
      .send(reserveBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(MallcoinPurchase.create).toHaveBeenCalledTimes(1);
  });

  test('a clean numeric-string fiat (what WalletBuy.tsx actually sends) is parsed correctly, not crashed on', async () => {
    // Regression: schemas.buyReserve's Joi alternatives() coerces a clean
    // numeric string like reserveBody's fiat: '160' into a real number —
    // the handler used to call fiat.replace(...) unconditionally, which
    // threw "fiat.replace is not a function" the instant fiat wasn't a
    // string, i.e. on every ordinary request as the real frontend sends it.
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(buildApp())
      .post('/api/buy/reserve')
      .set('Idempotency-Key', 'reserve-key-2')
      .send(reserveBody);

    expect(res.status).toBe(200);
    expect(MallcoinPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ fiatAmount: 160 })
    );
  });

  test('retrying the same key returns the cached response instead of reserving a second quote', async () => {
    IdempotencyKey.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        key: 'reserve-key-1',
        status: 'success',
        result: { ok: true, quoteId: 'q1' },
      }),
    });

    const res = await request(buildApp())
      .post('/api/buy/reserve')
      .set('Idempotency-Key', 'reserve-key-1')
      .send(reserveBody);

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(MallcoinPurchase.create).not.toHaveBeenCalled();
  });

  test('rejects a quote reserved for a wallet not linked to the authenticated account', async () => {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    User.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const res = await request(buildApp())
      .post('/api/buy/reserve')
      .set('Idempotency-Key', 'reserve-key-owner')
      .send(reserveBody);

    expect(res.status).toBe(403);
    expect(MallcoinPurchase.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/buy/mpesa idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a request with no Idempotency-Key header', async () => {
    const res = await request(buildApp())
      .post('/api/buy/mpesa')
      .send({ quoteId: 'quote-1', phone: VALID_PHONE, amount: 100 });

    expect(res.status).toBe(400);
    expect(MallcoinPurchase.findOne).not.toHaveBeenCalled();
  });

  test('retrying the same key returns the cached response instead of firing a second STK push', async () => {
    IdempotencyKey.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        key: 'mpesa-key-1',
        status: 'success',
        result: { success: true, paymentId: 'chk-1' },
      }),
    });

    const res = await request(buildApp())
      .post('/api/buy/mpesa')
      .set('Idempotency-Key', 'mpesa-key-1')
      .send({ quoteId: 'quote-1', phone: VALID_PHONE, amount: 100 });

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(MallcoinPurchase.findOne).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
