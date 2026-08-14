const request = require('supertest');
const express = require('express');

jest.mock('../models/Notification', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const Notification = require('../models/Notification');
const notificationsRoutes = require('../routes/notifications');

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

  test('GET /me returns only the authenticated user\'s notifications, newest first', async () => {
    const rows = [{ _id: 'n2', title: 'B' }, { _id: 'n1', title: 'A' }];
    Notification.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    });

    const res = await request(app).get('/api/notifications/me');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual(rows);
    expect(Notification.find).toHaveBeenCalledWith({ userId: 'user1' });
  });

  test('POST /read/:id marks only the caller\'s own notification as read', async () => {
    Notification.findOneAndUpdate.mockResolvedValue({ _id: 'n1', read: true });

    const res = await request(app).post('/api/notifications/read/n1');

    expect(res.status).toBe(200);
    expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'n1', userId: 'user1' },
      { $set: { read: true } },
      { new: true }
    );
  });

  test('POST /read/:id 404s when the notification does not belong to the caller', async () => {
    Notification.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app).post('/api/notifications/read/not-mine');

    expect(res.status).toBe(404);
  });

  test('POST /read-all marks every unread notification for the caller as read', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const res = await request(app).post('/api/notifications/read-all');

    expect(res.status).toBe(200);
    expect(Notification.updateMany).toHaveBeenCalledWith({ userId: 'user1', read: false }, { $set: { read: true } });
  });
});
