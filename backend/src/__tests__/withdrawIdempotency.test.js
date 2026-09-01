const request = require('supertest');
const express = require('express');

// initiateB2CPayout moves real money via Safaricom B2C with no dedupe key of
// its own — a client retry previously meant a second real payout for the
// same withdrawal intent. These tests lock in the Idempotency-Key
// requirement added to POST /api/withdraw/mpesa to close that gap.

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
// POST /mpesa now requires an authenticated admin (see withdraw.js) since it
// has no way to prove the caller controls walletAddress — stand in a fake
// admin so these tests keep exercising idempotency, not auth.
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: (req, res, next) => { req.user = { _id: 'admin1', email: 'admin@x.com', role: 'admin' }; next(); },
  requireSuperAdmin: (req, res, next) => next(),
}));

const WithdrawalRequest = require('../models/WithdrawalRequest');
const IdempotencyKey = require('../models/IdempotencyKey');
const withdrawRoutes = require('../routes/withdraw');

const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const VALID_PHONE = '254712345678';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/withdraw', withdrawRoutes);
  return app;
}

describe('POST /api/withdraw/mpesa idempotency', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    WithdrawalRequest.create.mockResolvedValue({
      withdrawalId: 'w1',
      status: 'pending_review',
      settlementMode: 'review',
      save: jest.fn().mockResolvedValue(undefined),
    });
  });

  const body = {
    walletAddress: VALID_ADDRESS,
    phone: VALID_PHONE,
    amountMlcns: 100,
    amountKes: 1500,
    currency: 'KES',
  };

  function mockFindOne(result) {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(result) });
  }

  test('rejects a request with no Idempotency-Key header', async () => {
    mockFindOne(null);

    const res = await request(app).post('/api/withdraw/mpesa').send(body);

    expect(res.status).toBe(400);
    expect(WithdrawalRequest.create).not.toHaveBeenCalled();
  });

  test('a fresh key proceeds and creates exactly one withdrawal', async () => {
    mockFindOne(null);

    const res = await request(app)
      .post('/api/withdraw/mpesa')
      .set('Idempotency-Key', 'withdraw-key-1')
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(WithdrawalRequest.create).toHaveBeenCalledTimes(1);
  });

  test('a duplicate-key race on create() blocks the second request instead of failing open', async () => {
    // Both requests' findOne sees no existing key (they raced before either
    // insert landed); the loser's create() hits the unique index and throws
    // a Mongo duplicate-key error. The middleware must not fall through to
    // the route handler in that case — a real payout must fire at most once.
    IdempotencyKey.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ key: 'withdraw-key-1', status: 'pending' }) });
    IdempotencyKey.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }));

    const res = await request(app)
      .post('/api/withdraw/mpesa')
      .set('Idempotency-Key', 'withdraw-key-1')
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.idempotent).toBe(true);
    expect(WithdrawalRequest.create).not.toHaveBeenCalled();
  });

  test('retrying the same key returns the cached response instead of creating a second withdrawal', async () => {
    mockFindOne({
      key: 'withdraw-key-1',
      status: 'success',
      result: { ok: true, withdrawalId: 'w1', status: 'pending_review' },
    });

    const res = await request(app)
      .post('/api/withdraw/mpesa')
      .set('Idempotency-Key', 'withdraw-key-1')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(WithdrawalRequest.create).not.toHaveBeenCalled();
  });
});
