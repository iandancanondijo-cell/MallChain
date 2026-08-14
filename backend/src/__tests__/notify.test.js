jest.mock('../models/Notification', () => ({
  create: jest.fn(),
}));

const Notification = require('../models/Notification');
const { notify } = require('../services/notify');

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
