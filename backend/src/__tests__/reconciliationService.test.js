// Regression coverage for reconciliationService.js's compensateFailedLiquidity.
// It used to never actually reverse/retry anything — it logged a
// "compensation attempt" and then always fell back to pending_manual,
// leaving every detected item stuck for manual review forever. The failure
// being compensated for is the operator's own add-liquidity transaction
// (funded by OPERATOR_MNEMONIC, not the user's wallet) failing after the
// user's MLCNS credit already succeeded — there is nothing to claw back
// from the user, so the correct fix is retrying the operator's own
// liquidity-add with the same amounts.
jest.mock('../models/MallcoinPurchase', () => ({ findById: jest.fn() }));
jest.mock('../models/LiquidityReconciliation', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../controllers/liquidityController', () => ({ addLiquidityToPool: jest.fn() }));
jest.mock('../services/liquidityActivityService', () => ({ recordBuyLiquidityActivity: jest.fn().mockResolvedValue(undefined) }));

const MallcoinPurchase = require('../models/MallcoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const { addLiquidityToPool } = require('../controllers/liquidityController');
const { recordBuyLiquidityActivity } = require('../services/liquidityActivityService');
const { compensateFailedLiquidity, detectFailedLiquidityAdds, runReconciliationJob } = require('../services/reconciliationService');

function fakeRecon(overrides = {}) {
  return {
    _id: 'recon1',
    purchaseId: 'purchase1',
    quoteId: 'q1',
    walletAddress: 'mall1testwalletaddress00000000000000000',
    mlcnsAmount: 50,
    fiatAmount: 31,
    status: 'detected',
    reason: 'original failure reason',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakePurchase(overrides = {}) {
  return {
    _id: 'purchase1',
    walletAddress: 'mall1testwalletaddress00000000000000000',
    amount: 50,
    fiatAmount: 31,
    liquidityAdded: false,
    liquidityError: 'original failure reason',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('compensateFailedLiquidity', () => {
  beforeEach(() => jest.clearAllMocks());

  test('skips (returns null) when the item is not in detected status', async () => {
    const recon = fakeRecon({ status: 'pending_manual' });
    const result = await compensateFailedLiquidity(recon);
    expect(result).toBeNull();
    expect(addLiquidityToPool).not.toHaveBeenCalled();
    expect(recon.save).not.toHaveBeenCalled();
  });

  test('retries the operator-funded liquidity add with the same amounts, and resolves on success', async () => {
    const recon = fakeRecon();
    const purchase = fakePurchase();
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });
    addLiquidityToPool.mockResolvedValue({ txHash: 'TXHASH_RETRY', lpTokens: '12.34', shareOfPool: '5.00' });

    const result = await compensateFailedLiquidity(recon);

    expect(addLiquidityToPool).toHaveBeenCalledWith({
      poolId: 2,
      amount0: 50,
      amount1: 31,
      userAddress: 'mall1testwalletaddress00000000000000000',
    });
    expect(result.status).toBe('resolved');
    expect(result.compensationTx).toBe('TXHASH_RETRY');
    expect(result.resolvedAt).toBeInstanceOf(Date);

    // The purchase record is brought back in sync with a real liquidity add.
    expect(purchase.liquidityAdded).toBe(true);
    expect(purchase.lpTokens).toBeCloseTo(12.34);
    expect(purchase.liquidityError).toBeUndefined();
    expect(purchase.save).toHaveBeenCalledTimes(1);

    expect(recordBuyLiquidityActivity).toHaveBeenCalledWith(
      'liquidity_add_reconciled',
      purchase,
      expect.objectContaining({ status: 'success', liquidityTxHash: 'TXHASH_RETRY' })
    );
  });

  test('uses the purchase\'s own liquidityPoolId over the default when set', async () => {
    const recon = fakeRecon();
    const purchase = fakePurchase({ liquidityPoolId: 7 });
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });
    addLiquidityToPool.mockResolvedValue({ txHash: 'TX', lpTokens: '1' });

    await compensateFailedLiquidity(recon);

    expect(addLiquidityToPool).toHaveBeenCalledWith(expect.objectContaining({ poolId: 7 }));
  });

  test('falls back to pending_manual (not an automatic retry loop) when the retry itself fails', async () => {
    const recon = fakeRecon();
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase()) });
    addLiquidityToPool.mockRejectedValue(new Error('OPERATOR_MNEMONIC not configured'));

    const result = await compensateFailedLiquidity(recon);

    expect(result).toBeNull();
    expect(recon.status).toBe('pending_manual');
    expect(recon.status).not.toBe('detected'); // must not loop back to auto-retry
    expect(recon.reason).toBe('OPERATOR_MNEMONIC not configured');
    expect(recon.resolvedAt).toBeNull();
    expect(recon.save).toHaveBeenCalled();
  });

  test('a pending_manual item from a prior failed retry is never picked up again automatically', async () => {
    // Simulates a second job run seeing the item this test file's previous
    // case left behind — it must stay untouched until a human acts on it.
    const recon = fakeRecon({ status: 'pending_manual', reason: 'OPERATOR_MNEMONIC not configured' });
    const result = await compensateFailedLiquidity(recon);
    expect(result).toBeNull();
    expect(addLiquidityToPool).not.toHaveBeenCalled();
  });
});

describe('detectFailedLiquidityAdds', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a reconciliation record for a credited purchase with a liquidity error and no existing record', async () => {
    const purchase = { _id: 'p1', quoteId: 'q1', txHash: 'TX1', walletAddress: 'mall1x', amount: 10, fiatAmount: 6.2, liquidityError: 'boom' };
    MallcoinPurchase.find = jest.fn().mockResolvedValue([purchase]);
    LiquidityReconciliation.findOne.mockResolvedValue(null);
    LiquidityReconciliation.create.mockResolvedValue({ _id: 'recon-new' });

    const results = await detectFailedLiquidityAdds();

    expect(results).toHaveLength(1);
    expect(LiquidityReconciliation.create).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseId: 'p1', reason: 'boom', status: 'detected' })
    );
  });

  test('does not duplicate a reconciliation record that already exists for the purchase', async () => {
    const purchase = { _id: 'p1', quoteId: 'q1', txHash: 'TX1', walletAddress: 'mall1x', amount: 10, fiatAmount: 6.2, liquidityError: 'boom' };
    MallcoinPurchase.find = jest.fn().mockResolvedValue([purchase]);
    LiquidityReconciliation.findOne.mockResolvedValue({ _id: 'existing' });

    const results = await detectFailedLiquidityAdds();

    expect(results).toHaveLength(0);
    expect(LiquidityReconciliation.create).not.toHaveBeenCalled();
  });
});

describe('runReconciliationJob', () => {
  beforeEach(() => jest.clearAllMocks());

  test('detects then compensates every newly-detected item', async () => {
    const purchase = { _id: 'p1', quoteId: 'q1', txHash: 'TX1', walletAddress: 'mall1x', amount: 10, fiatAmount: 6.2, liquidityError: 'boom' };
    MallcoinPurchase.find = jest.fn().mockResolvedValue([purchase]);
    LiquidityReconciliation.findOne.mockResolvedValue(null);
    const created = fakeRecon({ _id: 'recon-new' });
    LiquidityReconciliation.create.mockResolvedValue(created);
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase()) });
    addLiquidityToPool.mockResolvedValue({ txHash: 'TX2', lpTokens: '3' });

    const result = await runReconciliationJob();

    expect(result.detected).toBe(1);
    expect(addLiquidityToPool).toHaveBeenCalledTimes(1);
    expect(created.status).toBe('resolved');
  });
});
