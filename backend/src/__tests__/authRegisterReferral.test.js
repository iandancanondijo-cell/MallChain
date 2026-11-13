const request = require('supertest');
const express = require('express');
const { blindIndex } = require('../utils/fieldEncryption');

jest.mock('../models/user', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
// login's checkTwoFactor() always queries UserSettings; without this mock any
// login test in this file 500s hitting the real (unconnected) mongoose model.
jest.mock('../models/UserSettings', () => ({
  findOne: jest.fn(() => ({ select: jest.fn().mockResolvedValue(null) })),
}));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
  verify: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
process.env.SESSION_TTL_MIN = '120';

const User = require('../models/user');
const authController = require('../controllers/authController');

describe('POST /api/auth/register — user payload + referral attribution', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/api/auth/register', authController.register);
    app.post('/api/auth/login', authController.login);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // login() looks the account up as User.findOne({ email_blind }).select('+password')
  // — password is a select:false path, so the query has to stay chainable in
  // the mock. Register's duplicate check is a plain awaited findOne with no
  // projection, which is why those tests can keep using mockResolvedValue.
  function userQuery(doc) {
    return { select: jest.fn().mockResolvedValue(doc) };
  }

  function fakeCreatedUser(overrides = {}) {
    return {
      _id: 'newuser1',
      email: 'new@x.com',
      role: 'user',
      banned: false,
      kycLevel: 1,
      referralCode: undefined,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  test('returns the real user object (banned/kycLevel/role), not just a bare token', async () => {
    User.findOne.mockResolvedValue(null); // no existing email
    const created = fakeCreatedUser();
    User.create.mockResolvedValue(created);

    const res = await request(app).post('/api/auth/register').send({ email: 'new@x.com', password: 'pw123456' });

    expect(res.status).toBe(200);
    // The signed token now travels only via httpOnly cookie, never in the
    // JSON body (see the localStorage -> cookie migration) — the body just
    // carries the non-secret expiry marker the frontend uses for UI state.
    expect(res.body.token).toBeUndefined();
    expect(res.body.expiresAt).toBeDefined();
    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('auth_token=signed.jwt.token'))).toBe(true);
    expect(res.body.user).toMatchObject({ email: 'new@x.com', role: 'user', banned: false, kycLevel: 1 });
    // Signup deliberately does NOT mint a code. A referral code is earned by
    // connecting a wallet (authController.activateReferralCode, called from
    // linkWallet) — before that there is no address for a commission to be
    // claimed against, so an issued code would be a promise the product cannot
    // keep. The link tests that do pay live in linkWallet.test.js.
    expect(created.referralCode).toBeUndefined();
    expect(created.save).toHaveBeenCalled();
  });

  test('a valid referralCode at signup is recorded, but nobody is paid until the referee connects a wallet', async () => {
    const referrer = { _id: 'referrer1', referralCode: 'MALL-REF1' };
    User.findOne
      .mockResolvedValueOnce(null) // existing-email check
      .mockResolvedValueOnce(referrer); // referralCode lookup
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    const created = fakeCreatedUser();
    User.create.mockResolvedValue(created);

    await request(app).post('/api/auth/register').send({ email: 'new@x.com', password: 'pw123456', referralCode: 'mall-ref1' });

    // Attribution runs *after* User.create() (recordReferralAttribution needs
    // the new document to write onto), so referredBy is set by mutating the
    // created user and calling .save() — not passed as a User.create() argument.
    expect(created.referredBy).toBe('referrer1');
    expect(created.save).toHaveBeenCalled();
    // ...and the credit itself moved to the wallet-link path, so signup pays
    // no one. The link tests that do pay live in linkWallet.test.js.
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('signup with an unknown referralCode still succeeds, without crediting anyone', async () => {
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // code not found
    User.findByIdAndUpdate = jest.fn();
    const created = fakeCreatedUser();
    User.create.mockResolvedValue(created);

    const res = await request(app).post('/api/auth/register').send({ email: 'new@x.com', password: 'pw123456', referralCode: 'BOGUS' });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('login returns banned:true for a banned account', async () => {
    User.findOne.mockReturnValue(userQuery({
      _id: 'u1', email: 'banned@x.com', password: 'hashed', banned: true, kycLevel: 1, role: 'user',
      save: jest.fn().mockResolvedValue(undefined),
    }));

    const res = await request(app).post('/api/auth/login').send({ email: 'banned@x.com', password: 'pw123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.banned).toBe(true);
  });

  test('register lowercases a mixed-case email before the duplicate check and storage', async () => {
    User.findOne.mockResolvedValue(null);
    const created = fakeCreatedUser({ email: 'foo@example.com' });
    User.create.mockResolvedValue(created);

    const res = await request(app).post('/api/auth/register').send({ email: 'Foo@Example.com', password: 'pw123456' });

    expect(res.status).toBe(200);
    // email is encrypted at rest, so the duplicate check can only be made
    // against the deterministic blind index — but the value being indexed is
    // the LOWERCASED address, which is the behaviour under test here.
    expect(User.findOne).toHaveBeenCalledWith({ email_blind: blindIndex('foo@example.com') });
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'foo@example.com' }));
  });

  test('login looks up a mixed-case email address in lowercase', async () => {
    User.findOne.mockReturnValue(userQuery({
      _id: 'u2', email: 'foo@example.com', password: 'hashed', banned: false, kycLevel: 1, role: 'user',
      save: jest.fn().mockResolvedValue(undefined),
    }));

    const res = await request(app).post('/api/auth/login').send({ email: 'FOO@EXAMPLE.COM', password: 'pw123456' });

    expect(res.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ email_blind: blindIndex('foo@example.com') });
  });
});
