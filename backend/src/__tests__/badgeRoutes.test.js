const request = require('supertest');
const express = require('express');

jest.mock('../models/BadgePurchase', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/BadgeIssuance', () => ({ create: jest.fn() }));
jest.mock('../models/user', () => ({ findOne: jest.fn() }));
jest.mock('../services/badgeTxBuilder', () => ({ issueBadgeFromMnemonic: jest.fn() }));
jest.mock('../services/notify', () => ({ notifyUser: jest.fn() }));
jest.mock('../utils/circuitBreaker', () => ({
  createBlockchainBreaker: () => ({ execute: (fn) => fn() }),
}));
jest.mock('axios');

const BadgePurchase = require('../models/BadgePurchase');
const BadgeIssuance = require('../models/BadgeIssuance');
const User = require('../models/user');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { notifyUser } = require('../services/notify');
const axios = require('axios');
const badgeRoutes = require('../routes/badge');

const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const PHONE = '254712345678';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/badge', badgeRoutes);
  return app;
}

describe('POST /api/badge/reserve', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('creates a pending purchase at the configured KSh price', async () => {
    BadgePurchase.create.mockResolvedValue({ quoteId: 'q1', fiatAmount: 17, currency: 'KES' });

    const res = await request(app).post('/api/badge/reserve').send({ walletAddress: VALID_ADDRESS, phone: PHONE });

    expect(res.status).toBe(200);
    expect(res.body.fiatAmount).toBe(17);
    expect(BadgePurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: VALID_ADDRESS, phone: PHONE, fiatAmount: 17, status: 'pending' })
    );
  });

  test('rejects a missing wallet address', async () => {
    const res = await request(app).post('/api/badge/reserve').send({ phone: PHONE });
    expect(res.status).toBe(400);
    expect(BadgePurchase.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/badge/mpesa', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('returns 503 when Safaricom STK is not configured', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', save: jest.fn() });

    const res = await request(app).post('/api/badge/mpesa').send({ quoteId: 'q1', phone: PHONE });

    expect(res.status).toBe(503);
  });

  test('404s when the quote does not exist', async () => {
    BadgePurchase.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/badge/mpesa').send({ quoteId: 'missing', phone: PHONE });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/badge/mpesa/callback', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); delete process.env.PAYMENT_WEBHOOK_SECRET; });

  test('confirms the purchase on a successful callback', async () => {
    const purchase = { paymentId: 'CR1', save: jest.fn().mockResolvedValue(undefined), status: 'payment_initiated' };
    BadgePurchase.findOne.mockResolvedValue(purchase);

    const res = await request(app).post('/api/badge/mpesa/callback').send({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'CR1',
          ResultCode: 0,
          CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'REF123' }] },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ResultCode).toBe(0);
    expect(purchase.status).toBe('confirmed');
    expect(purchase.mpesaRef).toBe('REF123');
  });

  test('marks the purchase failed on a non-zero result code', async () => {
    const purchase = { paymentId: 'CR2', save: jest.fn().mockResolvedValue(undefined), status: 'payment_initiated' };
    BadgePurchase.findOne.mockResolvedValue(purchase);

    const res = await request(app).post('/api/badge/mpesa/callback').send({
      Body: { stkCallback: { CheckoutRequestID: 'CR2', ResultCode: 1032 } },
    });

    expect(res.status).toBe(200);
    expect(purchase.status).toBe('failed');
  });

  test('rejects a request with the wrong webhook token when PAYMENT_WEBHOOK_SECRET is set', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'realsecret';
    const res = await request(app)
      .post('/api/badge/mpesa/callback?token=wrong')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'CR3', ResultCode: 0 } } });

    expect(res.status).toBe(401);
    expect(BadgePurchase.findOne).not.toHaveBeenCalled();
  });
});

describe('POST /api/badge/issue', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    process.env.OPERATOR_MNEMONIC = 'operator test mnemonic';
  });
  afterEach(() => { delete process.env.OPERATOR_MNEMONIC; });

  test('rejects when the purchase has not been confirmed yet', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'payment_initiated' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('payment_not_confirmed');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('rejects a wallet address mismatch', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'confirmed' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1', walletAddress: 'mall1someoneelse00000000000000000000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('wallet_address_mismatch');
  });

  test('is idempotent — a second call for an already-issued purchase returns the same result without re-issuing', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'issued', badgeTxHash: 'HASH1' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('HASH1');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('atomically transitions confirmed -> processing before issuing; a concurrent caller gets 409', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'confirmed' });
    BadgePurchase.findOneAndUpdate.mockResolvedValue(null); // another request already claimed it

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(409);
    expect(BadgePurchase.findOneAndUpdate).toHaveBeenCalledWith(
      { quoteId: 'q1', status: 'confirmed' },
      { $set: { status: 'processing' } },
      { new: true }
    );
  });

  test('issues the badge, records the audit trail, and notifies the linked user', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'confirmed' });
    const processingDoc = { quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'processing', save: jest.fn().mockResolvedValue(undefined) };
    BadgePurchase.findOneAndUpdate.mockResolvedValue(processingDoc);
    issueBadgeFromMnemonic.mockResolvedValue({ txHash: 'HASH2' });
    User.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user1', email: 'a@b.com' }) });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('HASH2');
    expect(processingDoc.status).toBe('issued');
    expect(BadgeIssuance.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', walletAddress: VALID_ADDRESS, method: 'purchase', txHash: 'HASH2' })
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'user1' }),
      expect.objectContaining({ title: expect.stringContaining('purchased') })
    );
  });

  test('rolls back to confirmed (not stuck at processing) if on-chain issuance fails, so a retry is possible', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'confirmed' });
    const processingDoc = { quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'processing', save: jest.fn().mockResolvedValue(undefined) };
    BadgePurchase.findOneAndUpdate.mockResolvedValue(processingDoc);
    issueBadgeFromMnemonic.mockRejectedValue(new Error('chain unreachable'));

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(500);
    expect(processingDoc.status).toBe('confirmed');
    expect(BadgeIssuance.create).not.toHaveBeenCalled();
  });

  test('returns 503 and rolls back to confirmed when OPERATOR_MNEMONIC is missing', async () => {
    delete process.env.OPERATOR_MNEMONIC;
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'confirmed' });
    const processingDoc = { quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'processing', save: jest.fn().mockResolvedValue(undefined) };
    BadgePurchase.findOneAndUpdate.mockResolvedValue(processingDoc);

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(503);
    expect(processingDoc.status).toBe('confirmed');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });
});

describe('GET /api/badge/status/:quoteId', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('returns the purchase status', async () => {
    BadgePurchase.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ quoteId: 'q1', status: 'issued', fiatAmount: 17, badgeTxHash: 'HASH1' }) });

    const res = await request(app).get('/api/badge/status/q1');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('issued');
  });

  test('404s for an unknown quote', async () => {
    BadgePurchase.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const res = await request(app).get('/api/badge/status/unknown');
    expect(res.status).toBe(404);
  });
});
