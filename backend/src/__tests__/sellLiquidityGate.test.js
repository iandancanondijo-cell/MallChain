const request = require('supertest');
const express = require('express');

// POST /api/buy/sell must fail closed when it can't determine the sale's
// KES value: checkSellLiquidity(0) always passes (0 is never > a reserve),
// so a failed price fetch silently defaulting to 0 KES completely bypassed
// the liquidity gate right when pool state is least trustworthy.

jest.mock('../models/MalicoinPurchase', () => ({ create: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/MalicoinSale', () => ({ create: jest.fn() }));
jest.mock('../models/B2CPayout', () => ({ create: jest.fn() }));
jest.mock('../models/WithdrawalRequest', () => ({ create: jest.fn() }));
jest.mock('../models/LiquidityReconciliation', () => ({ create: jest.fn(), findOne: jest.fn() }));
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
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn(),
}));
jest.mock('../utils/circuitBreaker', () => ({
  createBlockchainBreaker: () => ({ fire: jest.fn(), execute: jest.fn() }),
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
  },
}));

const MallcoinSale = require('../models/MalicoinSale');
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

  test('still enforces the liquidity check with a real price', async () => {
    getMarketPrice.mockResolvedValue({ sellPriceKes: 0.6 });
    checkSellLiquidity.mockResolvedValue({ ok: false, error: 'Insufficient pool liquidity' });

    const res = await request(app).post('/api/buy/sell').send(body);

    expect(res.status).toBe(409);
    expect(checkSellLiquidity).toHaveBeenCalledWith(1000 * 0.6);
    expect(MallcoinSale.create).not.toHaveBeenCalled();
  });
});
