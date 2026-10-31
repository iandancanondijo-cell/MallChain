// Regression coverage for POST /api/mallpoints/convert:
// 1. The conversion rate bug — it used to fetch the live MLCNS price and
//    then ignore it, hardcoding 1 MLPTS = 1 MLCNS regardless of the
//    established baseline (1 MLPTS = KSh 2, 1 MLCNS ~= KSh 0.60-0.62).
// 2. Liquidity bookkeeping — the pool is the credited-purchase ledger (see
//    liquidityController.fetchLedgerPoolReserves), so a conversion must
//    settle its liquidity bookkeeping without attempting the impossible
//    operator-signed MsgAddLiquidity (unfunded operator account; MLCNS is
//    an internal-ledger token the bank-coin dex can't hold) that used to
//    dead-letter every conversion into the convert-liquidity DLQ.
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

// The /convert handler debits balances inside a real Mongo transaction
// (mongoose.startSession → withTransaction). With no mongoose connection in
// the test process, commitTransaction buffers until timeout — fake the
// session layer to just run the transaction body. Everything else stays real.
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    startSession: jest.fn(() => ({
      withTransaction: jest.fn(async (fn) => { await fn(); }),
      endSession: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('../models/MallPointAccount', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
// The /convert handler debits User.mlpts_balance inside the same Mongo
// transaction as the MallPointAccount debit — the real model would buffer
// against a never-connected mongoose instance and time the test out.
jest.mock('../models/user', () => ({
  findOne: jest.fn(() => ({ session: jest.fn(() => Promise.resolve(null)) })),
  updateOne: jest.fn().mockResolvedValue({}),
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
  // (100 MLPTS * 2 KES/MLPTS) / 0.625 KES/MLCN = 320 MLCNS
  // ratio math: mlcns = (points * fixed) / scale → 320 = (100 * fixed) / 1e6 → fixed = 3,200,000
  getChainParams: jest.fn().mockResolvedValue({
    source: 'onchain',
    mlpts_per_mlcns: '3200000', // 3.2 MLPTS per 1 MLCNS
  }),
  getMlptsPerMlcnsScale: jest.fn().mockReturnValue(1000000),
  mlptsPerMlcnsToNumber: jest.fn().mockImplementation((s) => Number(s) / 1000000),
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
const { recordLiquidityActivity } = require('../services/liquidityActivityService');
const { verifyConvertSignature } = require('../mallwallet/security/verifyAdr036');
const mallpointsRouter = require('../routes/mallpoints');

const address = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const validBody = { address, timestamp: new Date().toISOString(), pubKey: 'fake-pubkey-b64', signature: 'fake-signature-b64' };

describe('POST /api/mallpoints/convert', () => {
  let app;

  const ORIGINAL_TEST_MODE = process.env.TEST_MODE;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mallpoints', mallpointsRouter);
  });

  afterAll(() => {
    // process.env is a real Node global shared by every test file a Jest
    // worker happens to reuse — restore it rather than leave TEST_MODE
    // permanently 'true' for whatever file runs next in this worker.
    if (ORIGINAL_TEST_MODE === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = ORIGINAL_TEST_MODE;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MALLPOINT_PRICE_KES;
    // routes/mallpoints.js's /convert handler only skips its real Redis-
    // backed signature-replay guard (SET NX against
    // adr036_consumed:convert:<sig>) when TEST_MODE==='true' — without
    // this, every test here that reuses the same fixed fake `signature`
    // from validBody would hit a REAL Redis instance if one happens to be
    // reachable in the environment, and the second+ test to use it would
    // get rejected as a replay ("signature already used"). That made this
    // suite's pass/fail depend on whether a real Redis was running
    // wherever it happened to execute, rather than on the code under test.
    process.env.TEST_MODE = 'true';
    getUserBadgeInfo.mockResolvedValue({ exists: false });
    buildConversionStatus.mockReturnValue({ canConvert: true, reason: null });
    verifyConvertSignature.mockReturnValue(true);
  });

  function mockAccount(balance) {
    const acc = { balance, lastConversionAt: null, save: jest.fn().mockResolvedValue(undefined) };
    MallPointAccount.findOne.mockResolvedValue(acc);
    // The transactional debit must find a matching row or the route 400s.
    MallPointAccount.findOneAndUpdate.mockResolvedValue({ address: 'mall1x', balance: balance - 1 });
    return acc;
  }

  test('converts using the live MLCNS price, not a flat 1:1 rate', async () => {
    mockAccount(100); // 100 MLPTS
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.625 }); // MLCNS price
    creditMlcns.mockResolvedValue({ txHash: '0xabc' });

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(200);
    // 100 MLPTS * 2 KES/MLPTS = 200 KES; 200 / 0.625 = 320 MLCNS. NOT 100 (1:1).
    expect(res.body.mallcoins).toBe(320);
    expect(res.body.mallcoins).not.toBe(100);
    expect(creditMlcns).toHaveBeenCalledWith(address, 320);
  });

  test('settles liquidity bookkeeping via the ledger instead of an on-chain add', async () => {
    mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockResolvedValue({ txHash: '0xdef' });

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.liquidity).toEqual({ ledgerTracked: true });
    expect(recordLiquidityActivity).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'mallpoints_convert', stage: 'liquidity_settled', status: 'success' })
    );
  });

  test('rejects when the conversion window is closed', async () => {
    mockAccount(50);
    buildConversionStatus.mockReturnValue({ canConvert: false, reason: 'not yet' });

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(400);
    expect(creditMlcns).not.toHaveBeenCalled();
    expect(recordLiquidityActivity).not.toHaveBeenCalled();
  });

  test('restores the points balance if the MLCNS credit itself fails', async () => {
    const acc = mockAccount(50);
    getMarketPrice.mockResolvedValue({ midPriceKes: 0.6 });
    creditMlcns.mockRejectedValue(new Error('faucet down'));

    const res = await request(app).post('/api/mallpoints/convert').send(validBody);

    expect(res.status).toBe(502);
    expect(acc.balance).toBe(50); // restored after being decremented
    expect(recordLiquidityActivity).not.toHaveBeenCalled();
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

      const res = await request(app).post('/api/mallpoints/convert').send(validBody);

      expect(res.status).toBe(200);
      expect(creditMlcns).toHaveBeenCalled();
    });
  });
});
