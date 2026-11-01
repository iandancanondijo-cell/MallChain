// Liquidity-pool ledger coverage ("activate the pool to record every single
// thing"): the LiquidityPoolActivity flow enum now includes the informational
// flows (mallpoints_purchase / reward / transfer / faucet / refund), every
// wrapper stamps affectsReserves correctly, and the pool RESERVES remain the
// credited-MallcoinPurchase aggregation only — informational ledger rows can
// never move them (see the RESERVE SEMANTICS comment in
// models/LiquidityPoolActivity.js).
jest.mock('../models/LiquidityPoolActivity', () => {
  const create = jest.fn(async (payload) => payload);
  const model = { create, decryptPhone: (a) => a };
  return model;
});
jest.mock('../models/MallPointAccount', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({ balance: 100 }),
}));
jest.mock('../models/MallcoinPurchase', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
}));
jest.mock('axios');
// Factory-mock dexTxBuilder so the @cosmjs ESM graph never loads here (same
// pattern as liquidityController.test.js) — liquidityController requires it
// at module top even though fetchLedgerPoolReserves does not use it.
jest.mock('../services/dexTxBuilder', () => ({
  getAddressFromMnemonic: jest.fn(),
  toBaseUnits: jest.fn(),
  addLiquidityOnChain: jest.fn(),
  removeLiquidityOnChain: jest.fn(),
}));

const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');
const MallPointAccount = require('../models/MallPointAccount');
const MallcoinPurchase = require('../models/MallcoinPurchase');
const {
  recordLiquidityActivity,
  recordBuyLiquidityActivity,
  recordWithdrawLiquidityActivity,
  recordMallpointsPurchaseActivity,
  recordRewardActivity,
  recordTransferActivity,
  recordFaucetActivity,
  recordRefundActivity,
} = require('../services/liquidityActivityService');

afterEach(() => jest.clearAllMocks());

describe('LiquidityPoolActivity flow enum (real schema)', () => {
  // Load the actual model file (the mock above only replaces it for the
  // service graph); validateSync needs no DB connection.
  const Actual = jest.requireActual('../models/LiquidityPoolActivity');

  test.each([
    'buy', 'withdraw', 'reconciliation', 'mallpoints_convert',
    'mallpoints_purchase', 'reward', 'transfer', 'faucet', 'refund',
  ])('accepts flow %p', (flow) => {
    const doc = new Actual({ flow, stage: 'test_stage' });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('still rejects unknown flows', () => {
    const doc = new Actual({ flow: 'not_a_real_flow', stage: 'test_stage' });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.flow).toBeDefined();
  });

  test('affectsReserves defaults to false (informational unless stated)', () => {
    const doc = new Actual({ flow: 'reward', stage: 'test_stage' });
    expect(doc.affectsReserves).toBe(false);
  });
});

describe('liquidityActivityService wrappers', () => {
  test('recordRewardActivity writes an informational MLPTS row', async () => {
    await recordRewardActivity({
      walletAddress: 'mall1abc',
      amountMlpts: 250,
      userId: 'u1',
      stage: 'mining_approval',
    });
    expect(LiquidityPoolActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'reward',
        affectsReserves: false,
        status: 'success',
        currency: 'MLPTS',
        userId: 'u1',
        walletAddress: 'mall1abc',
        stage: 'mining_approval',
        metadata: expect.objectContaining({ mlptsAmount: 250 }),
      })
    );
  });

  test('recordTransferActivity keys the row on the sender and tx hash', async () => {
    await recordTransferActivity({
      from: 'mall1from', to: 'mall1to', amountMlcns: 100,
      txHash: 'TX1', stage: 'p2p_transfer_broadcasted',
    });
    const payload = LiquidityPoolActivity.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      flow: 'transfer', affectsReserves: false, walletAddress: 'mall1from',
      amountMlcns: 100, creditTxHash: 'TX1',
    });
    expect(payload.metadata.recipient).toBe('mall1to');
  });

  test('recordFaucetActivity writes an informational row', async () => {
    await recordFaucetActivity({ address: 'mall1faucet', amountMlcns: 10, txHash: 'TX2' });
    expect(LiquidityPoolActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'faucet', affectsReserves: false, walletAddress: 'mall1faucet',
        amountMlcns: 10, creditTxHash: 'TX2',
      })
    );
  });

  test('recordRefundActivity maps a refunded withdrawal and never leaks ciphertext phone', async () => {
    const withdrawal = {
      withdrawalId: 'WDR-1', walletAddress: 'mall1w', amountMlcns: 40,
      amountKes: 3200, currency: 'KES', payoutProvider: 'mpesa',
      notes: 'manual refund', phone: 'ENC(CIPHERTEXT)',
    };
    await recordRefundActivity('withdrawal_refunded', withdrawal);
    const payload = LiquidityPoolActivity.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      flow: 'refund', affectsReserves: false, stage: 'withdrawal_refunded',
      withdrawalId: 'WDR-1', amountMlcns: 40, fiatAmount: 3200,
    });
    // The refund wrapper must NOT forward the already-encrypted source phone
    // (it would double-encrypt and break the blind index).
    expect(payload.phone).toBeUndefined();
  });

  test('recordMallpointsPurchaseActivity records the fiat leg as informational', async () => {
    const purchase = { quoteId: 'q1', address: 'mall1addr', amountKes: 500, mallpointsAmount: 45 };
    await recordMallpointsPurchaseActivity('mallpoints_credited', purchase);
    const payload = LiquidityPoolActivity.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      flow: 'mallpoints_purchase', affectsReserves: false, stage: 'mallpoints_credited',
      quoteId: 'q1', walletAddress: 'mall1addr', fiatAmount: 500, provider: 'safaricom_mpesa',
    });
    expect(payload.metadata.mallpointsAmount).toBe(45);
  });

  test('reserve-moving wrappers (buy/withdraw) mark affectsReserves: true', async () => {
    await recordBuyLiquidityActivity('credited', { quoteId: 'q1', amount: 10, fiatAmount: 800 });
    expect(LiquidityPoolActivity.create.mock.calls[0][0]).toMatchObject({
      flow: 'buy', affectsReserves: true,
    });
    await recordWithdrawLiquidityActivity('b2c_paid', { withdrawalId: 'W1', amountMlcns: 5, amountKes: 400 });
    expect(LiquidityPoolActivity.create.mock.calls[1][0]).toMatchObject({
      flow: 'withdraw', affectsReserves: true,
    });
  });

  test('raw recordLiquidityActivity defaults affectsReserves to false', async () => {
    await recordLiquidityActivity({ flow: 'mallpoints_convert', stage: 's' });
    expect(LiquidityPoolActivity.create.mock.calls[0][0].affectsReserves).toBe(false);
  });
});

describe('pool reserves ignore the activity ledger entirely', () => {
  const ctrl = require('../controllers/liquidityController');

  test('fetchLedgerPoolReserves aggregates ONLY credited MallcoinPurchases', async () => {
    MallcoinPurchase.aggregate.mockResolvedValue([{ _id: null, mlcns: 500, kes: 300 }]);
    const reserves = await ctrl.fetchLedgerPoolReserves();
    expect(reserves).toEqual({ reserve0: 500, reserve1: 300 });

    const pipeline = MallcoinPurchase.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { status: 'credited' } });
    expect(pipeline[1]).toEqual({
      $group: { _id: null, mlcns: { $sum: '$amount' }, kes: { $sum: '$fiatAmount' } },
    });
    // Reserves read the purchase ledger only — no LiquidityPoolActivity write
    // (informational reward/transfer/faucet/refund rows) participates, so
    // informational rows can never move reserves.
    expect(LiquidityPoolActivity.create).not.toHaveBeenCalled();
  });
});

describe('GATE-61 chokepoint hook: syncMallPointAccount records every MLPTS movement', () => {
  const { syncMallPointAccount } = require('../services/mallpointsService');
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  test('a mining reward credit records a reward row (covers mines.js approve/credit/deduct)', async () => {
    const session = { fakeSession: true };
    const ok = await syncMallPointAccount('mall1miner', 120, session, {
      userId: 'miner1', flow: 'mining_approval',
    });
    await flush();

    expect(ok).toBe(true);
    expect(MallPointAccount.findOneAndUpdate).toHaveBeenCalledWith(
      { address: 'mall1miner' },
      { $inc: { balance: 120 } },
      expect.objectContaining({ upsert: true, session })
    );
    expect(LiquidityPoolActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'reward',
        affectsReserves: false,
        stage: 'mining_approval',
        userId: 'miner1',
        walletAddress: 'mall1miner',
        metadata: expect.objectContaining({ mlptsAmount: 120 }),
      })
    );
  });

  test('admin deduct (negative amount) is recorded too', async () => {
    await syncMallPointAccount('mall1user', -50, {}, { userId: 'u9', flow: 'admin_balance_deduct' });
    await flush();
    const payload = LiquidityPoolActivity.create.mock.calls[0][0];
    expect(payload).toMatchObject({ flow: 'reward', stage: 'admin_balance_deduct' });
    expect(payload.metadata.mlptsAmount).toBe(-50);
  });

  test('ledger failure never breaks the balance sync (non-fatal)', async () => {
    LiquidityPoolActivity.create.mockRejectedValueOnce(new Error('mongo down'));
    const ok = await syncMallPointAccount('mall1user', 10, {}, { flow: 'referral_payout' });
    expect(ok).toBe(true);
    await flush();
    expect(MallPointAccount.findOneAndUpdate).toHaveBeenCalled();
  });

  test('walletless user: skipped, nothing recorded', async () => {
    const ok = await syncMallPointAccount(null, 10, {}, { flow: 'mining_approval' });
    await flush();
    expect(ok).toBe(false);
    expect(LiquidityPoolActivity.create).not.toHaveBeenCalled();
  });
});
