const request = require('supertest');
const express = require('express');

// Current route shape (routes/notifications.js):
//   GET    /api/notifications            list (userId + archived:false, newest first)
//   GET    /api/notifications/unread-count
//   PATCH  /api/notifications/:id/read   mark one read (owner-scoped)
//   PATCH  /api/notifications/read-all   mark all read
//   POST   /api/notifications/send       dispatch via NotificationDispatcher
//   POST   /api/notifications/test       self-test dispatch
// Auth is router.use(requireAuth()) — a factory, so the mock must be double-
// callable — and dispatching goes through services/notificationDispatcher.
jest.mock('../models/Notification', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../middleware/requireAuth', () =>
  jest.fn(() => (req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);
jest.mock('../services/notificationDispatcher', () => ({
  dispatchNotification: jest.fn(),
}));

const Notification = require('../models/Notification');
const { dispatchNotification } = require('../services/notificationDispatcher');
const notificationsRoutes = require('../routes/notifications');

function listChain(rows) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
  return chain;
}

describe('notifications routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET / returns only the authenticated user\'s non-archived notifications, newest first', async () => {
    const rows = [{ _id: 'n2', title: 'B' }, { _id: 'n1', title: 'A' }];
    Notification.find.mockReturnValue(listChain(rows));
    // total, then unreadCount — both countDocuments calls
    Notification.countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await request(app).get('/api/notifications?limit=50');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual(rows);
    expect(res.body.total).toBe(2);
    expect(res.body.unreadCount).toBe(1);
    expect(Notification.find).toHaveBeenCalledWith({ userId: 'user1', archived: false });
  });

  test('PATCH /:id/read marks only the caller\'s own notification as read', async () => {
    Notification.findOneAndUpdate.mockResolvedValue({ _id: 'n1', read: true });

    const res = await request(app).patch('/api/notifications/n1/read');

    expect(res.status).toBe(200);
    expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'n1', userId: 'user1' },
      expect.objectContaining({ read: true }),
      { new: true }
    );
  });

  test('PATCH /:id/read 404s when the notification does not belong to the caller', async () => {
    Notification.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app).patch('/api/notifications/not-mine/read');

    expect(res.status).toBe(404);
  });

  test('PATCH /read-all marks every unread notification for the caller as read', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const res = await request(app).patch('/api/notifications/read-all');

    expect(res.status).toBe(200);
    expect(res.body.modifiedCount).toBe(3);
    expect(Notification.updateMany).toHaveBeenCalledWith(
      { userId: 'user1', read: false },
      expect.objectContaining({ read: true })
    );
  });

  test('POST /send dispatches through the NotificationDispatcher', async () => {
    dispatchNotification.mockResolvedValue({
      success: true,
      notificationId: 'n9',
      channels: { inApp: true },
      deliveryStatus: { inApp: 'delivered' },
    });

    const res = await request(app)
      .post('/api/notifications/send')
      .send({ title: 'Badge ready', body: 'Your badge minted', category: 'badgeAlerts', metadata: { badge: 'gold' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      notificationId: 'n9',
      channels: { inApp: true },
      deliveryStatus: { inApp: 'delivered' },
    });
    // The route normalizes the plural frontend preference key 'badgeAlerts'
    // to the Notification enum value 'badge' before dispatching (a plural
    // category crashed Notification.create with a ValidationError — the bug
    // class this pipeline fixes).
    expect(dispatchNotification).toHaveBeenCalledWith('user1', 'badge', {
      title: 'Badge ready',
      message: 'Your badge minted',
      data: { badge: 'gold' },
    });
  });

  test('POST /send reports a dispatcher skip as a 200 with skipped:true (e.g. DND)', async () => {
    dispatchNotification.mockResolvedValue({ success: false, error: 'Do not disturb active' });

    const res = await request(app).post('/api/notifications/send').send({ title: 'Hi', body: 'there' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, skipped: true, reason: 'Do not disturb active' });
  });

  test('POST /send 400s without title and body', async () => {
    const res = await request(app).post('/api/notifications/send').send({ title: 'only title' });
    expect(res.status).toBe(400);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('unknown notification category falls back to the kind, else "system"', async () => {
    dispatchNotification.mockResolvedValue({ success: true, notificationId: 'n8', channels: {}, deliveryStatus: {} });

    await request(app).post('/api/notifications/send').send({ title: 'T', body: 'B', category: 'bogus', kind: 'security' });
    expect(dispatchNotification).toHaveBeenLastCalledWith('user1', 'security', expect.anything());

    await request(app).post('/api/notifications/send').send({ title: 'T', message: 'B' });
    expect(dispatchNotification).toHaveBeenLastCalledWith('user1', 'system', expect.anything());
  });
});
