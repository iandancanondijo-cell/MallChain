// Regression coverage for a real authorization bug: the banned check
// used to live INSIDE `if (role) { ... }` in requireAuth.js, meaning it
// only ever ran for the requireAdmin/requireSuperAdmin variants. The plain
// requireAuth() used by ordinary routes (send, withdraw, messaging, gdpr,
// ...) never checked `banned` at all — a banned user's still-valid JWT
// kept working normally everywhere except admin routes they never had
// access to anyway. The frontend's "frozen" banner (driven by GET
// /api/auth/me, which has its own separate auth check) was purely
// cosmetic against a direct API call.
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

jest.mock('../models/user', () => ({ findById: jest.fn() }));
jest.mock('../middleware/tokenDenylist', () => ({ isRevoked: jest.fn().mockResolvedValue(false) }));

const jwt = require('jsonwebtoken');
const User = require('../models/user');
const requireAuth = require('../middleware/requireAuth');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function tokenFor(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
}

describe('requireAuth — banned account', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a banned user on a PLAIN (no-role) authenticated route', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'u1', banned: true, role: 'user' }) });
    const middleware = requireAuth(); // plain requireAuth() — used by send/withdraw/messaging/gdpr/etc.
    const req = { headers: { authorization: `Bearer ${tokenFor('u1')}` } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'account is banned' });
    expect(next).not.toHaveBeenCalled();
  });

  test('still allows a non-banned user through the plain variant', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'u2', banned: false, role: 'user' }) });
    const middleware = requireAuth();
    const req = { headers: { authorization: `Bearer ${tokenFor('u2')}` } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.banned).toBe(false);
  });

  test('still rejects a banned admin on the requireAdmin variant (prior behavior, unchanged)', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'u3', banned: true, role: 'admin' }) });
    const middleware = requireAuth('admin');
    const req = { headers: { authorization: `Bearer ${tokenFor('u3')}` } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
