// Regression coverage for the badge-streak activity tracker: marking a day
// active must never throw/block the request it rides on, and a broken
// streak (or unavailable Redis) must read as "no badge" rather than
// silently granting one.

const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue('OK'),
  mget: jest.fn().mockResolvedValue([]),
  on: jest.fn(),
};

jest.mock('ioredis', () => jest.fn(() => mockRedis));

const { markActiveToday, getConsecutiveActiveDays, dayKey } = require('../utils/activityTracker');

// The module connects at require time; give its connect().then() a tick to run.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('activityTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('markActiveToday sets a Redis key scoped to the user and today (UTC)', async () => {
    await flush();
    await markActiveToday('user-1');
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^activity:user-1:\d{4}-\d{2}-\d{2}$/),
      '1',
      'EX',
      expect.any(Number)
    );
  });

  test('markActiveToday never throws even if Redis rejects', async () => {
    await flush();
    mockRedis.set.mockRejectedValueOnce(new Error('boom'));
    await expect(markActiveToday('user-1')).resolves.toBeUndefined();
  });

  test('getConsecutiveActiveDays returns true only when every day in the window has a hit', async () => {
    await flush();
    mockRedis.mget.mockResolvedValueOnce(['1', '1', '1']);
    const result = await getConsecutiveActiveDays('user-1', new Date('2026-08-20T00:00:00Z'), 3);
    expect(result).toBe(true);
    expect(mockRedis.mget).toHaveBeenCalledWith(
      'activity:user-1:2026-08-19',
      'activity:user-1:2026-08-18',
      'activity:user-1:2026-08-17'
    );
  });

  test('getConsecutiveActiveDays returns false when even one day in the window is missing', async () => {
    await flush();
    mockRedis.mget.mockResolvedValueOnce(['1', null, '1']);
    const result = await getConsecutiveActiveDays('user-1', new Date('2026-08-20T00:00:00Z'), 3);
    expect(result).toBe(false);
  });

  test('getConsecutiveActiveDays fails closed (false) if Redis errors', async () => {
    await flush();
    mockRedis.mget.mockRejectedValueOnce(new Error('boom'));
    const result = await getConsecutiveActiveDays('user-1', new Date('2026-08-20T00:00:00Z'), 3);
    expect(result).toBe(false);
  });

  test('dayKey formats as YYYY-MM-DD in UTC', () => {
    expect(dayKey(new Date('2026-08-20T23:59:59Z'))).toBe('2026-08-20');
  });
});
