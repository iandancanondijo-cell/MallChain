// Regression coverage for JWT revocation (middleware/tokenDenylist.js):
// previously, "logging out" only ever cleared the token client-side — the
// JWT itself stayed valid server-side until it naturally expired, and
// SecuritySettings' "Sign Out Everywhere" button did the exact same
// single-device local clear despite its name, revoking nothing on any
// other device holding a token for that account.
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));
jest.mock('../middleware/tokenDenylist', () => ({
  isRevoked: jest.fn().mockResolvedValue(false),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));

const User = require('../models/user');
const { isRevoked, revokeToken, revokeAllUserTokens } = require('../middleware/tokenDenylist');
const auth = require('../middleware/auth');
const authCtrl = require('../controllers/authController');

function selectable(user) {
  return { select: jest.fn().mockResolvedValue(user) };
}

describe('requireAuth — token revocation check', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.get('/protected', auth, (req, res) => res.json({ ok: true }));
  });

  test('allows a request when the token is not revoked', async () => {
    isRevoked.mockResolvedValue(false);
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com' }));
    const token = jwt.sign({ userId: 'u1', jti: 'jti-1' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(isRevoked).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', jti: 'jti-1' }));
  });

  test('rejects a request when the token has been revoked', async () => {
    isRevoked.mockResolvedValue(true);
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com' }));
    const token = jwt.sign({ userId: 'u1', jti: 'jti-revoked' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid token');
    // A revoked token must never reach the database lookup.
    expect(User.findById).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    isRevoked.mockResolvedValue(false);
    app = express();
    app.use(express.json());
    app.post('/logout', auth, authCtrl.logout);
  });

  test('revokes the calling token by jti with a ttl matching its remaining life', async () => {
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com' }));
    const token = jwt.sign({ userId: 'u1', jti: 'jti-logout' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).post('/logout').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(revokeToken).toHaveBeenCalledTimes(1);
    const [jti, ttlSeconds] = revokeToken.mock.calls[0];
    expect(jti).toBe('jti-logout');
    // ~10 minutes = 600s, allow slack for test execution time.
    expect(ttlSeconds).toBeGreaterThan(590);
    expect(ttlSeconds).toBeLessThanOrEqual(600);
  });
});

describe('POST /api/auth/refresh', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    isRevoked.mockResolvedValue(false);
    app = express();
    app.use(express.json());
    app.post('/refresh', auth, authCtrl.refresh);
  });

  test('issues a fresh cookie with a new jti and revokes the old one', async () => {
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com', username: 'a' }));
    const oldToken = jwt.sign({ userId: 'u1', jti: 'jti-old', username: 'a' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).post('/refresh').set('Authorization', `Bearer ${oldToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.expiresAt).toBe('number');

    // The new session cookie must carry a genuinely different token — not
    // a re-signed copy of the same jti (that would defeat revoking it).
    const setCookie = res.headers['set-cookie'] || [];
    const authCookie = setCookie.find((c) => c.startsWith('auth_token='));
    expect(authCookie).toBeDefined();
    const newToken = authCookie.split(';')[0].split('=')[1];
    const decoded = jwt.verify(newToken, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('u1');
    expect(decoded.jti).not.toBe('jti-old');
    expect(decoded.exp).toBe(res.body.expiresAt);

    // The pre-rotation token must be revoked immediately, not left to
    // expire naturally — same reasoning as an explicit logout.
    expect(revokeToken).toHaveBeenCalledTimes(1);
    const [jti, ttlSeconds] = revokeToken.mock.calls[0];
    expect(jti).toBe('jti-old');
    expect(ttlSeconds).toBeGreaterThan(590);
    expect(ttlSeconds).toBeLessThanOrEqual(600);
  });

  test('rejects when the calling token is already revoked', async () => {
    isRevoked.mockResolvedValue(true);
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com' }));
    const token = jwt.sign({ userId: 'u1', jti: 'jti-dead' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).post('/refresh').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(revokeToken).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout-everywhere', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    isRevoked.mockResolvedValue(false);
    app = express();
    app.use(express.json());
    app.post('/logout-everywhere', auth, authCtrl.logoutEverywhere);
  });

  test('revokes every token for the authenticated user', async () => {
    User.findById.mockReturnValue(selectable({ _id: 'u1', email: 'a@x.com' }));
    const token = jwt.sign({ userId: 'u1', jti: 'jti-x' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app).post('/logout-everywhere').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(revokeAllUserTokens).toHaveBeenCalledWith('u1');
  });
});
