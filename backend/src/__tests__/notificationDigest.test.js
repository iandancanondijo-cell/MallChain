jest.mock('../models/NotificationQueue', () => ({
  find: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));
jest.mock('../services/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('../services/smsService', () => ({ sendSms: jest.fn() }));
jest.mock('../services/whatsappService', () => ({ sendWhatsApp: jest.fn() }));

const NotificationQueue = require('../models/NotificationQueue');
const User = require('../models/user');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { sendWhatsApp } = require('../services/whatsappService');
const { flushDueDigests, buildDigestBody, buildDigestSubject } = require('../jobs/notificationDigest');

function dueEntries(entries) {
  NotificationQueue.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(entries),
  });
}

function mockUser(id, user) {
  User.findById.mockImplementation((uid) => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(uid === id ? user : null) }),
  }));
}

describe('notificationDigest job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NotificationQueue.deleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  describe('buildDigestBody / buildDigestSubject', () => {
    test('single entry reads as a plain notification', () => {
      expect(buildDigestSubject([{ title: 'Hi' }])).toBe('Hi');
      expect(buildDigestBody([{ title: 'Hi', body: 'there' }])).toBe('there');
    });

    test('multiple entries become a numbered digest', () => {
      const entries = [
        { title: 'A', body: 'first' },
        { title: 'B', body: 'second' },
      ];
      expect(buildDigestSubject(entries)).toBe('You have 2 new notifications');
      expect(buildDigestBody(entries)).toBe('You have 2 new notifications:\n1. A — first\n2. B — second');
    });
  });

  describe('flushDueDigests', () => {
    test('returns zero stats when nothing is due', async () => {
      dueEntries([]);
      const stats = await flushDueDigests();
      expect(stats).toEqual({ flushed: 0, sent: 0, failed: 0 });
      expect(NotificationQueue.deleteMany).not.toHaveBeenCalled();
    });

    test('sends one batched email per user and deletes the delivered entries', async () => {
      dueEntries([
        { _id: 'q1', userId: 'u1', channel: 'email', title: 'A', body: 'a' },
        { _id: 'q2', userId: 'u1', channel: 'email', title: 'B', body: 'b' },
      ]);
      mockUser('u1', { _id: 'u1', email: 'a@b.com', phone: null });
      sendEmail.mockResolvedValue(true);

      const stats = await flushDueDigests();

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith('a@b.com', 'You have 2 new notifications', expect.stringContaining('1. A'));
      expect(NotificationQueue.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['q1', 'q2'] } });
      expect(stats).toEqual({ flushed: 2, sent: 1, failed: 0 });
    });

    test('routes sms and whatsapp to the right channel service', async () => {
      dueEntries([
        { _id: 'q1', userId: 'u1', channel: 'sms', title: 'A', body: 'a' },
        { _id: 'q2', userId: 'u1', channel: 'whatsapp', title: 'B', body: 'b' },
      ]);
      mockUser('u1', { _id: 'u1', email: null, phone: '254700000000' });
      sendSms.mockResolvedValue(true);
      sendWhatsApp.mockResolvedValue(true);

      await flushDueDigests();

      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
      expect(NotificationQueue.deleteMany).toHaveBeenCalledTimes(2);
    });

    test('keeps entries queued for retry when a send fails', async () => {
      dueEntries([{ _id: 'q1', userId: 'u1', channel: 'email', title: 'A', body: 'a' }]);
      mockUser('u1', { _id: 'u1', email: 'a@b.com', phone: null });
      sendEmail.mockResolvedValue(false);

      const stats = await flushDueDigests();

      expect(NotificationQueue.deleteMany).not.toHaveBeenCalled();
      expect(stats).toEqual({ flushed: 1, sent: 0, failed: 1 });
    });

    test('drops entries when the user no longer exists', async () => {
      dueEntries([{ _id: 'q1', userId: 'gone', channel: 'email', title: 'A', body: 'a' }]);
      mockUser('gone', null);

      const stats = await flushDueDigests();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(NotificationQueue.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['q1'] } });
      expect(stats.sent).toBe(0);
    });

    test('drops channel entries the user has no destination for', async () => {
      dueEntries([{ _id: 'q1', userId: 'u1', channel: 'sms', title: 'A', body: 'a' }]);
      // User has email but no phone — sms has nowhere to go.
      mockUser('u1', { _id: 'u1', email: 'a@b.com', phone: null });

      await flushDueDigests();

      expect(sendSms).not.toHaveBeenCalled();
      expect(NotificationQueue.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['q1'] } });
    });
  });
});
