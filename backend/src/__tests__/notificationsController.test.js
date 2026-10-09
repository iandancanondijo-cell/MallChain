const request = require('supertest');
const express = require('express');

jest.mock('../models/Notification', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn(),
  isConfigured: jest.fn(),
}));
jest.mock('../services/smsService', () => ({
  sendSms: jest.fn(),
  isConfigured: jest.fn(),
}));
jest.mock('../services/whatsappService', () => ({
  sendWhatsApp: jest.fn(),
  isConfigured: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const Notification = require('../models/Notification');
const User = require('../models/user');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const whatsappService = require('../services/whatsappService');
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

describe('notification provider status + test', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /providers reports each channel\'s selected provider + configured flag', async () => {
    emailService.isConfigured.mockReturnValue(true);
    smsService.isConfigured.mockReturnValue(false);
    whatsappService.isConfigured.mockReturnValue(true);

    const res = await request(app).get('/api/notifications/providers');

    expect(res.status).toBe(200);
    expect(res.body.email.provider).toBe('sendgrid');
    expect(res.body.email.configured).toBe(true);
    expect(res.body.sms.configured).toBe(false);
    expect(res.body.whatsapp.provider).toBe('meta');
    expect(res.body.whatsapp.configured).toBe(true);
  });

  test('GET /providers never leaks secrets', async () => {
    emailService.isConfigured.mockReturnValue(true);
    smsService.isConfigured.mockReturnValue(false);
    whatsappService.isConfigured.mockReturnValue(false);

    const res = await request(app).get('/api/notifications/providers');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/apiKey|api_key|accessToken|token|secret/i);
  });

  test('POST /test sends email always, sms/whatsapp only when a phone exists', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user1', email: 'a@b.com', phone: '+254700000000' }) }) });
    emailService.sendEmail.mockResolvedValue(true);
    smsService.sendSms.mockResolvedValue(true);
    whatsappService.sendWhatsApp.mockResolvedValue(true);

    const res = await request(app).post('/api/notifications/test');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.results).toEqual({ email: true, sms: true, whatsapp: true });
    expect(emailService.sendEmail).toHaveBeenCalled();
    expect(smsService.sendSms).toHaveBeenCalled();
    // Test WhatsApp uses forceText so it doesn't burn a template send.
    expect(whatsappService.sendWhatsApp).toHaveBeenCalledWith(
      '+254700000000',
      expect.any(String),
      { forceText: true }
    );
  });

  test('POST /test only attempts email when no phone is on file', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user1', email: 'a@b.com', phone: null }) }) });
    emailService.sendEmail.mockResolvedValue(true);

    const res = await request(app).post('/api/notifications/test');

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual({ email: true, sms: false, whatsapp: false });
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsApp).not.toHaveBeenCalled();
  });

  test('POST /test 404s when the user does not exist', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });

    const res = await request(app).post('/api/notifications/test');
    expect(res.status).toBe(404);
  });
});
