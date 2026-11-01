/**
 * Session-expiry cooldown policy tests (middleware/sessionCooldown.js +
 * the authController/requireAuth wiring).
 *
 * Policy: 30 minutes of use → automatic logout → 15-minute sign-in cooldown
 * → sign-in attempts during the cooldown show the REMAINING time.
 *
 * Redis is faked (in-memory Map) via the mallwallet/queue/redis module, so
 * these tests exercise the real key scheme — session:current:{userId} and
 * login_cooldown:user:{userId} — without a live server and without leaking
 * lockouts into a developer's local Redis.
 */
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// ── In-memory Redis double (mock* names so the hoisted jest.mock factory
//    may reference them) ──────────────────────────────────────────────────
const mockStore = new Map();
let mockFailNextRedis = false; // simulates a Redis outage for fail-open/closed tests
let mockThrowOnCooldownGet = false; // outage limited to the cooldown key read

const mockRedisClient = {
  get: jest.fn(async (k) => {
    if (mockFailNextRedis) throw new Error('ECONNREFUSED (simulated)');
    if (mockThrowOnCooldownGet && k.startsWith('login_cooldown:')) throw new Error('ECONNREFUSED (simulated)');
    return mockStore.has(k) ? mockStore.get(k) : null;
  }),
  set: jest.fn(async (k, v, ...rest) => {
    if (mockFailNextRedis) throw new Error('ECONNREFUSED (simulated)');
    const nx = rest.includes('NX');
    if (nx && mockStore.has(k)) return null; // ioredis: NX against an existing key → null
    mockStore.set(k, String(v));
    return 'OK';
  }),
  incr: jest.fn(async (k) => {
    if (mockFailNextRedis) throw new Error('ECONNREFUSED (simulated)');
    const n = (Number(mockStore.get(k)) || 0) + 1;
    mockStore.set(k, String(n));
    return n;
  }),
  expire: jest.fn(async () => 1),
  del: jest.fn(async (k) => {
    if (mockFailNextRedis) throw new Error('ECONNREFUSED (simulated)');
    return mockStore.delete(k) ? 1 : 0;
  }),
  ttl: jest.fn(async () => 900),
  quit: jest.fn(async () => {}),
};
jest.mock('../mallwallet/queue/redis', () => () => mockRedisClient);

// ── Model / peripheral mocks ──────────────────────────────────────────────
jest.mock('../models/user', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/UserSettings', () => ({ findOne: jest.fn() }));
jest.mock('../middleware/tokenDenylist', () => ({
  isRevoked: jest.fn().mockResolvedValue(false),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/activityEvents', () => ({
  emitNewLogin: jest.fn().mockResolvedValue(undefined),
  emitAccountCreated: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => 'hash'),
}));

const User = require('../models/user');
const UserSettings = require('../models/UserSettings');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const { blindIndex } = require('../utils/fieldEncryption');

const USER_ID = '507f1f77bcf86cd7994390aa';
const EMAIL = 'cooldown-test@example.com';
const COOLDOWN_KEY = `login_cooldown:user:${USER_ID}`;
const STAMP_KEY = `session:current:${USER_ID}`;

function mockUserFound(user) {
  const doc = { save: jest.fn(async () => {}), ...user };
  User.findOne.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(doc) }));
}

beforeEach(() => {
  mockStore.clear();
  mockFailNextRedis = false;
  mockThrowOnCooldownGet = false;
  jest.clearAllMocks();
  UserSettings.findOne.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
});

describe('requireAuth — expired session → 401 session_expired + one-shot cooldown arming', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.get('/protected', auth, (req, res) => res.json({ ok: true }));
  });

  const expiredTokenWithExp = exp =>
    jwt.sign({ userId: USER_ID, username: 'u', exp, iat: exp - 1800 }, process.env.JWT_SECRET);

  test('expired token gets the session_expired shape and arms login_cooldown once', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    mockStore.set(STAMP_KEY, String(exp)); // this token IS the user's current session

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expiredTokenWithExp(exp)}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('session_expired');
    expect(res.body.cooldownMinutes).toBe(15);
    expect(mockStore.has(COOLDOWN_KEY)).toBe(true);
  });

  test('a stale tab with an OLDER expired token does not lock, and repeated 401s never extend the lock', async () => {
    const currentExp = Math.floor(Date.now() / 1000) - 60;
    mockStore.set(STAMP_KEY, String(currentExp));

    // First: the current session expires → cooldown armed.
    const res1 = await request(app).get('/protected').set('Authorization', `Bearer ${expiredTokenWithExp(currentExp)}`);
    expect(res1.status).toBe(401);
    const armedUntil = Number(mockStore.get(COOLDOWN_KEY));

    // Same tab retrying with the SAME token must not push the deadline out
    // (set-once via SET NX).
    const res1b = await request(app).get('/protected').set('Authorization', `Bearer ${expiredTokenWithExp(currentExp)}`);
    expect(res1b.status).toBe(401);
    expect(Number(mockStore.get(COOLDOWN_KEY))).toBe(armedUntil);

    // A stale tab posting a token with an OLDER exp must not re-arm after
    // the lock has gone (e.g. the user waited it out and the key expired).
    mockStore.delete(COOLDOWN_KEY);
    const olderExp = currentExp - 3600;
    const res2 = await request(app).get('/protected').set('Authorization', `Bearer ${expiredTokenWithExp(olderExp)}`);
    expect(res2.status).toBe(401);
    expect(res2.body.error).toBe('session_expired'); // same response shape…
    expect(mockStore.has(COOLDOWN_KEY)).toBe(false); // …but the lock was NOT re-armed
  });

  test('forged (bad-signature) "expired" token stays a plain invalid token — no cooldown keyed off an attacker-chosen userId', async () => {
    const forged = jwt.sign(
      { userId: USER_ID, username: 'u' },
      'wrong-secret-key-at-least-32-chars!!!',
      { expiresIn: '-1h' }
    );
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid token');
    expect(mockStore.has(COOLDOWN_KEY)).toBe(false);
  });

  test('arming fails OPEN when Redis is down — the client still gets session_expired', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    mockFailNextRedis = true;
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expiredTokenWithExp(exp)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('session_expired');
  });
});

describe('POST /api/auth/login — cooldown gate (post-lookup, pre-credential)', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/login', authCtrl.login);
  });

  const credentials = { email: EMAIL, password: 'whatever123' };

  test('login during cooldown → 423 login_cooldown with remaining seconds, BEFORE password verification', async () => {
    mockUserFound({ _id: USER_ID, email: 'enc', email_blind: blindIndex(EMAIL), password: 'hash' });
    mockStore.set(COOLDOWN_KEY, String(Math.floor(Date.now() / 1000) + 600));

    const res = await request(app).post('/login').send(credentials);

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('login_cooldown');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(550);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(600);
    // The whole point of the pre-credential ordering: bcrypt never ran.
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('cooldown expiry → login succeeds (fresh session stamped)', async () => {
    mockUserFound({ _id: USER_ID, email: 'enc', email_blind: blindIndex(EMAIL), password: 'hash' });
    // Expired-but-not-yet-vanished key (TTL lag): must NOT lock.
    mockStore.set(COOLDOWN_KEY, String(Math.floor(Date.now() / 1000) - 1));

    const res = await request(app).post('/login').send(credentials);

    expect(res.status).toBe(200);
    expect(typeof res.body.expiresAt).toBe('number');
    // signToken re-stamped the current session so stale tabs can't re-lock.
    expect(Number(mockStore.get(STAMP_KEY))).toBe(res.body.expiresAt);
    const setCookie = (res.headers['set-cookie'] || []).find(c => c.startsWith('auth_token='));
    expect(setCookie).toBeDefined();
  });

  test('Redis outage during the cooldown CHECK fails CLOSED (503) — never an unchecked login', async () => {
    mockUserFound({ _id: USER_ID, email: 'enc', email_blind: blindIndex(EMAIL), password: 'hash' });
    // Outage scoped to the login_cooldown key itself: the failed_login
    // lockout check (which runs earlier) passes cleanly, so the 503 can only
    // come from checkLoginCooldown's fail-closed branch.
    mockThrowOnCooldownGet = true;

    const res = await request(app).post('/login').send(credentials);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('service temporarily unavailable, please retry in a moment');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('register never meets the cooldown gate (new accounts unaffected)', async () => {
    User.findOne.mockResolvedValue(null); // no existing email
    User.create = jest.fn(async (doc) => ({ ...doc, _id: '607f1f77bcf86cd7994390bb', save: jest.fn(async () => {}) }));
    // A live cooldown on some other account must not touch signup.
    mockStore.set(COOLDOWN_KEY, String(Math.floor(Date.now() / 1000) + 600));

    const app2 = express();
    app2.use(express.json());
    app2.post('/register', authCtrl.register);
    const res = await request(app2).post('/register').send({ email: 'brand-new@example.com', password: 'whatever123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.expiresAt).toBe('number');
  });
});
