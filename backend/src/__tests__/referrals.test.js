const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/WalletTransaction', () => ({
  create: jest.fn(),
}));
jest.mock('mongoose', () => ({
  startSession: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const mongoose = require('mongoose');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const referralsRoutes = require('../routes/referrals');

describe('referrals routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/referrals', referralsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.startSession.mockResolvedValue({
      withTransaction: async (fn) => fn(),
      endSession: jest.fn(),
    });
    WalletTransaction.create.mockResolvedValue([{}]);
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('GET / returns the caller\'s referral stats', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', referralCode: 'MALL-ABC', referralEarnings: 30, referralCount: 3, referralClaimed: 10 });

    const res = await request(app).get('/api/referrals');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 'MALL-ABC', earned: 30, count: 3, claimed: 10 });
  });

  test('POST /claim credits mlpts_balance and marks the full amount claimed', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', referralEarnings: 30, referralClaimed: 10 });

    const res = await request(app).post('/api/referrals/claim');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, claimed: 20, message: 'Claimed 20 MLPTS' });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user1',
      { $set: { referralClaimed: 30 }, $inc: { mlpts_balance: 20 } },
      expect.any(Object)
    );
    expect(WalletTransaction.create).toHaveBeenCalledWith(
      [expect.objectContaining({ user_id: 'user1', amount: 20, type: 'credit' })],
      expect.any(Object)
    );
  });

  test('POST /claim rejects when there is nothing unclaimed', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', referralEarnings: 10, referralClaimed: 10 });

    const res = await request(app).post('/api/referrals/claim');

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
