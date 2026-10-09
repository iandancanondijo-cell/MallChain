jest.mock('../models/Notification', () => ({
  create: jest.fn(),
}));
jest.mock('../models/UserSettings', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/NotificationQueue', () => ({
  insertMany: jest.fn(),
}));
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../services/smsService', () => ({
  sendSms: jest.fn(),
}));
jest.mock('../services/whatsappService', () => ({
  sendWhatsApp: jest.fn(),
}));

const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');
const NotificationQueue = require('../models/NotificationQueue');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { sendWhatsApp } = require('../services/whatsappService');
const { notify, notifyUser } = require('../services/notify');

describe('notify()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.io;
  });

  test('persists the notification and pushes it to the user\'s socket room when global.io exists', async () => {
    const doc = { _id: 'n1', kind: 'mines', title: 'Approved', body: 'nice', read: false, createdAt: new Date() };
    Notification.create.mockResolvedValue(doc);
    const emit = jest.fn();
    global.io = { to: jest.fn(() => ({ emit })) };

    const result = await notify('user1', { kind: 'mines', title: 'Approved', body: 'nice' });

    expect(Notification.create).toHaveBeenCalledWith({ userId: 'user1', kind: 'mines', title: 'Approved', body: 'nice' });
    expect(global.io.to).toHaveBeenCalledWith('user:user1');
    expect(emit).toHaveBeenCalledWith('notification', expect.objectContaining({ _id: 'n1', title: 'Approved' }));
    expect(result).toBe(doc);
  });

  test('still persists when global.io is unset (no socket server in this process)', async () => {
    const doc = { _id: 'n1', title: 'X' };
    Notification.create.mockResolvedValue(doc);

    const result = await notify('user1', { title: 'X' });

    expect(result).toBe(doc);
  });

  test('swallows a DB failure instead of throwing — a notification must never break the calling action', async () => {
    Notification.create.mockRejectedValue(new Error('db down'));

    await expect(notify('user1', { title: 'X' })).resolves.toBeNull();
  });

  test('no-ops without throwing when userId or title is missing', async () => {
    await expect(notify(null, { title: 'X' })).resolves.toBeNull();
    await expect(notify('user1', { title: '' })).resolves.toBeNull();
    expect(Notification.create).not.toHaveBeenCalled();
  });
});

describe('notifyUser()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.io;
    Notification.create.mockResolvedValue({ _id: 'n1', title: 'Badge earned' });
  });

  test('always writes the in-app notification regardless of preferences', async () => {
    UserSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(Notification.create).toHaveBeenCalledWith({ userId: 'user1', kind: 'system', title: 'Badge earned', body: 'nice' });
  });

  test('sends email when badgeAlerts is enabled (or unset, defaulting on) and the user has an email', async () => {
    UserSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(sendEmail).toHaveBeenCalledWith('a@b.com', 'Badge earned', 'nice');
  });

  test('does not send email when the user has explicitly disabled badgeAlerts for email', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { email: { badgeAlerts: false } } }),
    });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sends SMS only when explicitly enabled (defaults off, unlike email)', async () => {
    UserSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await notifyUser({ _id: 'user1', phone: '254700000000' }, { title: 'Badge earned', body: 'nice' });
    expect(sendSms).not.toHaveBeenCalled();

    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { sms: { badgeAlerts: true } } }),
    });
    await notifyUser({ _id: 'user1', phone: '254700000000' }, { title: 'Badge earned', body: 'nice' });
    expect(sendSms).toHaveBeenCalledWith('254700000000', 'Badge earned — nice');
  });

  test('sends WhatsApp only when explicitly enabled (defaults off)', async () => {
    UserSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await notifyUser({ _id: 'user1', phone: '254700000000' }, { title: 'Badge earned', body: 'nice' });
    expect(sendWhatsApp).not.toHaveBeenCalled();

    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { whatsapp: { badgeAlerts: true } } }),
    });
    await notifyUser({ _id: 'user1', phone: '254700000000' }, { title: 'Badge earned', body: 'nice' });
    expect(sendWhatsApp).toHaveBeenCalledWith('254700000000', 'Badge earned\nnice');
  });

  test('never throws even if UserSettings lookup fails', async () => {
    UserSettings.findOne.mockImplementation(() => { throw new Error('db down'); });

    await expect(notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'X', body: 'y' })).resolves.toBeUndefined();
  });

  test('no-ops without throwing when user or title is missing', async () => {
    await expect(notifyUser(null, { title: 'X' })).resolves.toBeUndefined();
    await expect(notifyUser({ _id: 'user1' }, { title: '' })).resolves.toBeUndefined();
    expect(Notification.create).not.toHaveBeenCalled();
  });
});

describe('notifyUser() — delivery frequency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.io;
    Notification.create.mockResolvedValue({ _id: 'n1', title: 'Badge earned' });
  });

  test('realtime (default / unset) sends external channels immediately', async () => {
    UserSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(sendEmail).toHaveBeenCalledWith('a@b.com', 'Badge earned', 'nice');
    expect(NotificationQueue.insertMany).not.toHaveBeenCalled();
  });

  test('hourly frequency queues external channels instead of sending now', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { frequency: 'hourly', email: { badgeAlerts: true } } }),
    });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(NotificationQueue.insertMany).toHaveBeenCalledTimes(1);
    const queued = NotificationQueue.insertMany.mock.calls[0][0];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId: 'user1', channel: 'email', title: 'Badge earned', body: 'nice' });
    // flushAfter ~1h out.
    const delta = new Date(queued[0].flushAfter).getTime() - Date.now();
    expect(delta).toBeGreaterThan(50 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test('daily frequency queues with a ~24h flushAfter', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { frequency: 'daily', email: { badgeAlerts: true } } }),
    });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    expect(NotificationQueue.insertMany).toHaveBeenCalledTimes(1);
    const queued = NotificationQueue.insertMany.mock.calls[0][0];
    const delta = new Date(queued[0].flushAfter).getTime() - Date.now();
    expect(delta).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test('digest mode still writes the in-app notification instantly', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { frequency: 'daily', email: { badgeAlerts: true } } }),
    });

    await notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'Badge earned', body: 'nice' });

    // In-app is always created, even when external channels are queued.
    expect(Notification.create).toHaveBeenCalledWith({ userId: 'user1', kind: 'system', title: 'Badge earned', body: 'nice' });
  });

  test('queues one entry per opted-in external channel', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        notifications: {
          frequency: 'hourly',
          email: { badgeAlerts: true },
          sms: { badgeAlerts: true },
          whatsapp: { badgeAlerts: true },
        },
      }),
    });

    await notifyUser({ _id: 'user1', email: 'a@b.com', phone: '254700000000' }, { title: 'T', body: 'b' });

    const queued = NotificationQueue.insertMany.mock.calls[0][0];
    expect(queued.map((q) => q.channel).sort()).toEqual(['email', 'sms', 'whatsapp']);
  });

  test('never throws even if queueing the digest fails', async () => {
    UserSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ notifications: { frequency: 'hourly', email: { badgeAlerts: true } } }),
    });
    NotificationQueue.insertMany.mockRejectedValue(new Error('db down'));

    await expect(notifyUser({ _id: 'user1', email: 'a@b.com' }, { title: 'X', body: 'y' })).resolves.toBeUndefined();
  });
});
