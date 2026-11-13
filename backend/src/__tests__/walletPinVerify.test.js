/**
 * POST /api/wallet/pin/verify-pin — the response-code contract.
 *
 * Handoff §4 asked for this because two different failures used to share one
 * status with nothing but field presence to tell them apart: a wrong cipher
 * (`{ valid: false, attemptsRemaining }`) and an expired session that never
 * reached a comparison at all. The client (components/CipherChallenge.tsx)
 * counted a strike on whichever shape it could see, which is how a session
 * that ran out mid-unlock got charged against a credential that was never
 * checked. Every rejection now carries a `code`, and this file pins the enum
 * the route docblock advertises.
 *
 * The third-strike behaviour is pinned deliberately: the product rule the
 * owner set is three wrong verifications ⇒ the device drops the key material,
 * and the backend's third answer is the one response that carries BOTH
 * `locked: true` and `code: 'invalid_secret'`. Anything that makes the lock
 * flag look like "not a comparison" breaks that rule.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { _id: 'user-1' };
    next();
  },
}));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));
jest.mock('../models/PinAttempt', () => ({
  isLocked: jest.fn(),
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../models/user', () => ({ findById: jest.fn() }));
jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const PinAttempt = require('../models/PinAttempt');
const User = require('../models/user');

function app() {
  const e = express();
  e.use(express.json());
  e.use('/api/wallet/pin', require('../routes/walletPin'));
  return e;
}

/** The route reads the secret as `User.findById(id).select('+wallet.pinHash').lean()`. */
function userWithSecret(pinHash) {
  const doc = pinHash ? { _id: 'user-1', wallet: { pinHash } } : { _id: 'user-1', wallet: {} };
  User.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  PinAttempt.isLocked.mockResolvedValue(false);
  userWithSecret('$2b$10$serverhash');
});

describe('POST /api/wallet/pin/verify-pin response codes', () => {
  test('a rejected secret is 401 code invalid_secret and says how many attempts are left', async () => {
    bcrypt.compare.mockResolvedValue(false);
    PinAttempt.recordFailedAttempt.mockResolvedValue({ attempts: 1, locked: false, remainingSeconds: 0 });

    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'wrong-cipher' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      code: 'invalid_secret',
      valid: false,
      locked: false,
      attemptsRemaining: 2,
    });
  });

  test('the third failure is still a comparison: invalid_secret alongside the lock', async () => {
    bcrypt.compare.mockResolvedValue(false);
    PinAttempt.recordFailedAttempt.mockResolvedValue({ attempts: 3, locked: true, remainingSeconds: 300 });

    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'wrong-cipher' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_secret');
    expect(res.body.locked).toBe(true);
    expect(res.body.attemptsRemaining).toBe(0);
  });

  test('a secret submitted inside an existing lockout is 429 secret_locked — no comparison happened', async () => {
    PinAttempt.isLocked.mockResolvedValue(true);
    PinAttempt.findOne.mockResolvedValue({ lockedUntil: new Date(Date.now() + 120_000) });

    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'actually-correct-but-waiting' });

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ ok: false, code: 'secret_locked', locked: true });
    expect(res.body.remainingTime).toBeGreaterThan(100);
    expect(res.body.remainingTime).toBeLessThanOrEqual(120);
    // Nothing was compared, so nothing was counted.
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(PinAttempt.recordFailedAttempt).not.toHaveBeenCalled();
  });

  test('an account with no server-side secret says so by code, not just by prose', async () => {
    userWithSecret(null);

    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'anything-here' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('no_pin_set');
  });

  test('malformed input is rejected before any comparison, with its own code', async () => {
    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_secret_format');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('a matching secret is a plain 200 and clears the streak', async () => {
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app())
      .post('/api/wallet/pin/verify-pin')
      .send({ pin: 'riverstone-7' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, valid: true, locked: false });
    expect(PinAttempt.resetAttempts).toHaveBeenCalledWith('user-1');
  });
});
