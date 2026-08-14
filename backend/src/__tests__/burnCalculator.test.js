jest.mock('../models/BurnPolicy', () => ({
  BurnPolicy: { findOne: jest.fn() },
  DynamicBurnThreshold: { find: jest.fn() },
}));

const { BurnPolicy, DynamicBurnThreshold } = require('../models/BurnPolicy');
const {
  calculateBurnSplit,
  shouldUseDynamic,
  getStaticBurnRate,
  getDynamicBurnRate,
  getEffectiveBurnRate,
} = require('../services/burnCalculator');

describe('calculateBurnSplit', () => {
  test('splits an amount by percentage, flooring the burn amount', () => {
    expect(calculateBurnSplit(1000, 2)).toEqual({ burnAmount: 20, treasuryAmount: 980, burnPercentage: 2 });
  });

  test('floors fractional burn amounts rather than rounding', () => {
    // 1% of 999 = 9.99 -> floors to 9
    expect(calculateBurnSplit(999, 1)).toEqual({ burnAmount: 9, treasuryAmount: 990, burnPercentage: 1 });
  });

  test('a zero percentage burns nothing', () => {
    expect(calculateBurnSplit(500, 0)).toEqual({ burnAmount: 0, treasuryAmount: 500, burnPercentage: 0 });
  });

  test('a 100% burn sends the full amount to burn', () => {
    expect(calculateBurnSplit(500, 100)).toEqual({ burnAmount: 500, treasuryAmount: 0, burnPercentage: 100 });
  });
});

describe('shouldUseDynamic', () => {
  test('returns true for supply-dependent activities', () => {
    expect(shouldUseDynamic('cash_out')).toBe(true);
    expect(shouldUseDynamic('marketplace_purchase')).toBe(true);
    expect(shouldUseDynamic('wallet_transfer')).toBe(true);
  });

  test('returns false for activities without dynamic thresholds', () => {
    expect(shouldUseDynamic('validator_penalty')).toBe(false);
    expect(shouldUseDynamic('unknown_activity')).toBe(false);
  });
});

describe('getStaticBurnRate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the configured burn percentage for an enabled policy', async () => {
    BurnPolicy.findOne.mockResolvedValue({ burnPercentage: 5 });
    const rate = await getStaticBurnRate('lost_recovery');
    expect(rate).toBe(5);
    expect(BurnPolicy.findOne).toHaveBeenCalledWith({ activity: 'lost_recovery', enabled: true });
  });

  test('returns 0 when no policy is configured', async () => {
    BurnPolicy.findOne.mockResolvedValue(null);
    expect(await getStaticBurnRate('unknown')).toBe(0);
  });

  test('returns 0 and does not throw when the lookup fails', async () => {
    BurnPolicy.findOne.mockRejectedValue(new Error('db down'));
    expect(await getStaticBurnRate('cash_out')).toBe(0);
  });
});

describe('getDynamicBurnRate', () => {
  const sortMock = (docs) => ({ sort: jest.fn().mockResolvedValue(docs) });

  beforeEach(() => jest.clearAllMocks());

  test('picks the first threshold the current supply satisfies (highest first)', async () => {
    DynamicBurnThreshold.find.mockReturnValue(
      sortMock([
        { supplyThreshold: 500000000, burnPercentage: 30 },
        { supplyThreshold: 200000000, burnPercentage: 20 },
        { supplyThreshold: 100000000, burnPercentage: 10 },
      ])
    );

    expect(await getDynamicBurnRate('cash_out', 250000000)).toBe(20);
  });

  test('returns 0 when supply is below every threshold', async () => {
    DynamicBurnThreshold.find.mockReturnValue(sortMock([{ supplyThreshold: 100000000, burnPercentage: 10 }]));

    expect(await getDynamicBurnRate('cash_out', 50)).toBe(0);
  });

  test('returns 0 and does not throw when the lookup fails', async () => {
    DynamicBurnThreshold.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error('db down')) });

    expect(await getDynamicBurnRate('cash_out', 250000000)).toBe(0);
  });
});

describe('getEffectiveBurnRate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('prefers the dynamic rate for dynamic activities when one applies', async () => {
    DynamicBurnThreshold.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([{ supplyThreshold: 0, burnPercentage: 15 }]),
    });

    expect(await getEffectiveBurnRate('cash_out', 1000)).toBe(15);
    expect(BurnPolicy.findOne).not.toHaveBeenCalled();
  });

  test('falls back to the static rate when no dynamic threshold matches', async () => {
    DynamicBurnThreshold.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    BurnPolicy.findOne.mockResolvedValue({ burnPercentage: 2 });

    expect(await getEffectiveBurnRate('cash_out', 1000)).toBe(2);
  });

  test('uses the static rate directly for non-dynamic activities', async () => {
    BurnPolicy.findOne.mockResolvedValue({ burnPercentage: 100 });

    expect(await getEffectiveBurnRate('validator_penalty', 1000)).toBe(100);
    expect(DynamicBurnThreshold.find).not.toHaveBeenCalled();
  });
});
