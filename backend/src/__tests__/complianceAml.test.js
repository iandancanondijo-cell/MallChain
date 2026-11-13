// Coverage for the AML surface of routes/compliance.js.
//
// This route was broken in three ways at once, and all three were compliance
// honesty problems rather than crashes:
//   - it destructured an `amlProvider` export that does not exist, so every
//     POST /aml-screen threw on the first call and answered 500;
//   - with nothing screening, it wrote an AMLReview saying 'clear' and logged
//     ComplianceLog.status 'clear' (not in that enum), i.e. it recorded a
//     finding it had not obtained;
//   - GET /aml-check and GET /status answered "clear / no AML concerns" for
//     accounts that had never been screened, and derived ageVerified from the
//     account's age instead of from the verification that was recorded.
const request = require('supertest');
const express = require('express');

const access = { userId: 'user1', admin: false };

jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { id: access.userId, role: access.admin ? 'superadmin' : 'user' };
    next();
  })
);
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: jest.fn((req, res, next) => {
    if (!access.admin) return res.status(403).json({ error: 'Admin access required' });
    return next();
  }),
}));

jest.mock('../models/user', () => {
  const model = { findById: jest.fn(), decryptUserPii: (u) => u };
  return model;
});
// AMLReview is constructed with `new AMLReview(...)`, so the mock has to be a
// constructor whose instances keep the document for assertions — and it still
// needs the static the read routes call.
jest.mock('../models/amlReview', () => {
  const Ctor = jest.fn().mockImplementation(function constructed(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(true);
  });
  Ctor.findOne = jest.fn();
  return Ctor;
});
jest.mock('../models/complianceLog', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/kycSubmission', () => ({ findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) }) }));
jest.mock('../services/amlProvider', () => ({
  getAmlProvider: jest.fn(),
  resetAmlProvider: jest.fn(),
}));

const User = require('../models/user');
const AMLReview = require('../models/amlReview');
const ComplianceLog = require('../models/complianceLog');
const { getAmlProvider } = require('../services/amlProvider');
const complianceRoutes = require('../routes/compliance');

const app = express();
app.use('/api/compliance', complianceRoutes);

/** The provider the route will be handed for this test's call. */
function screeningProvider(resultOrError) {
  getAmlProvider.mockImplementation(() => ({
    screen: jest.fn(async () => {
      if (resultOrError instanceof Error) throw resultOrError;
      return resultOrError;
    }),
  }));
}

function screenedClean() {
  return { screened: true, sanctions: false, pep: false, adverseMedia: false, watchlist: false, riskLevel: 'low', provider: 'chainalysis', raw: {} };
}

function account(extra = {}) {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: access.userId,
      name: 'Jane Doe',
      email: 'jane@example.com',
      createdAt: new Date('2025-01-01'),
      ...extra,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  access.admin = true;
  account();
  AMLReview.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
});

describe('POST /api/compliance/aml-screen', () => {
  test('requires an admin, as the route documents', async () => {
    access.admin = false;
    const res = await request(app).post('/api/compliance/aml-screen');
    expect(res.status).toBe(403);
    expect(getAmlProvider).not.toHaveBeenCalled();
  });

  test('screens nobody and records nothing when no vendor is configured', async () => {
    screeningProvider({
      screened: false, sanctions: false, pep: false, adverseMedia: false, watchlist: false,
      riskLevel: 'unknown', provider: 'none', raw: {}, warning: 'No AML screening vendor is configured (AML_PROVIDER_TYPE / AML_PROVIDER_API_KEY) — no sanctions, PEP, adverse-media or watchlist list was consulted',
    });

    const res = await request(app).post('/api/compliance/aml-screen');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ screened: false, provider: 'none' });
    expect(res.body.error).toMatch(/No AML screening vendor is configured/);
    // The point: an unscreened call must not leave a compliance record behind.
    expect(AMLReview).not.toHaveBeenCalled();
    expect(ComplianceLog.create).not.toHaveBeenCalled();
  });

  test('records a clean result from a real vendor against the vendor that produced it', async () => {
    screeningProvider(screenedClean());

    const res = await request(app).post('/api/compliance/aml-screen');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, screened: true, provider: 'chainalysis', status: 'clear' });
    expect(AMLReview).toHaveBeenCalledTimes(1);
    const review = AMLReview.mock.instances[0];
    expect(review).toMatchObject({ status: 'clear', provider: 'chainalysis', riskLevel: 1 });
    expect(review.screeningData.screened).toBe(true);
    // ComplianceLog.status has no 'clear' in its enum — a no-hit screening is a
    // success, and passing 'clear' used to throw a validation error.
    expect(ComplianceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'aml_screening', status: 'success' })
    );
  });

  test('names every list that matched when the vendor reports a hit', async () => {
    screeningProvider({ ...screenedClean(), sanctions: true, watchlist: true, riskLevel: 'critical', reason: undefined });

    const res = await request(app).post('/api/compliance/aml-screen');

    expect(res.body).toMatchObject({ status: 'flagged' });
    expect(res.body.reason).toMatch(/sanctions, watchlist \(chainalysis\)/);
    expect(AMLReview.mock.instances[0]).toMatchObject({ status: 'flagged', riskLevel: 5 });
    expect(ComplianceLog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'flagged' }));
  });

  test('a provider that throws is a 503 that records nothing, not a clean bill', async () => {
    screeningProvider(new Error('Chainalysis AML screening failed: Cloudflare 530'));

    const res = await request(app).post('/api/compliance/aml-screen');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ screened: false, provider: 'unavailable' });
    expect(res.body.error).toMatch(/review the account manually/);
    expect(AMLReview).not.toHaveBeenCalled();
  });

  test('screens the decrypted email, not the ciphertext stored for it', async () => {
    const store = { name: 'Jane Doe', email: 'v1:ciphertext' };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(store) });
    User.decryptUserPii = jest.fn(() => ({ email: 'jane@example.com' }));
    const seen = [];
    getAmlProvider.mockImplementation(() => ({
      screen: jest.fn(async (kycData) => { seen.push(kycData); return screenedClean(); }),
    }));

    await request(app).post('/api/compliance/aml-screen');

    expect(seen[0].email).toBe('jane@example.com');
  });

  test('404s for an account that does not exist', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    screeningProvider(screenedClean());
    const res = await request(app).post('/api/compliance/aml-screen');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/compliance/aml-check', () => {
  test('an account that has never been screened is not reported as clear', async () => {
    const res = await request(app).get('/api/compliance/aml-check');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'not_screened', screened: false });
    expect(JSON.stringify(res.body)).not.toMatch(/No AML concerns/);
  });

  test('a screening that ran reports its provider', async () => {
    AMLReview.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({
        status: 'flagged',
        reason: 'AML screening hit: sanctions (chainalysis)',
        provider: 'chainalysis',
        screeningData: { screened: true },
        reviewedAt: new Date('2026-01-01'),
        reviewedBy: null,
      }),
    });

    const res = await request(app).get('/api/compliance/aml-check');

    expect(res.body).toMatchObject({ status: 'flagged', screened: true, provider: 'chainalysis' });
    expect(res.body.reason).toMatch(/sanctions/);
  });
});

describe('GET /api/compliance/status', () => {
  test('reports AML as not screened rather than clear, and reads age verification from the record', async () => {
    account({ ageVerifiedAt: new Date('2026-02-01'), tosAcceptedAt: new Date('2026-02-01'), privacyAcceptedAt: null, kycLevel: 1 });

    const res = await request(app).get('/api/compliance/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ageVerified: true, tosAccepted: true, privacyAccepted: false, amlStatus: 'not_screened' });
  });

  test('a new account is not treated as age verified because enough days have passed', async () => {
    account({ createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), ageVerifiedAt: undefined });

    const res = await request(app).get('/api/compliance/status');

    expect(res.body.ageVerified).toBe(false);
  });
});
