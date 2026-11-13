// Regression test for a payload-key mismatch: authController.js's signToken()
// issues {userId, username, exp} (see jwt-payload.test.js), but requireAdmin/
// requireSuperAdmin read decoded.id — a leftover from before that migration.
// Every real login token would 401 here even for a genuine admin.
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  // requireAuth touches lastSeenAt for any superadmin on an authed request
  // (that is what /api/admin/presence reads). The legacy-payload case below
  // signs a superadmin token, so without this the middleware threw
  // "findByIdAndUpdate is not a function" and the route 401'd for a reason
  // that has nothing to do with what the test is about.
  findByIdAndUpdate: jest.fn().mockResolvedValue(null),
}));

// The same branch mirrors lastSeenAt into the auth cache; left unmocked it
// opens a real Redis client, which is both slow and keeps the process alive.
jest.mock('../middleware/authCache', () => ({
  getCachedUser: jest.fn().mockResolvedValue(null),
  setCachedUser: jest.fn().mockResolvedValue(undefined),
}));

const User = require('../models/user');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');

function selectable(user) {
  return { select: jest.fn().mockResolvedValue(user) };
}

describe('requireAdmin / requireSuperAdmin — JWT payload compatibility', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.get('/admin-only', requireAdmin, (req, res) => res.json({ ok: true, email: req.user.email }));
    app.get('/superadmin-only', requireSuperAdmin, (req, res) => res.json({ ok: true, email: req.user.email }));
  });

  test('accepts a real login token, which carries {userId}, not {id}', async () => {
    User.findById.mockReturnValue(selectable({ email: 'admin@x.com', role: 'admin', banned: false }));
    const token = jwt.sign({ userId: 'u1', username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(res.body.email).toBe('admin@x.com');
  });

  test('still accepts the legacy {id} payload format', async () => {
    User.findById.mockReturnValue(selectable({ email: 'admin@x.com', role: 'superadmin', banned: false }));
    const legacyToken = jwt.sign({ id: 'u2' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).get('/superadmin-only').set('Authorization', `Bearer ${legacyToken}`);

    expect(res.status).toBe(200);
    expect(User.findById).toHaveBeenCalledWith('u2');
  });

  test('rejects a non-admin user even with a valid token', async () => {
    User.findById.mockReturnValue(selectable({ email: 'user@x.com', role: 'user', banned: false }));
    const token = jwt.sign({ userId: 'u3' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
