// Regression coverage for M-Pesa STK callback idempotency: Safaricom retries
// a callback whenever the response wasn't ResultCode 0, and the DLQ
// (mallwallet/queue/paymentCallbackQueue.js) can also replay a failed
// delivery later — both mean the exact same callback payload can legitimately
// arrive at processMpesaCallback more than once, and re-applying it must be
// a no-op rather than re-emitting liquidity activity or flipping state twice.
jest.mock('../models/MallcoinPurchase', () => ({ findOne: jest.fn() }));
jest.mock('../services/liquidityActivityService', () => ({
  recordBuyLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../config', () => ({
  config: {
    payment: {
      safaricom: {
        consumerKey: 'test-key',
        consumerSecret: 'test-secret',
        passkey: 'test-passkey',
        businessShortCode: '174379',
      },
    },
  },
}));

const MallcoinPurchase = require('../models/MallcoinPurchase');
const { recordBuyLiquidityActivity } = require('../services/liquidityActivityService');
const { processMpesaCallback } = require('../services/mpesaCallbackService');

function stkCallback({ checkoutId, resultCode, mpesaReceiptNumber }) {
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutId,
        ResultCode: resultCode,
        CallbackMetadata: mpesaReceiptNumber
          ? { Item: [{ Name: 'MpesaReceiptNumber', Value: mpesaReceiptNumber }] }
          : undefined,
      },
    },
  };
}

describe('processMpesaCallback idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('confirms a pending purchase on a successful callback', async () => {
    const purchase = { status: 'payment_initiated', save: jest.fn().mockResolvedValue(undefined) };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);

    const result = await processMpesaCallback(stkCallback({ checkoutId: 'chk-1', resultCode: 0, mpesaReceiptNumber: 'ABC123' }));

    expect(result).toEqual({ ResultCode: 0 });
    expect(purchase.status).toBe('confirmed');
    expect(purchase.mpesaRef).toBe('ABC123');
    expect(purchase.save).toHaveBeenCalledTimes(1);
    expect(recordBuyLiquidityActivity).toHaveBeenCalledTimes(1);
  });

  test('marks a purchase failed on a non-zero result code', async () => {
    const purchase = { status: 'payment_initiated', save: jest.fn().mockResolvedValue(undefined) };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);

    const result = await processMpesaCallback(stkCallback({ checkoutId: 'chk-2', resultCode: 1 }));

    expect(result).toEqual({ ResultCode: 0 });
    expect(purchase.status).toBe('failed');
    expect(purchase.save).toHaveBeenCalledTimes(1);
  });

  test('a duplicate delivery for an already-confirmed purchase is a no-op', async () => {
    const purchase = { status: 'confirmed', save: jest.fn().mockResolvedValue(undefined) };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);

    const result = await processMpesaCallback(stkCallback({ checkoutId: 'chk-3', resultCode: 0, mpesaReceiptNumber: 'DUPLICATE' }));

    expect(result).toEqual({ ResultCode: 0 });
    expect(purchase.save).not.toHaveBeenCalled();
    expect(recordBuyLiquidityActivity).not.toHaveBeenCalled();
  });

  test('a duplicate delivery for an already-failed purchase is a no-op', async () => {
    const purchase = { status: 'failed', save: jest.fn().mockResolvedValue(undefined) };
    MallcoinPurchase.findOne.mockResolvedValue(purchase);

    const result = await processMpesaCallback(stkCallback({ checkoutId: 'chk-4', resultCode: 1 }));

    expect(result).toEqual({ ResultCode: 0 });
    expect(purchase.save).not.toHaveBeenCalled();
    expect(recordBuyLiquidityActivity).not.toHaveBeenCalled();
  });

  test('returns ResultCode 1 when the callback carries no CheckoutRequestID', async () => {
    const result = await processMpesaCallback({ Body: { stkCallback: {} } });

    expect(result).toEqual({ ResultCode: 1 });
    expect(MallcoinPurchase.findOne).not.toHaveBeenCalled();
  });

  test('returns ResultCode 0 (do-not-retry) when no matching purchase is found', async () => {
    MallcoinPurchase.findOne.mockResolvedValue(null);

    const result = await processMpesaCallback(stkCallback({ checkoutId: 'chk-unknown', resultCode: 0 }));

    expect(result).toEqual({ ResultCode: 0 });
  });
});
