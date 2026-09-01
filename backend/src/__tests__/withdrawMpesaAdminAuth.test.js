// POST /api/withdraw/mpesa has no way to prove the caller controls
// walletAddress (no signed txBytes, unlike /api/buy/sell) — it was
// reachable by anyone and could create fabricated withdrawal records or, if
// ENABLE_WITHDRAWAL_AUTO_PAYOUT is on, trigger a real Safaricom payout to an
// attacker-supplied phone number. This locks in that it now requires a real
// admin JWT, using the same unmocked requireAdmin path as adminAuth.test.js.
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));
jest.mock('../models/WithdrawalRequest', () => ({
  create: jest.fn(),
}));
jest.mock('../models/B2CPayout', () => ({
  create: jest.fn(),
}));
jest.mock('../services/b2cPayoutService', () => ({
  initiateB2CPayout: jest.fn(),
}));
jest.mock('../services/liquidityActivityService', () => ({
  recordWithdrawLiquidityActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/IdempotencyKey', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn().mockResolvedValue(undefined),
}));

const User = require('../models/user');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const withdrawRoutes = require('../routes/withdraw');

const VALID_BODY = {
  walletAddress: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
  phone: '254712345678',
  amountMlcns: 100,
  amountKes: 1500,
  currency: 'KES',
};

function selectable(user) {
  return { select: jest.fn().mockResolvedValue(user) };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/withdraw', withdrawRoutes);
  return app;
}

describe('POST /api/withdraw/mpesa admin gate', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test('rejects a request with no auth token', async () => {
    const res = await request(app)
      .post('/api/withdraw/mpesa')
      .set('Idempotency-Key', 'k1')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(WithdrawalRequest.create).not.toHaveBeenCalled();
  });

  test('rejects a valid token belonging to a non-admin user', async () => {
    User.findById.mockReturnValue(selectable({ email: 'user@x.com', role: 'user', banned: false }));
    const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const res = await request(app)
      .post('/api/withdraw/mpesa')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'k2')
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(WithdrawalRequest.create).not.toHaveBeenCalled();
  });
});
