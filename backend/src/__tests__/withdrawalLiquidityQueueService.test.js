jest.mock('../models/WithdrawalRequest', () => ({
  find: jest.fn(),
}));
jest.mock('../models/MallcoinSale', () => ({
  findOne: jest.fn(),
  decryptPendingTxBytes: jest.fn(),
}));
jest.mock('../models/user', () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));
jest.mock('../controllers/liquidityController', () => ({
  fetchPoolsFromBlockchain: jest.fn(),
}));
jest.mock('../services/sellGateService', () => ({
  SELL_POOL_ID: 2,
  checkSellLiquidity: jest.fn(),
}));
jest.mock('../services/sellExecutionService', () => ({
  executeSellSettlement: jest.fn(),
}));
jest.mock('../services/liquidityActivityService', () => ({
  recordWithdrawLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/notify', () => ({
  notifyUser: jest.fn().mockResolvedValue(undefined),
}));

const WithdrawalRequest = require('../models/WithdrawalRequest');
const MallcoinSale = require('../models/MallcoinSale');
const liquidityController = require('../controllers/liquidityController');
const { executeSellSettlement } = require('../services/sellExecutionService');
const {
  holdForLiquidity,
  releaseQueuedWithdrawal,
  processQueuedWithdrawals,
} = require('../services/withdrawalLiquidityQueueService');

function makeWithdrawal(overrides = {}) {
  return {
    withdrawalId: 'w1',
    saleId: 's1',
    walletAddress: 'mall1address',
    phone: '254712345678',
    amountMlcns: 100,
    amountKes: 1000,
    status: 'pending_review',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('withdrawalLiquidityQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('holdForLiquidity', () => {
    test('holds the sale/withdrawal without ever calling executeSellSettlement', async () => {
      const sale = { save: jest.fn().mockResolvedValue(undefined) };
      const withdrawal = makeWithdrawal();

      await holdForLiquidity({ sale, withdrawal, txBytes: 'BASE64TX', estimatedKes: 1000, reserveKes: 500 });

      expect(sale.status).toBe('queued_liquidity');
      expect(sale.pendingTxBytes).toBe('BASE64TX');
      expect(sale.save).toHaveBeenCalled();
      expect(withdrawal.status).toBe('queued_liquidity');
      expect(withdrawal.queuedAt).toBeInstanceOf(Date);
      expect(withdrawal.save).toHaveBeenCalled();
      expect(executeSellSettlement).not.toHaveBeenCalled();
    });
  });

  describe('releaseQueuedWithdrawal', () => {
    test('decrypts the held tx bytes and settles it, clearing pendingTxBytes', async () => {
      const withdrawal = makeWithdrawal();
      const sale = { pendingTxBytes: 'ENCRYPTED', pendingTxBytesSetAt: new Date() };
      MallcoinSale.findOne.mockResolvedValue(sale);
      MallcoinSale.decryptPendingTxBytes.mockReturnValue('DECRYPTED_TX_BYTES');
      executeSellSettlement.mockResolvedValue({ status: 200, body: { success: true } });

      const result = await releaseQueuedWithdrawal(withdrawal);

      expect(result.ok).toBe(true);
      expect(sale.pendingTxBytes).toBeNull();
      expect(executeSellSettlement).toHaveBeenCalledWith(
        expect.objectContaining({ txBytes: 'DECRYPTED_TX_BYTES', sellerAddress: withdrawal.walletAddress })
      );
    });

    test('classifies a sequence-mismatch settlement result as resignRequired, not a hard failure', async () => {
      const withdrawal = makeWithdrawal();
      MallcoinSale.findOne.mockResolvedValue({ pendingTxBytes: 'ENCRYPTED' });
      MallcoinSale.decryptPendingTxBytes.mockReturnValue('STALE_TX_BYTES');
      executeSellSettlement.mockResolvedValue({ status: 409, body: { error: 'stale' } });

      const result = await releaseQueuedWithdrawal(withdrawal);
      expect(result.ok).toBe(false);
      expect(result.resignRequired).toBe(true);
    });

    test('returns a plain failure when there is no held transaction to release', async () => {
      MallcoinSale.findOne.mockResolvedValue(null);
      const result = await releaseQueuedWithdrawal(makeWithdrawal());
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing_pending_tx');
      expect(executeSellSettlement).not.toHaveBeenCalled();
    });
  });

  describe('processQueuedWithdrawals', () => {
    function mockQueue(docs) {
      WithdrawalRequest.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(docs) });
    }

    test('releases withdrawals oldest-first while they fit the current reserve', async () => {
      liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 1500 }]);
      const w1 = makeWithdrawal({ withdrawalId: 'w1', amountKes: 1000 });
      const w2 = makeWithdrawal({ withdrawalId: 'w2', amountKes: 400 });
      mockQueue([w1, w2]);
      // A fresh object per call — mockResolvedValue would return the exact
      // same object reference every time, and releaseQueuedWithdrawal
      // mutates it (pendingTxBytes = null), which would otherwise make the
      // second release see the first release's already-cleared object.
      MallcoinSale.findOne.mockImplementation(() => Promise.resolve({ pendingTxBytes: 'ENCRYPTED' }));
      MallcoinSale.decryptPendingTxBytes.mockReturnValue('TX');
      executeSellSettlement.mockResolvedValue({ status: 200, body: { success: true } });

      const result = await processQueuedWithdrawals();

      // reserve 1500 -> w1 (1000) fits, reserve becomes 500 -> w2 (400) fits
      expect(result.released).toEqual(['w1', 'w2']);
      expect(executeSellSettlement).toHaveBeenCalledTimes(2);
    });

    test('stops at the first withdrawal that does not fit (strict FIFO, not bin-packing)', async () => {
      liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 500 }]);
      const w1 = makeWithdrawal({ withdrawalId: 'w1', amountKes: 1000 }); // does not fit
      const w2 = makeWithdrawal({ withdrawalId: 'w2', amountKes: 100 }); // would fit, but is behind w1
      mockQueue([w1, w2]);

      const result = await processQueuedWithdrawals();

      expect(result.released).toEqual([]);
      expect(executeSellSettlement).not.toHaveBeenCalled();
    });

    test('a failed release does not stop the scan from considering the rest of the queue', async () => {
      liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 2000 }]);
      const w1 = makeWithdrawal({ withdrawalId: 'w1', amountKes: 500 });
      const w2 = makeWithdrawal({ withdrawalId: 'w2', amountKes: 500 });
      mockQueue([w1, w2]);
      MallcoinSale.findOne
        .mockResolvedValueOnce(null) // w1 has no held tx -> fails
        .mockResolvedValueOnce({ pendingTxBytes: 'ENCRYPTED' }); // w2 releases fine
      MallcoinSale.decryptPendingTxBytes.mockReturnValue('TX');
      executeSellSettlement.mockResolvedValue({ status: 200, body: { success: true } });

      const result = await processQueuedWithdrawals();

      expect(result.released).toEqual(['w2']);
    });

    test('skips the scan cleanly (does not throw) when the pool cannot be read', async () => {
      liquidityController.fetchPoolsFromBlockchain.mockRejectedValue(new Error('rpc down'));
      const result = await processQueuedWithdrawals();
      expect(result.skipped).toBe(true);
      expect(result.released).toEqual([]);
    });
  });
});
