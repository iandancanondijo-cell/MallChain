jest.mock('../models/user', () => ({ find: jest.fn() }));
jest.mock('../models/BadgeIssuance', () => ({ create: jest.fn() }));
jest.mock('../services/badgeService', () => ({ getUserBadgeInfo: jest.fn() }));
jest.mock('../services/badgeTxBuilder', () => ({ issueBadgeFromMnemonic: jest.fn() }));
jest.mock('../utils/activityTracker', () => ({ getConsecutiveActiveDays: jest.fn() }));
jest.mock('../services/notify', () => ({ notifyUser: jest.fn() }));

const User = require('../models/user');
const BadgeIssuance = require('../models/BadgeIssuance');
const { getUserBadgeInfo } = require('../services/badgeService');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { getConsecutiveActiveDays } = require('../utils/activityTracker');
const { notifyUser } = require('../services/notify');
const { runBadgeSnapshot } = require('../jobs/badgeSnapshot');

function mockUsers(users) {
  User.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(users),
  });
}

describe('runBadgeSnapshot', () => {
  const NOW = new Date('2026-08-14T00:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPERATOR_MNEMONIC = 'test operator mnemonic';
  });

  afterEach(() => {
    delete process.env.OPERATOR_MNEMONIC;
  });

  test('skips entirely (no error) when OPERATOR_MNEMONIC is not configured', async () => {
    delete process.env.OPERATOR_MNEMONIC;
    mockUsers([{ _id: 'u1', walletAddress: 'mall1a' }]);

    const stats = await runBadgeSnapshot(NOW);

    expect(stats).toEqual({ processed: 0, issued: 0, reminded: 0, missed: 0, errors: 0 });
    expect(User.find).not.toHaveBeenCalled();
  });

  test('existing badge holders get a reminder, not a re-issuance attempt', async () => {
    mockUsers([{ _id: 'u1', walletAddress: 'mall1a', email: 'a@b.com' }]);
    getUserBadgeInfo.mockResolvedValue({ exists: true });

    const stats = await runBadgeSnapshot(NOW);

    expect(stats).toMatchObject({ processed: 1, reminded: 1, issued: 0, missed: 0 });
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'u1' }),
      expect.objectContaining({ title: expect.stringContaining('opens tomorrow') })
    );
  });

  test('a satisfied streak issues a badge, logs the issuance, and notifies', async () => {
    mockUsers([{ _id: 'u1', walletAddress: 'mall1a', email: 'a@b.com' }]);
    getUserBadgeInfo.mockResolvedValue({ exists: false });
    getConsecutiveActiveDays.mockResolvedValue(true);
    issueBadgeFromMnemonic.mockResolvedValue({ txHash: 'HASH1' });

    const stats = await runBadgeSnapshot(NOW);

    expect(stats).toMatchObject({ processed: 1, issued: 1, reminded: 0, missed: 0 });
    expect(issueBadgeFromMnemonic).toHaveBeenCalledWith({
      mnemonic: 'test operator mnemonic',
      recipient: 'mall1a',
      badgeType: 'gold',
    });
    expect(BadgeIssuance.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', walletAddress: 'mall1a', method: 'streak', txHash: 'HASH1' })
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'u1' }),
      expect.objectContaining({ title: expect.stringContaining('earned your badge') })
    );
  });

  test('a broken streak notifies without issuing anything', async () => {
    mockUsers([{ _id: 'u1', walletAddress: 'mall1a', email: 'a@b.com' }]);
    getUserBadgeInfo.mockResolvedValue({ exists: false });
    getConsecutiveActiveDays.mockResolvedValue(false);

    const stats = await runBadgeSnapshot(NOW);

    expect(stats).toMatchObject({ processed: 1, issued: 0, reminded: 0, missed: 1 });
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'u1' }),
      expect.objectContaining({ title: expect.stringContaining('missed') })
    );
  });

  test("one user's failure does not abort the batch — every other user still gets processed", async () => {
    mockUsers([
      { _id: 'u1', walletAddress: 'mall1a', email: 'a@b.com' },
      { _id: 'u2', walletAddress: 'mall1b', email: 'b@b.com' },
    ]);
    getUserBadgeInfo
      .mockRejectedValueOnce(new Error('chain unreachable'))
      .mockResolvedValueOnce({ exists: true });

    const stats = await runBadgeSnapshot(NOW);

    expect(stats).toMatchObject({ processed: 2, errors: 1, reminded: 1 });
    // The second user's reminder still went out despite the first failing.
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });
});
