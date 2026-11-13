/**
 * The realtime hook inside the ledger funnel.
 *
 * Every value movement in the economy passes through recordLiquidityActivity,
 * which makes it the only place a socket update can be promised to be as true as
 * the row it describes. These cases pin the wiring in
 * services/liquidityActivityService.js: settled rows fan out, unsettled rows do
 * not, and a broken websocket can never turn a recorded movement into a failed
 * request.
 */
jest.mock('../models/LiquidityPoolActivity', () => {
  const create = jest.fn(async (payload) => ({ ...payload, _id: 'led1', toObject: () => ({ ...payload, _id: 'led1' }) }));
  return { create, decryptPhone: (a) => a };
});
jest.mock('../models/MallcoinPurchase', () => ({ findOne: jest.fn() }));
jest.mock('../services/marketActivityFeed', () => {
  const actual = jest.requireActual('../services/marketActivityFeed');
  return { ...actual, publishMarketEvent: jest.fn(() => true) };
});
jest.mock('../services/walletSync', () => ({ publish: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');
const { publishMarketEvent } = require('../services/marketActivityFeed');
const walletSync = require('../services/walletSync');
const {
  recordLiquidityActivity,
  recordBuyLiquidityActivity,
  recordRewardActivity,
  recordWithdrawLiquidityActivity,
} = require('../services/liquidityActivityService');

// Fan-out happens on setImmediate so the ledger write returns first; tests have
// to hand the loop back once before asserting what got published.
const flush = () => new Promise((resolve) => setImmediate(resolve));

const HOUR = 3600_000;

function purchase(overrides = {}) {
  return {
    _id: 'pur1',
    userId: 'user1',
    walletAddress: 'mall1abcdefghijklmnopqrstuvwxyz012345678',
    // MallcoinPurchase carries the token quantity in `amount`; the ledger's
    // amountMlcns column is filled from it by recordBuyLiquidityActivity.
    amount: 1666.67,
    fiatAmount: 1000,
    currency: 'KES',
    paymentId: 'MPESA1',
    createdAt: new Date(),
    constructor: { decryptPhone: (doc) => doc },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  LiquidityPoolActivity.create.mockImplementation(async (payload) => ({
    ...payload, _id: 'led1', toObject: () => ({ ...payload, _id: 'led1' }),
  }));
});

describe('market feed fan-out', () => {
  test('a credited buy publishes a trade event', async () => {
    await recordBuyLiquidityActivity('credited', purchase(), { status: 'success' });
    await flush();

    expect(publishMarketEvent).toHaveBeenCalledTimes(1);
    const [event] = publishMarketEvent.mock.calls[0];
    expect(event.type).toBe('trade');
    expect(event.flow).toBe('buy');
    expect(event.amountMlcns).toBe(1666.67);
    // toTradeEvent publishes txHash: null rather than omitting it or inventing
    // one — the frontend socket contract types the field as `string | null`.
    expect(event.txHash).toBeNull();
  });

  test('a credited buy carries the chain hash through to the feed', async () => {
    await recordBuyLiquidityActivity('credited', purchase(), {
      status: 'success',
      creditTxHash: 'AE0F1B2C3D4E5F60'.repeat(4),
    });
    await flush();

    const [event] = publishMarketEvent.mock.calls[0];
    expect(event.txHash).toBe('AE0F1B2C3D4E5F60'.repeat(4));
    // ...and nothing that identifies who made the purchase.
    expect(event.walletAddress).toBeUndefined();
    expect(event.fiatAmount).toBeUndefined();
    expect(event.userId).toBeUndefined();
  });

  test('a buy still awaiting settlement publishes nothing', async () => {
    await recordBuyLiquidityActivity('initiated', purchase(), { status: 'pending' });
    await flush();

    // The pending row is real bookkeeping, but publishing it would tell a
    // viewer a purchase happened before it has.
    expect(publishMarketEvent).not.toHaveBeenCalled();
  });

  test('a failed movement is not market activity', async () => {
    await recordWithdrawLiquidityActivity('failed', { walletAddress: 'mall1x', amountMlcns: 50 }, { status: 'failed' });
    await flush();

    expect(publishMarketEvent).not.toHaveBeenCalled();
  });

  test('informational flows refresh the wallet without claiming a trade', async () => {
    await recordRewardActivity({
      userId: 'user1',
      walletAddress: 'mall1abcdefghijklmnopqrstuvwxyz012345678',
      amountMlcns: 25,
      status: 'success',
      reason: 'mining reward',
    });
    await flush();

    // 'reward' is outside TRADE_FLOWS (see models/LiquidityPoolActivity.js's
    // reserve semantics), so it must not appear in a market feed of trades —
    // but the balance it moved is exactly what the wallet room should show.
    expect(publishMarketEvent).not.toHaveBeenCalled();
    expect(walletSync.publish).toHaveBeenCalledWith('mall1abcdefghijklmnopqrstuvwxyz012345678');
  });

  test('a settled row with no wallet address publishes no wallet update', async () => {
    await recordLiquidityActivity({ flow: 'buy', stage: 'credited', status: 'success', amountMlcns: 10 });
    await flush();

    expect(walletSync.publish).not.toHaveBeenCalled();
    expect(publishMarketEvent).toHaveBeenCalledTimes(1);
  });

  test('a publisher that throws cannot fail the ledger write', async () => {
    publishMarketEvent.mockImplementation(() => { throw new Error('transport gone'); });

    const created = await recordBuyLiquidityActivity('credited', purchase(), { status: 'success' });
    await flush();

    // The KES 1000 has been paid and the row is committed; a dead socket is an
    // observability problem, not a payment failure.
    expect(created.flow).toBe('buy');
    expect(LiquidityPoolActivity.create).toHaveBeenCalledTimes(1);
  });

  test('a rejecting wallet publish cannot fail the ledger write', async () => {
    walletSync.publish.mockRejectedValueOnce(new Error('chain unreachable'));

    await recordBuyLiquidityActivity('credited', purchase(), { status: 'success' });
    await flush();

    expect(LiquidityPoolActivity.create).toHaveBeenCalledTimes(1);
  });
});
