// SEC3 integration: initiateB2CPayout must consult the per-tx/daily caps
// BEFORE calling Safaricom at all — a rejected payout must never actually
// reach the B2C endpoint.
jest.mock('../config', () => ({
  config: {
    chain: { rest: 'http://localhost:1317' },
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
jest.mock('../services/mallcoinService', () => ({
  getMarketPrice: jest.fn().mockResolvedValue({ sellPriceKes: 1 }), // 1 KES per MLCNS, for round numbers
}));
jest.mock('../services/treasuryLimitsService', () => ({
  checkPayoutLimits: jest.fn(),
  recordPayout: jest.fn().mockResolvedValue(undefined),
}));
const axios = require('axios');
jest.mock('axios');

const { checkPayoutLimits, recordPayout } = require('../services/treasuryLimitsService');
const { initiateB2CPayout } = require('../services/b2cPayoutService');

describe('initiateB2CPayout — treasury caps', () => {
  beforeEach(() => jest.clearAllMocks());

  test('never calls Safaricom when the caps check rejects the payout', async () => {
    checkPayoutLimits.mockResolvedValue({ ok: false, reason: 'exceeds the per-transaction limit' });

    const result = await initiateB2CPayout({ sellerPhone: '254700000000', mlcnsAmount: 100, saleId: 'sale-1' });

    expect(result.ok).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.error).toMatch(/per-transaction limit/);
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
    expect(recordPayout).not.toHaveBeenCalled();
  });

  test('calls Safaricom and records the payout when the caps check passes', async () => {
    checkPayoutLimits.mockResolvedValue({ ok: true });
    axios.get.mockResolvedValue({ data: { access_token: 'tok' } });
    axios.post.mockResolvedValue({ data: { ConversationID: 'conv-1' } });

    const result = await initiateB2CPayout({ sellerPhone: '254700000000', mlcnsAmount: 100, saleId: 'sale-2' });

    expect(result.ok).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(checkPayoutLimits).toHaveBeenCalledWith(100); // 100 MLCNS * 1 KES/MLCNS
    expect(recordPayout).toHaveBeenCalledWith(100);
  });
});
