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
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
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

  test('confirms the payment but waits for admin approval before issuing', async () => {
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
    // Payment alone never mints a badge: a human has to approve it at
    // POST /api/admin/badges/approve.
    expect(purchase.status).toBe('awaiting_admin');
    expect(purchase.mpesaRef).toBe('REF123');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
    expect(BadgeIssuance.create).not.toHaveBeenCalled();
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

  test('a 2029 undelivered prompt is reported as our line failing, not the buyer cancelling', async () => {
    // Regression: 2029 arrives ~2s after the push and means Safaricom never
    // routed it to the handset. It used to read "User cancelled or payment
    // failed", which told the buyer they had done something wrong.
    const purchase = { paymentId: 'CR5', save: jest.fn().mockResolvedValue(undefined), status: 'payment_initiated' };
    BadgePurchase.findOne.mockResolvedValue(purchase);

    const res = await request(app).post('/api/badge/mpesa/callback').send({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'CR5',
          ResultCode: 2029,
          ResultDesc: 'Failed due to an unresolved reason type.',
        },
      },
    });

    expect(res.status).toBe(200);
    expect(purchase.status).toBe('failed');
    expect(purchase.reason).toMatch(/payment line was not reachable/i);
    expect(purchase.reason).not.toMatch(/cancel/i);
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

// /issue used to build and broadcast the badge transaction itself, which
// let anyone who knew a quoteId mint a badge the moment Daraja confirmed
// payment. Task #407 moved issuance behind a human: POST
// /api/admin/badges/approve performs the on-chain step, and this route is
// now a read-only acknowledgement for the buyer's modal.
describe('POST /api/badge/issue', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test('reports still-processing without issuing when payment has not landed', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'payment_initiated' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, success: false, message: 'Payment is still being processed', status: 'payment_initiated' });
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
    expect(BadgeIssuance.create).not.toHaveBeenCalled();
  });

  test('a paid quote sits at awaiting_admin and is never issued from this route', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'awaiting_admin' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('awaiting_admin');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
    expect(BadgeIssuance.create).not.toHaveBeenCalled();
    expect(BadgePurchase.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a rejected quote surfaces the rejection reason instead of issuing', async () => {
    BadgePurchase.findOne.mockResolvedValue({
      quoteId: 'q1',
      walletAddress: VALID_ADDRESS,
      status: 'rejected',
      reason: 'Duplicate purchase',
    });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, success: false, message: 'Duplicate purchase', status: 'rejected' });
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('is idempotent — an already-issued purchase returns its txHash without re-issuing', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', walletAddress: VALID_ADDRESS, status: 'issued', badgeTxHash: 'HASH1' });

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('HASH1');
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('404s for an unknown quote', async () => {
    BadgePurchase.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/badge/issue').send({ quoteId: 'nope' });

    expect(res.status).toBe(404);
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
