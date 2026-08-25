jest.mock('../models/Notification', () => ({
  create: jest.fn(),
}));
jest.mock('../models/UserSettings', () => ({
  findOne: jest.fn(),
}));
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../services/smsService', () => ({
  sendSms: jest.fn(),
}));

const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
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
