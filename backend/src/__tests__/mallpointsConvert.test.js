// Regression coverage for POST /api/mallpoints/convert:
// 1. The conversion rate bug — it used to fetch the live MLCNS price and
//    then ignore it, hardcoding 1 MLPTS = 1 MLCNS regardless of the
//    established baseline (1 MLPTS = KSh 2, 1 MLCNS ~= KSh 0.60-0.62).
// 2. Newly-minted MLCNS from a conversion must feed the same MLCN/KES
//    liquidity pool a fiat buy does, since Mallpoints conversion is the
//    other permanent MLCNS-acquisition path (see buyGateService.js).
const request = require('supertest');
const express = require('express');

jest.mock('../models/MallPointAccount', () => ({
  findOne: jest.fn(),
}));
jest.mock('../services/mallpointsService', () => ({
  getChainUserPoints: jest.fn(),
  getConversionWindow: jest.fn(),
  mergePoints: jest.fn(),
  buildConversionStatus: jest.fn(),
}));
jest.mock('../services/badgeService', () => ({
  getUserBadgeInfo: jest.fn(),
}));
jest.mock('../services/faucetService', () => ({
  creditMlcns: jest.fn(),
}));
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn(),
}));
jest.mock('../controllers/liquidityController', () => ({
  addLiquidityToPool: jest.fn(),
}));
jest.mock('../services/liquidityActivityService', () => ({
  recordLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));

const MallPointAccount = require('../models/MallPointAccount');
const { buildConversionStatus } = require('../services/mallpointsService');
const { getUserBadgeInfo } = require('../services/badgeService');
const { creditMlcns } = require('../services/faucetService');
const { getMarketPrice } = require('../services/mallcoinService');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { recordLiquidityActivity } = require('../services/liquidityActivityService');
const mallpointsRouter = require('../routes/mallpoints');

describe('POST /api/mallpoints/convert', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mallpoints', mallpointsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MALLPOINT_PRICE_KES;
    getUserBadgeInfo.mockResolvedValue({ exists: false });
    buildConversionStatus.mockReturnValue({ canConvert: true, reason: null });
  });

  function mockAccount(balance) {
    const acc = { balance, lastConversionAt: null, save: jest.fn().mockResolvedValue(undefined) };
    MallPointAccount.findOne.mockResolvedValue(acc);
    return acc;
  }

  test('converts using the live MLCNS price, not a flat 1:1 rate', async () => {
    mockAccount(100); // 100 MLPTS
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.625 }); // MLCNS price
    creditMlcns.mockResolvedValue({ txHash: '0xabc' });
    addLiquidityToPool.mockResolvedValue({ lpTokens: 5 });

    const res = await request(app).post('/api/mallpoints/convert').send({ address: 'mall1user' });

    expect(res.status).toBe(200);
    // 100 MLPTS * 2 KES/MLPTS = 200 KES; 200 / 0.625 = 320 MLCNS. NOT 100 (1:1).
    expect(res.body.mallcoins).toBe(320);
    expect(res.body.mallcoins).not.toBe(100);
    expect(creditMlcns).toHaveBeenCalledWith('mall1user', 320);
  });

  test('adds liquidity to pool 2 with the credited MLCNS and the KES value of points spent', async () => {
    mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockResolvedValue({ txHash: '0xdef' });
    addLiquidityToPool.mockResolvedValue({ lpTokens: 3 });

    const res = await request(app).post('/api/mallpoints/convert').send({ address: 'mall1user' });

    expect(res.status).toBe(200);
    // 50 MLPTS * 2 KES = 100 KES value; mlcoins = 100 / 0.6 = 166.666667
    expect(addLiquidityToPool).toHaveBeenCalledWith({
      poolId: 2,
      amount0: res.body.mallcoins,
      amount1: 100,
      userAddress: 'mall1user',
    });
    expect(recordLiquidityActivity).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'mallpoints_convert', stage: 'liquidity_added', status: 'success' })
    );
  });

  test('a liquidity-add failure does not undo the already-successful MLCNS credit', async () => {
    mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockResolvedValue({ txHash: '0xdef' });
    addLiquidityToPool.mockRejectedValue(new Error('pool unavailable'));

    const res = await request(app).post('/api/mallpoints/convert').send({ address: 'mall1user' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.credit).toEqual({ txHash: '0xdef' });
    expect(recordLiquidityActivity).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'mallpoints_convert', stage: 'liquidity_add_failed', status: 'failed' })
    );
  });

  test('rejects when the conversion window is closed', async () => {
    mockAccount(50);
    buildConversionStatus.mockReturnValue({ canConvert: false, reason: 'not yet' });

    const res = await request(app).post('/api/mallpoints/convert').send({ address: 'mall1user' });

    expect(res.status).toBe(400);
    expect(creditMlcns).not.toHaveBeenCalled();
    expect(addLiquidityToPool).not.toHaveBeenCalled();
  });

  test('restores the points balance if the MLCNS credit itself fails', async () => {
    const acc = mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockRejectedValue(new Error('faucet down'));

    const res = await request(app).post('/api/mallpoints/convert').send({ address: 'mall1user' });

    expect(res.status).toBe(502);
    expect(acc.balance).toBe(50); // restored after being decremented
    expect(addLiquidityToPool).not.toHaveBeenCalled();
  });
});
