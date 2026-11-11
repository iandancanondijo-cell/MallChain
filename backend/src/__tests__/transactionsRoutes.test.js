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

jest.mock('../mallwallet/queue/transactionQueue', () => {
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
const { getTransactionQueue, __addMock: addMock } = require('../mallwallet/queue/transactionQueue');
const transactionsRouter = require('../routes/transactions');

function authHeader(userId = 'user-1') {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

const FROM = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const TO = 'mall1qv8pjfp08fz4qkmxw97g0y5a4zemajw5d9nlcy';
// base64 of "signed" — the route only needs the value to be base64-shaped.
const SIGNED_TX = 'c2lnbmVk';

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
      .send({ from: FROM, to: TO, amount: '100', denom: 'mlcoin', signedTx: SIGNED_TX });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing auth token/);
  });

  // C2 regression: an unsigned body used to be accepted and signed by the
  // server with the operator key, which let any caller move system funds by
  // naming the (public, on-chain-observable) operator address.
  test('rejects a request with no signedTx instead of signing server-side', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '100', denom: 'mlcoin' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/signedTx is required/);
    expect(Transaction.create).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  test('ignores a serverSign flag even when the client sends one', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '100', denom: 'mlcoin', signedTx: SIGNED_TX, serverSign: true });

    // serverSign is not a declared key, and Joi rejects unknown fields — so the
    // request cannot reach the queue carrying it at all.
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  test('validates required fields', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('rejects a non-bech32 address', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: 'addr1', to: TO, amount: '100', denom: 'mlcoin', signedTx: SIGNED_TX });

    expect(res.status).toBe(400);
  });

  test('rejects negative amounts', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '-100', denom: 'mlcoin', signedTx: SIGNED_TX });

    expect(res.status).toBe(400);
  });

  test('rejects invalid denom', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '100', denom: 'bitcoin', signedTx: SIGNED_TX });

    expect(res.status).toBe(400);
  });

  test('rejects signedTx that is not base64', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '100', denom: 'mlcoin', signedTx: 'not base64!!' });

    expect(res.status).toBe(400);
  });

  test('rejects a signerPubKey that derives a different address than from', async () => {
    // 33 random bytes — whatever address this derives to, it is not FROM.
    const foreignPubKey = Buffer.alloc(33, 7).toString('base64');
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({
        from: FROM,
        to: TO,
        amount: '100',
        denom: 'mlcoin',
        signedTx: SIGNED_TX,
        signerPubKey: foreignPubKey,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pubkey does not match from address/);
    expect(addMock).not.toHaveBeenCalled();
  });

  test('accepts a valid client-signed transaction and queues it verbatim', async () => {
    const res = await request(app)
      .post('/api/transactions/send')
      .set(authHeader())
      .send({ from: FROM, to: TO, amount: '100', denom: 'mlcoin', signedTx: SIGNED_TX });

    expect(res.status).toBe(200);
    expect(Transaction.create).toHaveBeenCalled();
    expect(Transaction.create.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      from: FROM,
      to: TO,
      amount: '100',
      denom: 'mlcoin',
      status: 'queued',
    });
    expect(addMock).toHaveBeenCalled();
    const queued = addMock.mock.calls[0][1];
    expect(queued.signedTx).toBe(SIGNED_TX);
    expect(queued.serverSign).toBeUndefined();
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
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'test@example.com', role: 'user' }),
    });
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0');

    expect(res.status).toBe(401);
    expect(Transaction.findById).not.toHaveBeenCalled();
  });

  test('rejects an id that is not an object id', async () => {
    const res = await request(app).get('/api/transactions/tx123').set(authHeader());

    expect(res.status).toBe(400);
  });

  test('returns the transaction to the account that owns it', async () => {
    Transaction.findById.mockResolvedValue({ _id: '64b7c1f2e3d4a5b6c7d8e9f0', userId: 'user-1', status: 'queued' });
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-1');
  });

  // 404 rather than 403: a 403 would confirm the id exists, which is the
  // enumeration this route allowed outright while it was unauthenticated.
  test('answers 404 for somebody else\'s transaction', async () => {
    Transaction.findById.mockResolvedValue({ _id: '64b7c1f2e3d4a5b6c7d8e9f0', userId: 'user-2', from: FROM, status: 'queued' });
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0').set(authHeader());

    expect(res.status).toBe(404);
  });

  test('returns an incoming transfer to its receiver', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-3', email: 'test@example.com', role: 'user', walletAddress: TO }),
    });
    Transaction.findById.mockResolvedValue({ _id: '64b7c1f2e3d4a5b6c7d8e9f0', userId: 'user-2', from: FROM, to: TO, status: 'queued' });
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0').set(authHeader('user-3'));

    expect(res.status).toBe(200);
    expect(res.body.to).toBe(TO);
  });

  test('answers 404 when the record does not exist', async () => {
    Transaction.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0').set(authHeader());

    expect(res.status).toBe(404);
  });

  test('lets an admin read any transaction', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-9', email: 'admin@example.com', role: 'admin' }),
    });
    Transaction.findById.mockResolvedValue({ _id: '64b7c1f2e3d4a5b6c7d8e9f0', userId: 'user-2', status: 'queued' });
    const res = await request(app).get('/api/transactions/64b7c1f2e3d4a5b6c7d8e9f0').set(authHeader('user-9'));

    expect(res.status).toBe(200);
  });
});
