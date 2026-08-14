const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
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

describe('POST /api/auth/register — user payload + referral bonus', () => {
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
    expect(res.body.token).toBe('signed.jwt.token');
    expect(res.body.user).toMatchObject({ email: 'new@x.com', role: 'user', banned: false, kycLevel: 1 });
    expect(created.referralCode).toMatch(/^MALL-/);
    expect(created.save).toHaveBeenCalled();
  });

  test('credits the referrer when a valid referralCode is supplied at signup', async () => {
    const referrer = { _id: 'referrer1', referralCode: 'MALL-REF1' };
    User.findOne
      .mockResolvedValueOnce(null) // existing-email check
      .mockResolvedValueOnce(referrer); // referralCode lookup
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    const created = fakeCreatedUser();
    User.create.mockResolvedValue(created);

    await request(app).post('/api/auth/register').send({ email: 'new@x.com', password: 'pw123456', referralCode: 'mall-ref1' });

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ referredBy: 'referrer1' }));
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('referrer1', {
      $inc: { referralCount: 1, referralEarnings: 10 },
    });
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
    User.findOne.mockResolvedValue({
      _id: 'u1', email: 'banned@x.com', password: 'hashed', banned: true, kycLevel: 1, role: 'user',
      save: jest.fn().mockResolvedValue(undefined),
    });

    const res = await request(app).post('/api/auth/login').send({ email: 'banned@x.com', password: 'pw123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.banned).toBe(true);
  });
});
