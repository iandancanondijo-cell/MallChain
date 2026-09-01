const request = require('supertest');
const express = require('express');

jest.mock('../models/MallcoinPurchase', () => ({ create: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/MallcoinSale', () => ({
  create: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, save: () => Promise.resolve() })),
}));
jest.mock('../models/B2CPayout', () => ({ create: jest.fn() }));
jest.mock('../models/WithdrawalRequest', () => ({
  create: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, save: () => Promise.resolve() })),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  }),
}));
jest.mock('../models/WithdrawalAmlReview', () => ({ findByIdAndUpdate: jest.fn() }));
jest.mock('../models/LiquidityReconciliation', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('../controllers/liquidityController', () => ({
  addLiquidityToPool: jest.fn(),
  fetchPoolsFromBlockchain: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/b2cPayoutService', () => ({ initiateB2CPayout: jest.fn(), handlePayoutCallback: jest.fn() }));
jest.mock('../services/sellBurnService', () => ({ executeSellBurnWorkflow: jest.fn() }));
jest.mock('../services/sellExecutionService', () => ({
  executeSellSettlement: jest.fn().mockResolvedValue({ status: 200, body: { ok: true } }),
}));
jest.mock('../services/withdrawalLiquidityQueueService', () => ({
  holdForLiquidity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/withdrawalAmlGateService', () => ({
  requireApprovedAmlReview: jest.fn().mockResolvedValue({ ok: true }),
  checkAndFlagStructuring: jest.fn().mockResolvedValue(undefined),
  AML_WITHDRAWAL_THRESHOLD_KES: 150000,
}));
jest.mock('../services/withdrawalMinimumService', () => ({
  checkMinimumWithdrawal: jest.fn().mockImplementation((v) => ({ ok: true, minimumKes: 100, shortfallKes: 0, estimatedKes: v })),
}));
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
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn(),
}));
jest.mock('../mallwallet/queue/paymentCallbackQueue', () => ({
  enqueueFailedCallback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../middleware/rateLimiter', () => ({
  limiters: new Proxy(
    {},
    { get: () => (_req, _res, next) => next() },
  ),
}));
jest.mock('../middleware/idempotency', () => jest.fn(() => (_req, _res, next) => next()));
jest.mock('../middleware/verifyWebhookToken', () => (_req, _res, next) => next());
jest.mock('../middleware/validation', () => ({
  validate: (_schema) => (req, _res, next) => {
    req.validatedBody = req.body;
    next();
  },
  schemas: {},
}));
jest.mock('../utils/circuitBreaker', () => ({
  createBlockchainBreaker: () => ({ fire: jest.fn(), execute: (fn) => fn() }),
  createPaymentBackoff: () => ({ execute: (fn) => fn() }),
}));
jest.mock('../services/mpesaCallbackService', () => ({ processMpesaCallback: jest.fn() }));
jest.mock('../models/user', () => jest.fn());
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
  },
}));

const MallcoinSale = require('../models/MallcoinSale');
const { checkSellLiquidity } = require('../services/sellGateService');
const { getMarketPrice } = require('../services/mallcoinService');
const buyRoutes = require('../routes/buy');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/buy', buyRoutes);
  return app;
}

describe('POST /api/buy/sell liquidity gate', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  const body = {
    sellerAddress: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
    amount: 1000,
    txBytes: Buffer.from('fake-tx').toString('base64'),
    phone: '254712345678',
  };

  test('blocks the sale when the market price is unavailable instead of treating it as worth 0 KES', async () => {
    getMarketPrice.mockRejectedValue(new Error('chain unreachable'));

    const res = await request(app).post('/api/buy/sell').send(body);

    expect(res.status).toBe(503);
    expect(checkSellLiquidity).not.toHaveBeenCalled();
    expect(MallcoinSale.create).not.toHaveBeenCalled();
  });

  test('still enforces the liquidity check with a real price and queues instead of rejecting outright when temporarily insufficient', async () => {
    getMarketPrice.mockResolvedValue({ sellPriceKes: 0.6 });
    checkSellLiquidity.mockResolvedValue({ ok: false, reserveKes: 400_000, error: 'Insufficient pool liquidity' });
    const { holdForLiquidity } = require('../services/withdrawalLiquidityQueueService');

    const res = await request(app).post('/api/buy/sell').send(body);

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.queued).toBe(true);
    expect(res.body.code).toBe('queued_liquidity');
    expect(checkSellLiquidity).toHaveBeenCalledWith(1000 * 0.6);
    expect(MallcoinSale.create).toHaveBeenCalled();
    expect(holdForLiquidity).toHaveBeenCalledTimes(1);
    expect(holdForLiquidity).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedKes: 600, reserveKes: 400_000, txBytes: body.txBytes }),
    );
  });
});
