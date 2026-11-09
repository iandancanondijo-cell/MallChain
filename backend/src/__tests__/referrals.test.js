const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  decryptUserPii: jest.fn((u) => u),
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
// routes/referrals.js syncs a claimed commission to the on-chain MallPointAccount
// inside the same transaction. The real service talks to a node and the queue,
// so it is stubbed — what these tests are about is which user fields gate the
// claim, not what the chain does with the credit.
jest.mock('../services/mallpointsService', () => ({
  syncMallPointAccount: jest.fn().mockResolvedValue({}),
  requireWalletAddress: jest.fn(),
}));

const mongoose = require('mongoose');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const referralsRoutes = require('../routes/referrals');

const WALLET = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

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
    User.findById.mockResolvedValue({ _id: 'user1', referralCode: 'MALL-ABC', walletAddress: WALLET, referralEarnings: 30, referralCount: 3, referralClaimed: 10 });

    const res = await request(app).get('/api/referrals');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 'MALL-ABC', walletConnected: true, earned: 30, count: 3, claimed: 10 });
  });

  // The rule this file used to break: `MALL-${username}` computed at read time
  // looked exactly like an issued code but was never in the database, so every
  // invite built on it credited nobody and said nothing. An account without a
  // connected wallet has no code, and the API now says so.
  test('GET / reports no code at all for an account that has not connected a wallet', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', referralCode: undefined, walletAddress: undefined, referralEarnings: 0, referralCount: 0, referralClaimed: 0 });

    const res = await request(app).get('/api/referrals');

    expect(res.status).toBe(200);
    expect(res.body.code).toBeNull();
    expect(res.body.walletConnected).toBe(false);
  });

  test('GET /code returns the stored code, and never a synthesised one', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', username: 'zoë', referralCode: 'MALL-ABC', walletAddress: WALLET });
    expect((await request(app).get('/api/referrals/code')).body).toEqual({ code: 'MALL-ABC', walletConnected: true });

    User.findById.mockResolvedValue({ _id: 'user1', username: 'zoë', referralCode: undefined, walletAddress: undefined });
    expect((await request(app).get('/api/referrals/code')).body).toEqual({ code: null, walletConnected: false });
  });

  test('POST /claim credits mlpts_balance and marks the full amount claimed', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', walletAddress: WALLET, referralEarnings: 30, referralClaimed: 10 });

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
    User.findById.mockResolvedValue({ _id: 'user1', walletAddress: WALLET, referralEarnings: 10, referralClaimed: 10 });

    const res = await request(app).post('/api/referrals/claim');

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  // A commission earned before the wallet was attached still cannot be spent
  // without one: the balance it would move is keyed to the address.
  test('POST /claim refuses an account with no wallet, even with rewards waiting', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', walletAddress: undefined, referralEarnings: 30, referralClaimed: 0 });

    const res = await request(app).post('/api/referrals/claim');

    expect(res.status).toBe(403);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
