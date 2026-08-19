const request = require('supertest');
const express = require('express');

jest.mock('../models/MallPointAccount', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
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
// mallpoints.js also pulls in mallcoinService/liquidityController for the
// /convert route's live pricing + liquidity wiring — mock them so requiring
// the router here doesn't transitively load liquidityController's real
// dexTxBuilder -> @cosmjs/stargate chain (that package ships ESM-only
// sources that Jest's CommonJS transform can't parse).
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn(),
}));
jest.mock('../controllers/liquidityController', () => ({
  addLiquidityToPool: jest.fn(),
}));
jest.mock('../services/liquidityActivityService', () => ({
  recordLiquidityActivity: jest.fn(),
}));
// Same ESM/argon2 issue as above, one level deeper: verifyAdr036 (the
// /convert wallet-signature check) requires @cosmjs/amino directly.
jest.mock('../mallwallet/security/verifyAdr036', () => ({
  verifyConvertSignature: jest.fn(),
}));

const MallPointAccount = require('../models/MallPointAccount');
const mallpointsRouter = require('../routes/mallpoints');

describe('POST /api/mallpoints/award', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mallpoints', mallpointsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MALLPOINT_AWARD_FIAT;
    delete process.env.MALLPOINT_PRICE_KES;
  });

  test('ignores a caller-supplied amount and always uses the server-computed award', async () => {
    MallPointAccount.findOne.mockResolvedValue(null);
    MallPointAccount.create.mockResolvedValue({ balance: 17.495 });

    const res = await request(app)
      .post('/api/mallpoints/award')
      .send({ address: 'mall1attacker', amount: 999999999 });

    expect(res.status).toBe(200);
    // Default: 34.99 KES / 2 KES per point = 17.495 points, NOT 999999999.
    expect(MallPointAccount.create).toHaveBeenCalledWith({ address: 'mall1attacker', balance: 17.495 });
    expect(res.body.awardedPoints).toBe(17.495);
  });

  test('respects MALLPOINT_AWARD_FIAT / MALLPOINT_PRICE_KES env overrides', async () => {
    process.env.MALLPOINT_AWARD_FIAT = '100';
    process.env.MALLPOINT_PRICE_KES = '4';
    MallPointAccount.findOne.mockResolvedValue(null);
    MallPointAccount.create.mockResolvedValue({ balance: 25 });

    const res = await request(app).post('/api/mallpoints/award').send({ address: 'mall1newuser' });

    expect(res.status).toBe(200);
    expect(MallPointAccount.create).toHaveBeenCalledWith({ address: 'mall1newuser', balance: 25 });
  });

  test('is idempotent per address regardless of a repeated amount claim', async () => {
    MallPointAccount.findOne.mockResolvedValue({ balance: 17.495 });

    const res = await request(app)
      .post('/api/mallpoints/award')
      .send({ address: 'mall1newuser', amount: 500 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('already awarded');
    expect(MallPointAccount.create).not.toHaveBeenCalled();
  });

  test('rejects a request missing an address', async () => {
    const res = await request(app).post('/api/mallpoints/award').send({ amount: 500 });

    expect(res.status).toBe(400);
    expect(MallPointAccount.create).not.toHaveBeenCalled();
  });
});
