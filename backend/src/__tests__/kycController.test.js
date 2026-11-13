// Coverage for kycController.js (previously 0%). While reading getDocument,
// found and fixed a real path-traversal / arbitrary-file-read bug: an
// authenticated user only needs their own KYC record's idDocumentUrl to
// start with `${userId}-` (see submitKYC) — nothing stopped them from
// submitting `${userId}-../../../../etc/passwd` as the value, which
// path.join(KYC_UPLOAD_DIR, ...) would then happily resolve outside the
// upload directory when getDocument streamed it back via res.sendFile.
// The fix takes path.basename() of idDocumentUrl before joining, which is a
// no-op for every legitimate multer-produced filename (no path separators)
// but neutralizes traversal payloads.
const path = require('path');

jest.mock('../models/kyc');
jest.mock('../models/user');
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../middleware/upload', () => ({ KYC_UPLOAD_DIR: '/fake/kyc/uploads' }));
// Only services/amlProvider.js's real vendor clients call axios, and only when
// AML_PROVIDER_* env vars point at one (see the "screening actually ran"
// block below). Mocking it keeps those tests from reaching the network.
jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const KYC = require('../models/kyc');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const axios = require('axios');
const { resetAmlProvider } = require('../services/amlProvider');
const kycCtrl = require('../controllers/kycController');

// automock replaces KYC.decryptKycPii (a plain function property on the
// real model, not a Mongoose method automock knows how to preserve) with a
// jest.fn() that returns undefined — this file's fixtures are already
// plaintext (they're testing controller logic, not the real encryption,
// which fieldEncryption.test.js and kyc.test.js cover directly), so a
// passthrough is the correct stand-in here.
KYC.decryptKycPii = jest.fn((k) => k);

// kycController.js's exports are now asyncHandler-wrapped (see errorHandler.js):
// error paths throw AppError instead of calling res.status().json() directly,
// and asyncHandler's rejection handler calls next(err) rather than replying
// itself. This test file calls controllers directly (no Express app/router),
// so error-path assertions need a next mock instead of res.status/json.
function mockNext() {
  return jest.fn();
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    sendFile: jest.fn((_filePath, cb) => { if (cb) cb(null); }),
  };
}

function validKycBody(overrides = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01',
    nationality: 'KE',
    address: '123 Main St',
    city: 'Nairobi',
    country: 'KE',
    postalCode: '00100',
    phoneNumber: '+254700000000',
    idType: 'passport',
    idNumber: 'A1234567',
    idExpiry: '2030-01-01',
    idDocumentUrl: 'u1-111-id.png',
    occupation: 'Engineer',
    sourceOfFunds: 'salary',
    annualIncome: '50000',
    politicalExposure: false,
    ...overrides,
  };
}

describe('kycController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks clears implementations too — getDocument calls
    // AuditLog.create(...).catch(...) without awaiting it, so this must
    // resolve (not return undefined) or that unguarded .catch() throws.
    AuditLog.create.mockResolvedValue({});
    // Same reset problem for decryptKycPii — see the module-scope comment
    // above; a passthrough is correct since fixtures here are plaintext.
    KYC.decryptKycPii.mockImplementation((k) => k);
    // The AML provider is memoised per process and chosen from the
    // environment, so every test here starts from the same place the repo
    // runs from: no vendor configured, therefore nothing screened.
    delete process.env.AML_PROVIDER_TYPE;
    delete process.env.AML_PROVIDER_API_KEY;
    delete process.env.AML_PROVIDER_URL;
    resetAmlProvider();
  });

  afterEach(() => {
    delete process.env.AML_PROVIDER_TYPE;
    delete process.env.AML_PROVIDER_API_KEY;
    delete process.env.AML_PROVIDER_URL;
    resetAmlProvider();
  });

  describe('uploadDocument', () => {
    test('rejects when no file was uploaded', async () => {
      const req = { file: undefined };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.uploadDocument(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'No document uploaded' }));
    });

    test('returns the stored filename as documentRef', async () => {
      const req = { file: { filename: 'u1-12345-id.png' } };
      const res = mockRes();
      await kycCtrl.uploadDocument(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true, documentRef: 'u1-12345-id.png' });
    });
  });

  describe('getDocument', () => {
    test('404s when the KYC record does not exist', async () => {
      KYC.findById.mockResolvedValue(null);
      const req = { params: { kycId: 'nope' }, user: { id: 'u1' } };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.getDocument(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    test('forbids a caller who is neither the owner nor an admin', async () => {
      KYC.findById.mockResolvedValue({ userId: 'owner1', idDocumentUrl: 'owner1-1-id.png' });
      const req = { params: { kycId: 'k1' }, user: { id: 'stranger', role: 'user' } };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.getDocument(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(res.sendFile).not.toHaveBeenCalled();
    });

    test('404s when the KYC record has no document on file', async () => {
      KYC.findById.mockResolvedValue({ userId: 'owner1', idDocumentUrl: null });
      const req = { params: { kycId: 'k1' }, user: { id: 'owner1' } };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.getDocument(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    test('lets the owner stream their own document and logs it as a self-view', async () => {
      KYC.findById.mockResolvedValue({ _id: 'kyc1', userId: 'owner1', idDocumentUrl: 'owner1-111-id.png' });
      const req = { params: { kycId: 'k1' }, user: { id: 'owner1' } };
      const res = mockRes();
      await kycCtrl.getDocument(req, res);
      expect(res.sendFile).toHaveBeenCalledWith(
        path.join('/fake/kyc/uploads', 'owner1-111-id.png'),
        expect.any(Function)
      );
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kyc_document_viewed',
          actorType: 'user',
          details: expect.objectContaining({ viewedOwnDocument: true }),
        })
      );
    });

    test('lets an admin stream another user\'s document and logs it as an admin access', async () => {
      KYC.findById.mockResolvedValue({ _id: 'kyc1', userId: 'owner1', idDocumentUrl: 'owner1-111-id.png' });
      const req = { params: { kycId: 'k1' }, user: { id: 'admin1', role: 'admin' } };
      const res = mockRes();
      await kycCtrl.getDocument(req, res);
      expect(res.sendFile).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kyc_document_viewed',
          actorType: 'admin',
          details: expect.objectContaining({ subjectUserId: 'owner1', viewedOwnDocument: false }),
        })
      );
    });

    test('regression: a crafted idDocumentUrl cannot escape the upload directory', async () => {
      KYC.findById.mockResolvedValue({ userId: 'owner1', idDocumentUrl: 'owner1-../../../../etc/passwd' });
      const req = { params: { kycId: 'k1' }, user: { id: 'owner1' } };
      const res = mockRes();
      await kycCtrl.getDocument(req, res);

      expect(res.sendFile).toHaveBeenCalledTimes(1);
      const sentPath = res.sendFile.mock.calls[0][0];
      expect(sentPath).toBe(path.join('/fake/kyc/uploads', 'passwd'));
      expect(sentPath.startsWith('/fake/kyc/uploads')).toBe(true);
    });
  });

  describe('submitKYC', () => {
    test('401s when unauthenticated', async () => {
      const req = { user: undefined, body: validKycBody() };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.submitKYC(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      expect(KYC.create).not.toHaveBeenCalled();
    });

    test('403s when idDocumentUrl was not uploaded by this account', async () => {
      const req = {
        user: { id: 'u1' },
        body: validKycBody({ idDocumentUrl: 'someoneElse-111-id.png' }),
      };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.submitKYC(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(KYC.create).not.toHaveBeenCalled();
    });

    test('400s when the caller already has a pending/review KYC', async () => {
      KYC.findOne.mockResolvedValue({ _id: 'existing', status: 'pending' });
      const req = { user: { id: 'u1' }, body: validKycBody() };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.submitKYC(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(KYC.create).not.toHaveBeenCalled();
    });

    test('creates a pending KYC record and fills in a missing display name', async () => {
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'kyc1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: null }) });
      User.findByIdAndUpdate.mockResolvedValue({});

      const req = { user: { id: 'u1' }, body: validKycBody() };
      const res = mockRes();
      await kycCtrl.submitKYC(req, res);

      // riskLevel is 'high' here because no AML vendor is configured in this
      // environment, so no list was consulted. That is deliberately not 'low':
      // "nobody looked" must never be recorded as "nothing was found".
      expect(KYC.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', status: 'pending', riskLevel: 'high' })
      );
      const created = KYC.create.mock.calls[0][0];
      expect(created.amlChecks).toMatchObject({ screened: false, sanctions: false, pep: false, provider: 'none' });
      expect(created.amlChecks.raw.declaredPoliticalExposure).toBe(false);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { name: 'Jane Doe' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, kycId: 'kyc1', status: 'pending', riskLevel: 'high' })
      );
    });

    test('does not clobber a name the user already set manually', async () => {
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'kyc2' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Existing Name' }) });

      const req = { user: { id: 'u1' }, body: validKycBody() };
      const res = mockRes();
      await kycCtrl.submitKYC(req, res);

      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('keeps an un-screened PEP declaration held for review instead of downgrading it', async () => {
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'kyc3' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Has Name' }) });

      const req = { user: { id: 'u1' }, body: validKycBody({ politicalExposure: true }) };
      const res = mockRes();
      await kycCtrl.submitKYC(req, res);

      // A self-declared PEP would map to 'medium' once a list is actually
      // checked (see the "screening actually ran" block). With nothing
      // screened the submission still surfaces at the higher of the two, and
      // the declaration is preserved as a declaration rather than promoted
      // into amlChecks.pep, which means "a PEP list matched".
      expect(KYC.create).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'high' }));
      expect(KYC.create.mock.calls[0][0].amlChecks).toMatchObject({ screened: false, pep: false });
      expect(KYC.create.mock.calls[0][0].amlChecks.raw.declaredPoliticalExposure).toBe(true);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'high' }));
    });

    test('500s and does not leak internals when KYC.create throws', async () => {
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockRejectedValue(new Error('db down'));
      const req = { user: { id: 'u1' }, body: validKycBody() };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.submitKYC(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, message: 'Failed to submit KYC' }));
      expect(next.mock.calls[0][0].message).not.toContain('db down');
    });
  });

  describe('runAMLCheck', () => {
    test('401s when unauthenticated', async () => {
      const req = { user: undefined, body: {} };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.runAMLCheck(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    test('upserts the risk profile without altering KYC status', async () => {
      KYC.findOneAndUpdate.mockResolvedValue({ _id: 'k1', riskLevel: 'high' });
      const req = {
        user: { id: 'u1' },
        body: { kycData: { politicalExposure: false }, walletAddress: 'mall1abc' },
      };
      const res = mockRes();
      await kycCtrl.runAMLCheck(req, res);

      expect(KYC.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'u1' },
        expect.objectContaining({ riskLevel: 'high' }),
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      // Nothing was screened in this environment, and the profile says so
      // rather than recording a clean look-through.
      expect(KYC.findOneAndUpdate.mock.calls[0][1].amlChecks).toMatchObject({ screened: false, provider: 'none' });
      // A real admin decision — not this informational signal — must be what
      // moves status; asserting the update payload never carries a status field.
      const updatePayload = KYC.findOneAndUpdate.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty('status');
      expect(res.json).toHaveBeenCalledWith({ success: true, checks: expect.any(Object), riskLevel: 'high' });
    });
  });

  // The mapping from a screening result to a risk level only means something
  // once a vendor was really consulted, so these drive the provider selection
  // code through a configured vendor (AML_PROVIDER_*) with axios stubbed,
  // instead of asserting the mapping against a provider that screens nobody.
  describe('with a real AML vendor configured', () => {
    function configuredVendor(reply) {
      process.env.AML_PROVIDER_TYPE = 'chainalysis';
      process.env.AML_PROVIDER_API_KEY = 'test-key';
      resetAmlProvider();
      if (reply instanceof Error) axios.post.mockRejectedValue(reply);
      else axios.post.mockResolvedValue({ data: reply });
    }

    test('a vendor that reports no hits is what makes a submission low risk', async () => {
      configuredVendor({});
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'k1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Jane Doe' }) });

      const res = mockRes();
      await kycCtrl.submitKYC({ user: { id: 'u1' }, body: validKycBody() }, res);

      expect(KYC.create.mock.calls[0][0]).toMatchObject({ riskLevel: 'low' });
      expect(KYC.create.mock.calls[0][0].amlChecks).toMatchObject({ screened: true, provider: 'chainalysis' });
    });

    test('a PEP match is medium and a sanctions match is high', async () => {
      configuredVendor({ pep: { hit: true } });
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'k2' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Jane Doe' }) });
      await kycCtrl.submitKYC({ user: { id: 'u1' }, body: validKycBody() }, mockRes());
      expect(KYC.create.mock.calls[0][0]).toMatchObject({ riskLevel: 'medium' });

      configuredVendor({ sanctions: { hit: true } });
      KYC.create.mockResolvedValue({ _id: 'k3' });
      await kycCtrl.submitKYC({ user: { id: 'u1' }, body: validKycBody() }, mockRes());
      expect(KYC.create.mock.calls[1][0]).toMatchObject({ riskLevel: 'high' });
      expect(KYC.create.mock.calls[1][0].amlChecks.sanctions).toBe(true);
    });

    test('a vendor that is unreachable still submits, held at high risk', async () => {
      configuredVendor(new Error('Cloudflare 530 from screening endpoint'));
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'k4' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Jane Doe' }) });

      const res = mockRes();
      await kycCtrl.submitKYC({ user: { id: 'u1' }, body: validKycBody() }, res);

      const created = KYC.create.mock.calls[0][0];
      expect(created).toMatchObject({ riskLevel: 'high', status: 'pending' });
      expect(created.amlChecks).toMatchObject({ screened: false, provider: 'unavailable' });
      // An outage is recorded as an outage — not as a screening that found
      // nothing, and not as a hit either.
      expect(created.amlChecks.sanctions).toBe(false);
      expect(created.amlChecks.raw.warning).toMatch(/unreachable/);
    });

    test('a vendor response that is not a screening payload is not read as clean', async () => {
      // e.g. an intercepting proxy or error page answering 200 with a string.
      configuredVendor('<!doctype html><html>error</html>');
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'k5' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Jane Doe' }) });

      await kycCtrl.submitKYC({ user: { id: 'u1' }, body: validKycBody() }, mockRes());

      const created = KYC.create.mock.calls[0][0];
      expect(created.riskLevel).toBe('high');
      expect(created.amlChecks.screened).toBe(false);
      expect(created.amlChecks.provider).toBe('unavailable');
    });
  });

  describe('getKYCStatus', () => {
    test('401s when unauthenticated', async () => {
      const req = { user: undefined };
      const res = mockRes();
      const next = mockNext();
      await kycCtrl.getKYCStatus(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    test('reports not_submitted when no KYC record exists', async () => {
      KYC.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      const req = { user: { id: 'u1' } };
      const res = mockRes();
      await kycCtrl.getKYCStatus(req, res);
      expect(res.json).toHaveBeenCalledWith({ status: 'not_submitted', verdict: 'not_submitted' });
    });

    test('publishes the verdict a wallet gate would apply, not just the document status', async () => {
      // The §6 complaint in one account: an admin can approve by setting
      // kycLevel without a KYC document ever existing. `status` still describes
      // the (absent) record, and `verdict` is the answer the rest of the product
      // acts on — which is why the dashboard banner and the wallet door can no
      // longer tell this person two different stories.
      KYC.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      const res = mockRes();
      await kycCtrl.getKYCStatus({ user: { id: 'u1', kycLevel: 2 } }, res);
      expect(res.json).toHaveBeenCalledWith({ status: 'not_submitted', verdict: 'verified' });
    });

    test.each([
      ['draft', 'not_submitted'],
      ['pending', 'pending'],
      ['review', 'pending'],
      ['approved', 'verified'],
      ['rejected', 'rejected'],
    ])('a %s document reports verdict:%s beside its own status', async (status, verdict) => {
      KYC.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({ _id: 'k1', status, notes: '', reviewedAt: null }),
      });
      const res = mockRes();
      await kycCtrl.getKYCStatus({ user: { id: 'u1', kycLevel: 1 } }, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status, verdict }));
    });

    test('returns the caller\'s own full submitted profile', async () => {
      const kyc = {
        _id: 'k1',
        status: 'approved',
        riskLevel: 'low',
        amlChecks: { sanctions: false },
        submittedAt: new Date('2026-01-01'),
        reviewedAt: null,
        notes: '',
        idDocumentUrl: 'u1-1-doc.png',
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        nationality: 'KE',
        address: 'x',
        city: 'Nairobi',
        country: 'KE',
        postalCode: '00100',
        phoneNumber: '123',
        idType: 'passport',
        idNumber: 'A1',
        idExpiry: '2030',
        occupation: 'eng',
        sourceOfFunds: 'salary',
        annualIncome: '1',
        politicalExposure: false,
      };
      KYC.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(kyc) });
      const req = { user: { id: 'u1' } };
      const res = mockRes();
      await kycCtrl.getKYCStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          kycId: 'k1',
          status: 'approved',
          hasDocument: true,
          personal: expect.objectContaining({ firstName: 'Jane', lastName: 'Doe' }),
          identity: expect.objectContaining({ idType: 'passport' }),
        })
      );
    });
  });
});
