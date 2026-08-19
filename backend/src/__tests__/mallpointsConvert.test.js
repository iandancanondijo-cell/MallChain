// Regression coverage for POST /api/mallpoints/convert:
// 1. The conversion rate bug — it used to fetch the live MLCNS price and
//    then ignore it, hardcoding 1 MLPTS = 1 MLCNS regardless of the
//    established baseline (1 MLPTS = KSh 2, 1 MLCNS ~= KSh 0.60-0.62).
// 2. Newly-minted MLCNS from a conversion must feed the same MLCN/KES
//    liquidity pool a fiat buy does, since Mallpoints conversion is the
//    other permanent MLCNS-acquisition path (see buyGateService.js).
// 3. The route requires an ADR-036 wallet signature proving control of
//    `address` (see mallwallet/security/verifyAdr036.js) — without it,
//    anyone who knew an address with a badge + balance could force a real
//    operator-signed MLCNS credit + liquidity-add for it.
//
// verifyAdr036 itself is mocked here (not exercised with real crypto) for
// the same reason faucetService.test.js mocks @cosmjs/proto-signing:
// @cosmjs/crypto@0.39's argon2 support pulls in an ESM-only transitive
// dependency Jest's default CJS resolution can't parse — and unlike a
// service that only *uses* the offending package, verifyAdr036.js itself
// requires @cosmjs/amino at module scope, so Jest can't load the real file
// at all (mocked or not, any test importing it — even to test it directly
// — hits the same parse error). Its actual signature-verification math
// (valid signature accepted, wrong-address replay rejected, tampered
// signature rejected, missing fields rejected) was verified manually with
// a real @cosmjs/amino wallet outside Jest; these tests cover the route's
// wiring instead: does it call verifyConvertSignature with the right
// arguments, and does it actually gate on the result.
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
jest.mock('../mallwallet/security/verifyAdr036', () => ({
  verifyConvertSignature: jest.fn(),
}));

const MallPointAccount = require('../models/MallPointAccount');
const { buildConversionStatus } = require('../services/mallpointsService');
const { getUserBadgeInfo } = require('../services/badgeService');
const { creditMlcns } = require('../services/faucetService');
const { getMarketPrice } = require('../services/mallcoinService');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { recordLiquidityActivity } = require('../services/liquidityActivityService');
const { verifyConvertSignature } = require('../mallwallet/security/verifyAdr036');
const mallpointsRouter = require('../routes/mallpoints');

const address = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const validBody = { address, timestamp: new Date().toISOString(), pubKey: 'fake-pubkey-b64', signature: 'fake-signature-b64' };

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
    verifyConvertSignature.mockReturnValue(true);
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

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(200);
    // 100 MLPTS * 2 KES/MLPTS = 200 KES; 200 / 0.625 = 320 MLCNS. NOT 100 (1:1).
    expect(res.body.mallcoins).toBe(320);
    expect(res.body.mallcoins).not.toBe(100);
    expect(creditMlcns).toHaveBeenCalledWith(address, 320);
  });

  test('adds liquidity to pool 2 with the credited MLCNS and the KES value of points spent', async () => {
    mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockResolvedValue({ txHash: '0xdef' });
    addLiquidityToPool.mockResolvedValue({ lpTokens: 3 });

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(200);
    // 50 MLPTS * 2 KES = 100 KES value; mlcoins = 100 / 0.6 = 166.666667
    expect(addLiquidityToPool).toHaveBeenCalledWith({
      poolId: 2,
      amount0: res.body.mallcoins,
      amount1: 100,
      userAddress: address,
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

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

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

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(400);
    expect(creditMlcns).not.toHaveBeenCalled();
    expect(addLiquidityToPool).not.toHaveBeenCalled();
  });

  test('restores the points balance if the MLCNS credit itself fails', async () => {
    const acc = mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockRejectedValue(new Error('faucet down'));

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(502);
    expect(acc.balance).toBe(50); // restored after being decremented
    expect(addLiquidityToPool).not.toHaveBeenCalled();
  });

  describe('wallet-ownership signature requirement', () => {
    test('rejects a request missing any signature field, without even checking the balance', async () => {
      mockAccount(50);

      const res = await request(app).post('/api/mallpoints/convert').send({ address });

      expect(res.status).toBe(401);
      expect(verifyConvertSignature).not.toHaveBeenCalled();
      expect(MallPointAccount.findOne).not.toHaveBeenCalled();
      expect(creditMlcns).not.toHaveBeenCalled();
    });

    test('rejects an expired timestamp before even attempting verification', async () => {
      mockAccount(50);
      const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min old

      const res = await request(app)
        .post('/api/mallpoints/convert')
        .send({ ...validBody, timestamp: staleTimestamp });

      expect(res.status).toBe(401);
      expect(verifyConvertSignature).not.toHaveBeenCalled();
      expect(creditMlcns).not.toHaveBeenCalled();
    });

    test('rejects when verifyConvertSignature reports the signature invalid', async () => {
      mockAccount(50);
      verifyConvertSignature.mockReturnValue(false);

      const res = await request(app).post('/api/mallpoints/convert').send(validBody);

      expect(res.status).toBe(401);
      expect(creditMlcns).not.toHaveBeenCalled();
    });

    test('verifies against the claimed address/timestamp/pubKey/signature, not just presence', async () => {
      mockAccount(50);
      getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
      creditMlcns.mockResolvedValue({ txHash: '0xok' });
      addLiquidityToPool.mockResolvedValue({ lpTokens: 1 });

      await request(app).post('/api/mallpoints/convert').send(validBody);

      expect(verifyConvertSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          address: validBody.address,
          timestamp: validBody.timestamp,
          pubKeyBase64: validBody.pubKey,
          signatureBase64: validBody.signature,
        })
      );
    });

    test('a valid signature is accepted and the conversion proceeds', async () => {
      mockAccount(50);
      getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
      creditMlcns.mockResolvedValue({ txHash: '0xok' });
      addLiquidityToPool.mockResolvedValue({ lpTokens: 1 });

      const res = await request(app).post('/api/mallpoints/convert').send(validBody);

      expect(res.status).toBe(200);
      expect(creditMlcns).toHaveBeenCalled();
    });
  });
});
