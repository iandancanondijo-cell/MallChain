// SEC3: per-transaction and daily cumulative caps on B2C (KES) payouts.
// Both caps are opt-in (unset env var = no limit) since the actual figures
// are a business decision, not something this code can default safely.
jest.mock('../models/TreasuryDailyPayout', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../config', () => ({
  config: { payment: { safaricom: { autoPayoutEnabled: false } } },
}));

const TreasuryDailyPayout = require('../models/TreasuryDailyPayout');
const { checkPayoutLimits, recordPayout } = require('../services/treasuryLimitsService');

describe('treasuryLimitsService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAX_PAYOUT_KES_PER_TX;
    delete process.env.MAX_PAYOUT_KES_PER_DAY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('with no caps configured, any amount passes without touching the database', async () => {
    const result = await checkPayoutLimits(1_000_000);

    expect(result).toEqual({ ok: true });
    expect(TreasuryDailyPayout.findOne).not.toHaveBeenCalled();
  });

  test('rejects a single payout above the per-transaction cap', async () => {
    process.env.MAX_PAYOUT_KES_PER_TX = '50000';

    const result = await checkPayoutLimits(50001);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/per-transaction limit/);
  });

  test('allows a payout exactly at the per-transaction cap', async () => {
    process.env.MAX_PAYOUT_KES_PER_TX = '50000';

    const result = await checkPayoutLimits(50000);

    expect(result.ok).toBe(true);
  });

  test('rejects a payout that would push the cumulative daily total over the daily cap', async () => {
    process.env.MAX_PAYOUT_KES_PER_DAY = '100000';
    TreasuryDailyPayout.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ totalKes: 80000 }) });

    const result = await checkPayoutLimits(30000);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cumulative payout limit/);
  });

  test('allows a payout that keeps the cumulative daily total within the cap', async () => {
    process.env.MAX_PAYOUT_KES_PER_DAY = '100000';
    TreasuryDailyPayout.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ totalKes: 50000 }) });

    const result = await checkPayoutLimits(30000);

    expect(result.ok).toBe(true);
  });

  test('treats no prior payouts today as a zero total', async () => {
    process.env.MAX_PAYOUT_KES_PER_DAY = '100000';
    TreasuryDailyPayout.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const result = await checkPayoutLimits(99999);

    expect(result.ok).toBe(true);
  });

  test('recordPayout atomically increments today\'s running total', async () => {
    TreasuryDailyPayout.findOneAndUpdate.mockResolvedValue({});

    await recordPayout(12345);

    expect(TreasuryDailyPayout.findOneAndUpdate).toHaveBeenCalledWith(
      { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      { $inc: { totalKes: 12345 } },
      { upsert: true }
    );
  });

  test('recordPayout swallows a database error rather than throwing', async () => {
    TreasuryDailyPayout.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));

    await expect(recordPayout(100)).resolves.toBeUndefined();
  });
});
