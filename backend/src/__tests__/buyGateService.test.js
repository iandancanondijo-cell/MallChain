// Regression coverage for the direct-buy liquidity gate: once the MLCN/KES
// pool's KES reserve has ever reached the threshold, fiat buying must be
// permanently blocked — including on a later check where the pool's
// reserve has dropped back below the threshold (e.g. after withdrawals).
// Also locks in fail-open behavior so a transient DB/chain read failure
// doesn't itself take down the buy flow.
const request = require('supertest');
const express = require('express');

jest.mock('../models/EconomyState', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../controllers/liquidityController', () => ({
  fetchPoolsFromBlockchain: jest.fn(),
}));
jest.mock('../utils/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));

const EconomyState = require('../models/EconomyState');
const liquidityController = require('../controllers/liquidityController');
const {
  getBuyGateStatus,
  requireDirectBuyUnlocked,
  invalidateCache,
  DIRECT_BUY_LOCK_THRESHOLD_KES,
} = require('../services/buyGateService');

function leanResult(doc) {
  return { lean: jest.fn().mockResolvedValue(doc) };
}

function buildApp() {
  const app = express();
  app.post('/buy/reserve', requireDirectBuyUnlocked(), (req, res) => res.json({ ok: true }));
  return app;
}

describe('buyGateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCache();
  });

  test('not locked while the pool KES reserve is below threshold', async () => {
    EconomyState.findById.mockReturnValue(leanResult(null));
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 100000 }]);

    const status = await getBuyGateStatus();

    expect(status.locked).toBe(false);
    expect(EconomyState.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('locks permanently once the pool KES reserve reaches the threshold', async () => {
    EconomyState.findById.mockReturnValue(leanResult(null));
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([
      { id: 2, reserve1: DIRECT_BUY_LOCK_THRESHOLD_KES },
    ]);

    const status = await getBuyGateStatus();

    expect(status.locked).toBe(true);
    expect(EconomyState.findByIdAndUpdate).toHaveBeenCalledWith(
      'singleton',
      expect.objectContaining({ $set: expect.objectContaining({ directBuyLocked: true }) }),
      expect.objectContaining({ upsert: true })
    );
  });

  test('stays locked even if the pool reserve later drops back below threshold', async () => {
    EconomyState.findById.mockReturnValue(
      leanResult({ directBuyLocked: true, poolKesReserveAtLock: DIRECT_BUY_LOCK_THRESHOLD_KES })
    );
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 10000 }]);

    const status = await getBuyGateStatus();

    expect(status.locked).toBe(true);
    // Already-locked path reads the durable flag and must not re-touch the chain.
    expect(liquidityController.fetchPoolsFromBlockchain).not.toHaveBeenCalled();
  });

  test('fails open (not locked) when the DB read throws', async () => {
    EconomyState.findById.mockImplementation(() => { throw new Error('mongo down'); });

    const status = await getBuyGateStatus();

    expect(status.locked).toBe(false);
    expect(status.error).toBe(true);
  });

  test('middleware rejects with 403 once locked', async () => {
    EconomyState.findById.mockReturnValue(
      leanResult({ directBuyLocked: true, poolKesReserveAtLock: DIRECT_BUY_LOCK_THRESHOLD_KES })
    );

    const res = await request(buildApp()).post('/buy/reserve');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('direct_buy_locked');
  });

  test('middleware allows the request through when unlocked', async () => {
    EconomyState.findById.mockReturnValue(leanResult(null));
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 0 }]);

    const res = await request(buildApp()).post('/buy/reserve');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
