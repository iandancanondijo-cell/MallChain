const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/transaction', () => ({
  create: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../queue/transactionQueue', () => {
  const addMock = jest.fn().mockResolvedValue({ id: 'job-1' });
  return {
    getTransactionQueue: jest.fn(() => ({
      add: addMock,
    })),
    __addMock: addMock,
  };
});

jest.mock('../middleware/authCache', () => ({
  getCachedUser: jest.fn().mockResolvedValue(null),
  setCachedUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/tokenDenylist', () => ({
  isRevoked: jest.fn().mockResolvedValue(false),
}));

jest.mock('../utils/activityTracker', () => ({
  markActiveToday: jest.fn(),
}));

const User = require('../models/user');
const Transaction = require('../models/transaction');
const { getTransactionQueue, __addMock: addMock } = require('../queue/transactionQueue');
const transactionsRouter = require('../routes/transactions');

function authHeader(userId = 'user-1') {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/transactions/send', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'test@example.com', role: 'user' }),
    });
    Transaction.create.mockResolvedValue({ _id: 'tx-1', status: 'queued' });
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .send({ from: 'addr1', to: 'addr2', amount: '100', denom: 'mlcoin' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing auth token/);
  });

  test('validates required fields', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('rejects negative amounts', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: 'addr1', to: 'addr2', amount: '-100', denom: 'mlcoin' });

    expect(res.status).toBe(400);
  });

  test('rejects invalid denom', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: 'addr1', to: 'addr2', amount: '100', denom: 'bitcoin' });

    expect(res.status).toBe(400);
  });

  test('accepts valid transaction', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: 'addr1', to: 'addr2', amount: '100', denom: 'mlcoin' });

    expect(res.status).toBe(200);
    expect(Transaction.create).toHaveBeenCalled();
    expect(addMock).toHaveBeenCalled();
  });
});

describe('GET /api/transactions/:id', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Transaction.findById.mockResolvedValue({ _id: 'tx123', status: 'queued' });
  });

  test('does not require authentication for GET', async () => {
    const res = await request(app).get('/api/transactions/tx123');

    expect(res.status).not.toBe(401);
  });
});
