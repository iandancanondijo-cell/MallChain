const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
}));

jest.mock('../utils/chainClient', () => ({
  getStargateClient: jest.fn(),
  queryChain: jest.fn(),
}));

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

jest.mock('axios');
const axios = require('axios');

const User = require('../models/user');
const onchainRouter = require('../routes/onchain');

function authHeader(userId = 'user-1') {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

describe('Onchain Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/onchain', onchainRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'test@example.com', role: 'user' }),
    });
    axios.get.mockResolvedValue({ data: {} });
    axios.post.mockResolvedValue({ data: { tx_response: {} } });
  });

  describe('POST /broadcast', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/onchain/broadcast')
        .send({ tx: { some: 'data' } });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/missing auth token/);
    });

    test('validates tx field is required', async () => {
      const res = await request(app)
        .post('/api/onchain/broadcast')
        .set(authHeader())
        .send({});

      expect(res.status).toBe(400);
    });

    test('accepts valid broadcast request', async () => {
      const res = await request(app)
        .post('/api/onchain/broadcast')
        .set(authHeader())
        .send({ tx: { body: { messages: [] } } });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(400);
    });
  });

  describe('GET endpoints', () => {
    test('GET /market/price does not require auth', async () => {
      const res = await request(app).get('/api/onchain/market/price');

      expect(res.status).not.toBe(401);
    });

    test('GET /wallet/:address/balance does not require auth', async () => {
      const res = await request(app).get('/api/onchain/wallet/addr123/balance');

      expect(res.status).not.toBe(401);
    });

    test('GET /tx/:txHash does not require auth', async () => {
      const res = await request(app).get('/api/onchain/tx/abc123');

      expect(res.status).not.toBe(401);
    });
  });
});
