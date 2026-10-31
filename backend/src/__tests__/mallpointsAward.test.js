// The award/signup-bonus endpoint was deliberately disabled (see task
// "Remove Mallpoints award/signup bonus endpoint"): Mallpoints must be
// acquired via M-Pesa purchase or mining, so POST /award now returns 410
// unconditionally — including to callers who try to claim a caller-supplied
// amount.
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
// mallpoints.js also pulls in mallcoinService for the /convert route's live
// pricing — mock it so requiring the router here doesn't transitively load
// real chain-facing packages (ESM-only sources Jest's CJS transform can't
// parse).
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn(),
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

describe('POST /api/mallpoints/award (disabled endpoint)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mallpoints', mallpointsRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns 410 Gone regardless of the request body', async () => {
    const res = await request(app).post('/api/mallpoints/award').send({ address: 'mall1anyone' });

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/disabled/i);
  });

  test('a caller-supplied amount cannot resurrect the award', async () => {
    const res = await request(app)
      .post('/api/mallpoints/award')
      .send({ address: 'mall1attacker', amount: 999999999 });

    expect(res.status).toBe(410);
    expect(MallPointAccount.create).not.toHaveBeenCalled();
  });
});
