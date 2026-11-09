// POST /api/auth/link-wallet and POST /api/wallet/pin/set-pin both hang their
// "verified identity first" rule off middleware/requireKyc.js, so this file is
// the contract for that rule: who gets through, who gets refused, and what the
// two restore exceptions actually allow.
const request = require('supertest');
const express = require('express');

jest.mock('../models/kyc', () => {
  const find = jest.fn();
  return { findOne: find, __find: find };
});

// models/user.js puts email/phone/walletAddress through AES-256-GCM at rest, and
// `.lean()` — which is exactly what this middleware uses — bypasses every schema
// transform, so what comes back is ciphertext. The mock reproduces that shape on
// purpose: an earlier version of the gate compared that ciphertext with the
// plaintext address the client had just signed for, and the "re-link your own
// wallet" exception therefore never fired.
jest.mock('../models/user', () => {
  const findById = jest.fn();
  return {
    findById,
    decryptUserPii: (doc) => {
      const stored = doc && doc.walletAddress;
      return { ...doc, walletAddress: typeof stored === 'string' && stored.startsWith('enc:') ? stored.slice(4) : stored };
    },
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const KYC = require('../models/kyc');
const User = require('../models/user');
const { requireVerifiedKyc } = require('../middleware/requireKyc');

const ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const OTHER = 'mall1sxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1';

/** The `KYC.findOne(...).select(...).sort(...).lean()` chain, synchronously. */
function kycRecord(record) {
  return { select: () => ({ sort: () => ({ lean: async () => record }) }) };
}

function appWith(middlewareOptions, userId = 'user1') {
  const app = express();
  app.use(express.json());
  app.post('/guarded', (req, res, next) => {
    req.user = { _id: userId };
    next();
  }, requireVerifiedKyc(middlewareOptions), (req, res) => res.json({ reached: true }));
  return app;
}

describe('requireVerifiedKyc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: nothing submitted, no wallet on the account.
    KYC.findOne.mockImplementation(() => kycRecord(null));
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: async () => null }) });
  });

  test('an unverified account is refused with the machine-readable token and a route to KYC', async () => {
    const res = await request(appWith({})).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'kyc_verification_required', kycStatus: 'unverified', next: '/kyc' });
  });

  test('an approved KYC record is allowed through', async () => {
    KYC.findOne.mockImplementation(() => kycRecord({ _id: 'k1', status: 'approved' }));

    const res = await request(appWith({})).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true });
  });

  test('kycLevel >= 2 is approved without reading a KYC record', async () => {
    // That is what the admin approval path writes, and the gate must agree with
    // it or every approved account pays for a query it already passed.
    const app = express();
    app.use(express.json());
    app.post('/guarded', (req, _res, next) => { req.user = { _id: 'user1', kycLevel: 2 }; next(); }, requireVerifiedKyc({}), (_req, res) => res.json({ reached: true }));

    const res = await request(app).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(200);
    expect(KYC.findOne).not.toHaveBeenCalled();
  });

  test.each([
    ['pending', 'submitted, awaiting a reviewer'],
    ['review', 'queued for review'],
    ['rejected', 'a reviewer said no'],
  ])('a %s verdict reports kycStatus:%s', async (status) => {
    KYC.findOne.mockImplementation(() => kycRecord({ _id: 'k1', status }));

    const res = await request(appWith({})).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(403);
    expect(res.body.kycStatus).toBe(status === 'review' ? 'pending' : status);
  });

  test('the link-wallet exception allows only the address this account already holds', async () => {
    // Ciphertext at rest, as .lean() delivers it.
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: async () => ({ walletAddress: `enc:${ADDRESS}` }) }),
    });

    const app = appWith({ allowSameAddress: true });
    const own = await request(app).post('/guarded').send({ address: ADDRESS });
    const other = await request(app).post('/guarded').send({ address: OTHER });

    // Comparing the stored ciphertext with the plaintext body — the bug this
    // case exists to keep fixed — refused both, which locked the owner of a
    // disconnected wallet out of their own address.
    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });

  test('the set-pin exception allows any pin when the account already has a wallet', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: async () => ({ walletAddress: `enc:${ADDRESS}` }) }),
    });

    const res = await request(appWith({ allowExistingWallet: true })).post('/guarded').send({ pinHash: '$2a$10$whatever' });

    expect(res.status).toBe(200);
  });

  test('an account with no linked address still gets no restore exceptions', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: async () => ({ walletAddress: null }) }),
    });

    const res = await request(appWith({ allowSameAddress: true })).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(403);
  });

  test('a failed verdict read fails closed with 503, not a link', async () => {
    KYC.findOne.mockImplementation(() => { throw new Error('mongo unreachable'); });

    const res = await request(appWith({})).post('/guarded').send({ address: ADDRESS });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('kyc_check_unavailable');
  });
});
