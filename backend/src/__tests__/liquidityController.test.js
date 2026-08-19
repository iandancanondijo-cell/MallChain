// Regression coverage for the liquidity controller (previously 0% covered,
// the largest of three zero-coverage controllers hardened in this pass).
//
// Two real bugs were found and fixed while writing these tests:
//
// 1. `fetchPoolsFromBlockchain` was not in module.exports, even though
//    routes/adminPanel.js's POST /api/admin/reconcile calls
//    `liquidityController.fetchPoolsFromBlockchain()` directly — every
//    reconcile request threw "... is not a function" and 500'd. Fixed by
//    adding it to the export list.
// 2. POST /api/liquidity/add and /remove (routes/liquidity.js) had no auth
//    middleware. /add signs and broadcasts a REAL on-chain MsgAddLiquidity
//    funded by the server's own OPERATOR_MNEMONIC — unlike client-signed
//    flows (staking broadcast, send), the caller never proves ownership of
//    any funds, so anyone could call this repeatedly to drain the operator
//    wallet's balance/gas for free. Fixed by requiring the standard `auth`
//    JWT middleware on both routes (matches the pattern used by
//    kyc/settings/devhub/etc.). The internal `addLiquidityToPool` export
//    used directly by routes/buy.js's automated post-purchase flow is
//    unaffected since it's called as a plain function, not over HTTP.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const CHAIN_REST = 'http://localhost:1317';

function mockChainResponses(axios, { buyPrice = 120, sellPrice = 100, reserve0Raw = '5000000', reserve1Raw = '3000000', trades = [] } = {}) {
  axios.get.mockImplementation((url) => {
    if (url.includes('/tmp/marketplace/mlcoin/v1/market/price')) {
      return Promise.resolve({ data: { market_price: { buy_price: buyPrice, sell_price: sellPrice } } });
    }
    if (url.includes('/cosmos/bank/v1beta1/balances/mall1pool')) {
      return Promise.resolve({
        data: { balances: [{ denom: 'umlcn', amount: reserve0Raw }, { denom: 'umal', amount: reserve1Raw }] },
      });
    }
    if (url.includes('/tmp/marketplace/mlcoin/v1/market/trades')) {
      return Promise.resolve({ data: { trades } });
    }
    return Promise.reject(new Error(`unexpected chain url: ${url}`));
  });
}

describe('liquidity controller / routes', () => {
  let app;
  let axios;
  let dexTxBuilder;
  let User;
  let ctrl;
  let authToken;

  beforeEach(() => {
    jest.resetModules();

    process.env.CHAIN_REST_URL = CHAIN_REST;
    process.env.POOL_ACCOUNT_ADDRESS = 'mall1pool';
    process.env.OPERATOR_MNEMONIC = 'test operator mnemonic words';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

    jest.doMock('axios');
    jest.doMock('../services/dexTxBuilder', () => ({
      getAddressFromMnemonic: jest.fn().mockResolvedValue('mall1operator'),
      toBaseUnits: jest.fn((amount, decimals) => String(Math.round(Number(amount) * 10 ** (decimals || 6)))),
      addLiquidityOnChain: jest.fn().mockResolvedValue({
        txHash: 'TXHASH1',
        height: 100,
        events: [],
      }),
    }));
    jest.doMock('../models/user', () => ({ findById: jest.fn() }));

    axios = require('axios');
    dexTxBuilder = require('../services/dexTxBuilder');
    User = require('../models/user');
    ctrl = require('../controllers/liquidityController');
    const liquidityRoutes = require('../routes/liquidity');

    mockChainResponses(axios);

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', email: 'trader@x.com', role: 'user', banned: false }),
    });
    authToken = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    app = express();
    app.use(express.json());
    app.use('/api/liquidity', liquidityRoutes);
  });

  describe('GET /pools', () => {
    test('fetches fresh pool data from the chain and computes TVL/reserves', async () => {
      const res = await request(app).get('/api/liquidity/pools');

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(false);
      const pool = res.body.pools[0];
      expect(pool.reserve0).toBe(5);
      expect(pool.reserve1).toBe(3);
      expect(pool.priceMlcn).toBeCloseTo(1.1);
      expect(pool.tvl).toBe(9); // (5*1.1 + 3*1.0) = 8.5 -> rounds to 9
      expect(pool.totalLiquidity).toBe(8);
      expect(pool.blockchainSource).toBe(true);
    });

    test('serves the second request from cache without hitting the chain again', async () => {
      await request(app).get('/api/liquidity/pools');
      const callsAfterFirst = axios.get.mock.calls.length;

      const res = await request(app).get('/api/liquidity/pools');

      expect(res.body.cached).toBe(true);
      expect(res.body.source).toBe('cache');
      expect(axios.get.mock.calls.length).toBe(callsAfterFirst);
    });

    test('sums 24h trade value (kes_amount) into volume24h', async () => {
      const nowSec = Date.now() / 1000;
      mockChainResponses(axios, {
        trades: [
          { timestamp: nowSec - 100, kes_amount: '500' },
          { timestamp: nowSec - 90000, kes_amount: '999' }, // older than 24h, excluded
        ],
      });

      const res = await request(app).get('/api/liquidity/pools');

      expect(res.body.pools[0].volume24h).toBe(500);
    });
  });

  describe('GET /pools/:poolId', () => {
    test('returns the pool for a known id', async () => {
      const res = await request(app).get('/api/liquidity/pools/2');
      expect(res.status).toBe(200);
      expect(res.body.pool.name).toBe('MLCN/KES');
    });

    test('404s for an unknown pool id', async () => {
      const res = await request(app).get('/api/liquidity/pools/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Pool not found');
    });
  });

  describe('POST /add (requires auth)', () => {
    test('rejects an unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/liquidity/add')
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      expect(res.status).toBe(401);
      expect(dexTxBuilder.addLiquidityOnChain).not.toHaveBeenCalled();
    });

    test('400s when poolId is missing', async () => {
      const res = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount0: 10, amount1: 20, userAddress: 'mall1user' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/poolId/);
    });

    test('400s when amounts are missing', async () => {
      const res = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, userAddress: 'mall1user' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/amount0 and amount1/);
    });

    test('500s with a clear message when OPERATOR_MNEMONIC is not configured', async () => {
      delete process.env.OPERATOR_MNEMONIC;

      const res = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      expect(res.status).toBe(500);
      expect(res.body.details).toMatch(/OPERATOR_MNEMONIC/);
    });

    test('adds liquidity on-chain and updates the in-memory pool/user position', async () => {
      const res = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.txHash).toBe('TXHASH1');
      expect(dexTxBuilder.addLiquidityOnChain).toHaveBeenCalledTimes(1);

      // reserves started at 5/3 (from mocked chain balances) and should now
      // reflect the added 10/20
      expect(res.body.pool.reserve0).toBeCloseTo(15);
      expect(res.body.pool.reserve1).toBeCloseTo(23);
      expect(Number(res.body.lpTokens)).toBeCloseTo(Math.sqrt(10 * 20), 5);
      expect(Number(res.body.userPosition)).toBeCloseTo(Math.sqrt(10 * 20), 5);
      // The pool starts with totalLiquidity = 8 (reserve0 5 + reserve1 3,
      // from the mocked chain balances), so the new LP tokens are a share
      // of (8 + sqrt(200)), not 100%.
      const expectedTotalLiquidity = 5 + 3 + Math.sqrt(10 * 20);
      const expectedShare = ((Math.sqrt(10 * 20) / expectedTotalLiquidity) * 100).toFixed(2);
      expect(res.body.shareOfPool).toBe(expectedShare);
    });
  });

  describe('POST /remove (requires auth)', () => {
    test('rejects an unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/liquidity/remove')
        .send({ poolId: 2, lpTokens: 1, userAddress: 'mall1user' });

      expect(res.status).toBe(401);
    });

    test('404s for an unknown pool', async () => {
      const res = await request(app)
        .post('/api/liquidity/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 999, lpTokens: 1, userAddress: 'mall1user' });

      expect(res.status).toBe(404);
    });

    test('400s when the user has no liquidity in the pool', async () => {
      const res = await request(app)
        .post('/api/liquidity/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, lpTokens: 1, userAddress: 'mall1nobody' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No liquidity found for user');
    });

    test('400s for out-of-range slippage', async () => {
      await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      const res = await request(app)
        .post('/api/liquidity/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, lpTokens: 1, userAddress: 'mall1user', slippage: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/slippage/);
    });

    test('400s when requesting more LP tokens than the user holds', async () => {
      await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      const res = await request(app)
        .post('/api/liquidity/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, lpTokens: 999999, userAddress: 'mall1user' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient liquidity to remove');
    });

    test('removes a partial position and returns proportional amounts', async () => {
      const addRes = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });
      const fullLp = Number(addRes.body.lpTokens);
      const halfLp = fullLp / 2;

      // Reserves start at 5/3 (mocked chain balances) and go to 15/23 after
      // the add above; totalLiquidity goes from 8 to 8 + fullLp.
      const totalLiquidityAfterAdd = 5 + 3 + fullLp;
      const shareRatio = halfLp / totalLiquidityAfterAdd;
      const expectedAmount0 = 15 * shareRatio;
      const expectedAmount1 = 23 * shareRatio;

      const res = await request(app)
        .post('/api/liquidity/remove')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, lpTokens: halfLp, userAddress: 'mall1user' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.amountReceived0)).toBeCloseTo(expectedAmount0, 4);
      expect(Number(res.body.amountReceived1)).toBeCloseTo(expectedAmount1, 4);
      expect(Number(res.body.remainingPosition)).toBeCloseTo(halfLp, 5);
    });
  });

  describe('GET /position', () => {
    test('400s when poolId or userAddress is missing', async () => {
      const res = await request(app).get('/api/liquidity/position').query({ poolId: 2 });
      expect(res.status).toBe(400);
    });

    test('returns a zeroed-out position for a user with no liquidity', async () => {
      const res = await request(app)
        .get('/api/liquidity/position')
        .query({ poolId: 2, userAddress: 'mall1nobody' });

      expect(res.status).toBe(200);
      expect(res.body.lpTokens).toBe('0.000000');
      expect(res.body.shareOfPool).toBe('0.00');
    });

    test('reflects a real position after adding liquidity', async () => {
      const addRes = await request(app)
        .post('/api/liquidity/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ poolId: 2, amount0: 10, amount1: 20, userAddress: 'mall1user' });

      const res = await request(app)
        .get('/api/liquidity/position')
        .query({ poolId: 2, userAddress: 'mall1user' });

      expect(res.status).toBe(200);
      expect(res.body.lpTokens).toBe(addRes.body.lpTokens);
      expect(res.body.shareOfPool).toBe(addRes.body.shareOfPool);
    });
  });

  describe('fetchPoolsFromBlockchain export (regression: used by POST /api/admin/reconcile)', () => {
    test('is exported and callable directly, as routes/adminPanel.js does', async () => {
      expect(typeof ctrl.fetchPoolsFromBlockchain).toBe('function');
      const pools = await ctrl.fetchPoolsFromBlockchain();
      expect(Array.isArray(pools)).toBe(true);
      expect(pools[0]).toHaveProperty('reserve0');
    });
  });

  describe('addLiquidityToPool export (used directly by routes/buy.js, not over HTTP)', () => {
    test('adds liquidity when called as a plain function, bypassing HTTP auth entirely', async () => {
      const result = await ctrl.addLiquidityToPool({
        poolId: 2,
        amount0: 1,
        amount1: 2,
        userAddress: 'mall1buyer',
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('TXHASH1');
      expect(dexTxBuilder.addLiquidityOnChain).toHaveBeenCalledTimes(1);
    });

    test('rejects a non-positive amount', async () => {
      await expect(
        ctrl.addLiquidityToPool({ poolId: 2, amount0: 0, amount1: 5, userAddress: 'mall1buyer' })
      ).rejects.toThrow(/Invalid amount0/);
    });
  });
});
