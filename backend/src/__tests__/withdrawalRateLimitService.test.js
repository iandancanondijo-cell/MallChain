jest.mock('../models/WithdrawalRequest', () => ({
  find: jest.fn(),
}));

const WithdrawalRequest = require('../models/WithdrawalRequest');
const { checkWeeklyWithdrawalLimit, WEEKLY_WITHDRAWAL_LIMIT } = require('../services/withdrawalRateLimitService');

function mockFind(docs) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  };
  WithdrawalRequest.find.mockReturnValue(chain);
  return chain;
}

describe('withdrawalRateLimitService.checkWeeklyWithdrawalLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults the weekly limit to 3', () => {
    expect(WEEKLY_WITHDRAWAL_LIMIT).toBe(3);
  });

  test('allows a withdrawal when under the limit', async () => {
    mockFind([{ createdAt: new Date() }, { createdAt: new Date() }]);
    const result = await checkWeeklyWithdrawalLimit('mall1address');
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
  });

  test('blocks the 4th withdrawal in the same rolling week and returns when the next slot frees up', async () => {
    const oldest = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000); // 6 days ago
    mockFind([
      { createdAt: oldest },
      { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { createdAt: new Date() },
    ]);

    const result = await checkWeeklyWithdrawalLimit('mall1address');
    expect(result.ok).toBe(false);
    expect(result.count).toBe(3);
    expect(result.limit).toBe(3);
    // The oldest counted request (6 days ago) ages out 7 days after it was made — 1 day from now.
    const expectedNextAvailable = new Date(oldest.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(new Date(result.nextAvailableAt).getTime()).toBeCloseTo(expectedNextAvailable.getTime(), -3);
  });

  test('queries excluding failed and refunded statuses so recoverable rejections do not burn a slot', async () => {
    mockFind([]);
    await checkWeeklyWithdrawalLimit('mall1address');
    const queryArg = WithdrawalRequest.find.mock.calls[0][0];
    expect(queryArg.status.$nin).toEqual(expect.arrayContaining(['failed', 'refunded']));
  });

  test('scopes the count to the given wallet address', async () => {
    mockFind([]);
    await checkWeeklyWithdrawalLimit('mall1specific');
    const queryArg = WithdrawalRequest.find.mock.calls[0][0];
    expect(queryArg.walletAddress).toBe('mall1specific');
  });
});
