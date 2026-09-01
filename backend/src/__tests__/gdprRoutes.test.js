const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');

let mockUser = null;
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = mockUser;
    next();
  })
);
jest.mock('../services/gdprService', () => ({
  exportUserData: jest.fn().mockResolvedValue({ account: {} }),
  eraseUserData: jest.fn().mockResolvedValue({ ok: true, erasedAt: new Date() }),
}));

const { exportUserData, eraseUserData } = require('../services/gdprService');
const gdprRoutes = require('../routes/gdpr');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/gdpr', gdprRoutes);
  return app;
}

describe('GET /api/gdpr/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'user-1' };
  });

  test('returns the export as a downloadable attachment', async () => {
    const res = await request(buildApp()).get('/api/gdpr/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(exportUserData).toHaveBeenCalledWith(mockUser);
  });
});

describe('POST /api/gdpr/delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires a password for a password-based account', async () => {
    mockUser = { _id: 'user-1', password: await bcrypt.hash('realpassword', 4) };

    const res = await request(buildApp()).post('/api/gdpr/delete').send({});

    expect(res.status).toBe(400);
    expect(eraseUserData).not.toHaveBeenCalled();
  });

  test('rejects an incorrect password without erasing anything', async () => {
    mockUser = { _id: 'user-1', password: await bcrypt.hash('realpassword', 4) };

    const res = await request(buildApp()).post('/api/gdpr/delete').send({ password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(eraseUserData).not.toHaveBeenCalled();
  });

  test('erases the account when the password matches', async () => {
    mockUser = { _id: 'user-1', password: await bcrypt.hash('realpassword', 4) };

    const res = await request(buildApp()).post('/api/gdpr/delete').send({ password: 'realpassword' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(eraseUserData).toHaveBeenCalledWith(mockUser);
  });

  test('a Google-only account (no password set) erases without a password', async () => {
    mockUser = { _id: 'user-1', googleId: 'g-123' };

    const res = await request(buildApp()).post('/api/gdpr/delete').send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(eraseUserData).toHaveBeenCalledWith(mockUser);
  });
});
