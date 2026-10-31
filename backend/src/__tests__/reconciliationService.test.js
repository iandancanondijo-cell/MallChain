// Regression coverage for reconciliationService.js's compensateFailedLiquidity.
// The MLCN/KES pool is the credited-purchase ledger itself (see
// liquidityController.fetchLedgerPoolReserves) — a purchase with status
// 'credited' is already fully part of the pool, so compensation is pure
// bookkeeping: mark liquidityAdded, clear the stale on-chain error, resolve
// the recon record. The old code retried the operator's MsgAddLiquidity,
// which could never succeed (the operator account was never funded and the
// x/dex module holds bank coins while MLCNS lives in x/mlcoin's internal
// ledger), leaving every recon stuck forever.
jest.mock('../models/MallcoinPurchase', () => ({ findById: jest.fn() }));
jest.mock('../models/LiquidityReconciliation', () => ({ findOne: jest.fn(), create: jest.fn(), find: jest.fn() }));
jest.mock('../services/liquidityActivityService', () => ({ recordBuyLiquidityActivity: jest.fn().mockResolvedValue(undefined) }));

const MallcoinPurchase = require('../models/MallcoinPurchase');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
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
    status: 'credited',
    liquidityAdded: false,
    liquidityError: 'original failure reason',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('compensateFailedLiquidity', () => {
  beforeEach(() => jest.clearAllMocks());

  test('skips (returns null) when the item is already compensating or resolved', async () => {
    const compensating = fakeRecon({ status: 'compensating' });
    const resolved = fakeRecon({ status: 'resolved' });
    expect(await compensateFailedLiquidity(compensating)).toBeNull();
    expect(await compensateFailedLiquidity(resolved)).toBeNull();
    expect(compensating.save).not.toHaveBeenCalled();
    expect(resolved.save).not.toHaveBeenCalled();
  });

  test('settles the ledger bookkeeping for a credited purchase and resolves', async () => {
    const recon = fakeRecon();
    const purchase = fakePurchase();
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });

    const result = await compensateFailedLiquidity(recon);

    expect(result.status).toBe('resolved');
    expect(result.resolvedAt).toBeInstanceOf(Date);

    // The purchase record is brought in sync with the ledger-reserve view.
    expect(purchase.liquidityAdded).toBe(true);
    expect(purchase.liquidityPoolId).toBe(2);
    expect(purchase.liquidityError).toBeUndefined();
    expect(purchase.save).toHaveBeenCalledTimes(1);

    expect(recordBuyLiquidityActivity).toHaveBeenCalledWith(
      'liquidity_add_reconciled',
      purchase,
      expect.objectContaining({ status: 'success', poolId: 2 })
    );
  });

  test('keeps the purchase\'s own liquidityPoolId over the default when set', async () => {
    const recon = fakeRecon();
    const purchase = fakePurchase({ liquidityPoolId: 7 });
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });

    await compensateFailedLiquidity(recon);

    expect(recordBuyLiquidityActivity).toHaveBeenCalledWith(
      'liquidity_add_reconciled',
      purchase,
      expect.objectContaining({ poolId: 7 })
    );
  });

  test('a pending_manual item IS retried by the sweep (job self-heals past failures)', async () => {
    const recon = fakeRecon({ status: 'pending_manual', reason: 'transient mongo error' });
    const purchase = fakePurchase();
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });

    const result = await compensateFailedLiquidity(recon);

    expect(result.status).toBe('resolved');
    expect(purchase.liquidityAdded).toBe(true);
  });

  test('falls back to pending_manual when the purchase is no longer credited', async () => {
    const recon = fakeRecon();
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase({ status: 'refunded' })) });

    const result = await compensateFailedLiquidity(recon);

    expect(result).toBeNull();
    expect(recon.status).toBe('pending_manual');
    expect(recon.reason).toContain('not in credited state');
    expect(recon.resolvedAt).toBeNull();
    expect(recon.save).toHaveBeenCalled();
  });

  test('falls back to pending_manual (with the new reason) when bookkeeping itself fails', async () => {
    const recon = fakeRecon();
    const purchase = fakePurchase();
    purchase.save.mockRejectedValue(new Error('mongo write failed'));
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(purchase) });

    const result = await compensateFailedLiquidity(recon);

    expect(result).toBeNull();
    expect(recon.status).toBe('pending_manual');
    expect(recon.reason).toBe('mongo write failed');
    expect(recon.resolvedAt).toBeNull();
    expect(recon.save).toHaveBeenCalled();
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
    LiquidityReconciliation.find.mockResolvedValue([]);
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase()) });

    const result = await runReconciliationJob();

    expect(result.detected).toBe(1);
    expect(result.processed).toBe(1);
    expect(created.status).toBe('resolved');
  });

  test('sweeps pre-existing unresolved records that detection skips', async () => {
    // detectFailedLiquidityAdds skips purchases that already have a record —
    // the job must still retry those stale records or they hang forever.
    MallcoinPurchase.find = jest.fn().mockResolvedValue([]);
    const stale = fakeRecon({ _id: 'recon-stale', status: 'detected' });
    LiquidityReconciliation.find.mockResolvedValue([stale]);
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase()) });

    const result = await runReconciliationJob();

    expect(result.detected).toBe(0);
    expect(result.processed).toBe(1);
    expect(stale.status).toBe('resolved');
  });

  test('does not compensate the same record twice when detection and the sweep overlap', async () => {
    const purchase = { _id: 'p1', quoteId: 'q1', txHash: 'TX1', walletAddress: 'mall1x', amount: 10, fiatAmount: 6.2, liquidityError: 'boom' };
    MallcoinPurchase.find = jest.fn().mockResolvedValue([purchase]);
    LiquidityReconciliation.findOne.mockResolvedValue(null);
    const created = fakeRecon({ _id: 'recon-dup' });
    LiquidityReconciliation.create.mockResolvedValue(created);
    LiquidityReconciliation.find.mockResolvedValue([fakeRecon({ _id: 'recon-dup' })]);
    MallcoinPurchase.findById.mockReturnValue({ catch: () => Promise.resolve(fakePurchase()) });

    const result = await runReconciliationJob();

    expect(result.processed).toBe(1);
  });
});
