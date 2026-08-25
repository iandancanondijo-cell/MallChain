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
jest.mock('../middleware/upload', () => ({ KYC_UPLOAD_DIR: '/fake/kyc/uploads' }));

const KYC = require('../models/kyc');
const User = require('../models/user');
const kycCtrl = require('../controllers/kycController');

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

    test('lets the owner stream their own document', async () => {
      KYC.findById.mockResolvedValue({ userId: 'owner1', idDocumentUrl: 'owner1-111-id.png' });
      const req = { params: { kycId: 'k1' }, user: { id: 'owner1' } };
      const res = mockRes();
      await kycCtrl.getDocument(req, res);
      expect(res.sendFile).toHaveBeenCalledWith(
        path.join('/fake/kyc/uploads', 'owner1-111-id.png'),
        expect.any(Function)
      );
    });

    test('lets an admin stream another user\'s document', async () => {
      KYC.findById.mockResolvedValue({ userId: 'owner1', idDocumentUrl: 'owner1-111-id.png' });
      const req = { params: { kycId: 'k1' }, user: { id: 'admin1', role: 'admin' } };
      const res = mockRes();
      await kycCtrl.getDocument(req, res);
      expect(res.sendFile).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
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

      expect(KYC.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', status: 'pending', riskLevel: 'low' })
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { name: 'Jane Doe' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, kycId: 'kyc1', status: 'pending', riskLevel: 'low' })
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

    test('flags medium risk when politicalExposure is true', async () => {
      KYC.findOne.mockResolvedValue(null);
      KYC.create.mockResolvedValue({ _id: 'kyc3' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'Has Name' }) });

      const req = { user: { id: 'u1' }, body: validKycBody({ politicalExposure: true }) };
      const res = mockRes();
      await kycCtrl.submitKYC(req, res);

      expect(KYC.create).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'medium' }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'medium' }));
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
      KYC.findOneAndUpdate.mockResolvedValue({ _id: 'k1', riskLevel: 'low' });
      const req = {
        user: { id: 'u1' },
        body: { kycData: { politicalExposure: false }, walletAddress: 'mall1abc' },
      };
      const res = mockRes();
      await kycCtrl.runAMLCheck(req, res);

      expect(KYC.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'u1' },
        expect.objectContaining({ riskLevel: 'low' }),
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      // A real admin decision — not this mocked signal — must be what moves
      // status; asserting the update payload never carries a status field.
      const updatePayload = KYC.findOneAndUpdate.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty('status');
      expect(res.json).toHaveBeenCalledWith({ success: true, checks: expect.any(Object), riskLevel: 'low' });
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
      expect(res.json).toHaveBeenCalledWith({ status: 'not_submitted' });
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
