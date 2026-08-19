// Regression coverage for M-Pesa payout failure observability: before this,
// paymentFailuresTotal was declared in utils/metrics.js but never actually
// incremented anywhere in the codebase — a failed payout (either a
// Safaricom-reported B2C failure via the callback, or an initiation-time
// error) produced zero signal for any monitoring/alerting pipeline.
jest.mock('../models/B2CPayout');
jest.mock('../models/MalicoinSale');
jest.mock('../models/WithdrawalRequest');
jest.mock('../services/liquidityActivityService', () => ({
  recordWithdrawLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));

// b2cPayoutService destructures config.payment.safaricom once at module load
// time, so setting process.env after that has no effect — mock config
// directly so the "configured" guard at the top of initiateB2CPayout passes.
jest.mock('../config', () => ({
  config: {
    // b2cPayoutService now also pulls in mallcoinService (for the live
    // sell-price lookup used to compute payout amounts), which reads
    // config.chain.rest at module load time.
    chain: {
      rest: 'http://localhost:1317',
    },
    payment: {
      safaricom: {
        apiBaseUrl: 'https://sandbox.safaricom.co.ke',
        consumerKey: 'test-key',
        consumerSecret: 'test-secret',
        b2cInitiatorName: 'testapi',
        businessShortCode: '174379',
        securityCredential: 'test-cred',
        commandId: 'BusinessPayment',
        payoutCallbackUrl: 'http://localhost:4000/api/buy/payout/callback',
      },
    },
  },
}));

const axios = require('axios');
jest.mock('axios');

const { paymentFailuresTotal } = require('../utils/metrics');
const B2CPayout = require('../models/B2CPayout');
const MallcoinSale = require('../models/MalicoinSale');
const WithdrawalRequest = require('../models/WithdrawalRequest');

const { initiateB2CPayout, handlePayoutCallback } = require('../services/b2cPayoutService');

async function getCounterValue(reason) {
  const data = await paymentFailuresTotal.get();
  const entry = data.values.find((v) => v.labels.reason === reason);
  return entry ? entry.value : 0;
}

describe('b2cPayoutService failure metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentFailuresTotal.reset();
  });

  test('a Safaricom-reported callback failure (non-zero ResultCode) increments paymentFailuresTotal', async () => {
    const payoutDoc = {
      saleId: 'sale-1',
      payoutStatus: 'initiated',
      save: jest.fn().mockResolvedValue(undefined),
    };
    B2CPayout.findOne.mockResolvedValue(payoutDoc);
    MallcoinSale.findOne.mockResolvedValue(null);
    WithdrawalRequest.findOne.mockResolvedValue(null);

    await handlePayoutCallback({
      Result: { ConversationID: 'conv-1', ResultCode: 1, ResultDesc: 'Insufficient funds in org account' },
    });

    expect(payoutDoc.payoutStatus).toBe('failed');
    expect(await getCounterValue('b2c_callback_failed')).toBe(1);
  });

  test('a successful callback (ResultCode 0) does not increment paymentFailuresTotal', async () => {
    const payoutDoc = {
      saleId: 'sale-2',
      payoutStatus: 'initiated',
      save: jest.fn().mockResolvedValue(undefined),
    };
    B2CPayout.findOne.mockResolvedValue(payoutDoc);
    MallcoinSale.findOne.mockResolvedValue(null);
    WithdrawalRequest.findOne.mockResolvedValue(null);

    await handlePayoutCallback({
      Result: { ConversationID: 'conv-2', ResultCode: 0 },
    });

    expect(payoutDoc.payoutStatus).toBe('succeeded');
    expect(await getCounterValue('b2c_callback_failed')).toBe(0);
  });

  test('a Safaricom token fetch failure during initiation increments paymentFailuresTotal', async () => {
    axios.get.mockRejectedValue(new Error('token endpoint down'));

    const result = await initiateB2CPayout({ sellerPhone: '2547...', mlcnsAmount: 10, saleId: 'sale-3' });

    expect(result.ok).toBe(false);
    // getSafaricomToken() swallows the axios error internally and returns
    // null rather than throwing, so this path returns via the `if (!token)`
    // branch, not the outer try/catch — it needs its own metric increment.
    expect(await getCounterValue('b2c_token_unavailable')).toBe(1);
  });
});
