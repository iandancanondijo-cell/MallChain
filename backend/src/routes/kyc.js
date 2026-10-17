const express = require('express');
const router = express.Router();
const kycCtrl = require('../controllers/kycController');
const auth = require('../middleware/auth');
const { validateInput, schemas } = require('../middleware/inputValidation');
const { uploadKycDocument } = require('../middleware/upload');
const { limiters } = require('../middleware/rateLimiter');
const Joi = require('joi');

// KYC validation schema
const kycSchemas = {
  submitKYC: Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    dateOfBirth: Joi.string().required(),
    nationality: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    country: Joi.string().required(),
    postalCode: Joi.string().required(),
    phoneNumber: Joi.string().required(),
    idType: Joi.string().valid('passport', 'drivers_license', 'national_id').required(),
    idNumber: Joi.string().required(),
    idExpiry: Joi.string().required(),
    // Support both old single-document format and new dual-document format
    idDocumentUrl: Joi.string().optional(), // Deprecated, for backwards compatibility
    idFrontUrl: Joi.string().optional(),
    idBackUrl: Joi.string().optional(),
    occupation: Joi.string().required(),
    sourceOfFunds: Joi.string().required(),
    annualIncome: Joi.string().required(),
    politicalExposure: Joi.boolean().default(false)
  })
  // Validate that at least one of the document formats is provided
  .external(async (value) => {
    const hasSingleDoc = !!value.idDocumentUrl;
    const hasDualDocs = !!(value.idFrontUrl && value.idBackUrl);
    
    if (!hasSingleDoc && !hasDualDocs) {
      throw new Error('Either idDocumentUrl (deprecated) or both idFrontUrl and idBackUrl are required');
    }
    
    // Prefer dual-document format; warn if using deprecated single format
    if (hasSingleDoc && !hasDualDocs) {
      console.warn('KYC submission using deprecated single-document format');
    }
  })
};

// Upload the ID document — must happen before /submit, which requires the
// returned documentRef. Not served statically; only the owner or an admin
// can read it back via GET /document/:kycId below.
router.post('/document', auth, uploadKycDocument.single('document'), kycCtrl.uploadDocument);

// Stream an uploaded document back — owner or admin/superadmin only.
router.get('/document/:kycId', auth, kycCtrl.getDocument);

// Submit KYC data (requires authentication)
router.post('/submit', auth, limiters.strict, validateInput(kycSchemas.submitKYC), kycCtrl.submitKYC);

// ===== P0 ISSUE #1 WORKAROUND: GDPR Right-to-Erasure (User-Initiated) =====
// POST /api/kyc/request-erasure
// User explicitly requests permanent erasure of their KYC data
// Requires auth + explicit confirmation body { confirm: true, confirmationCode: string }
router.post('/request-erasure', auth, async (req, res) => {
  try {
    const { confirm, confirmationCode } = req.body;
    const userId = req.user._id;
    
    if (!confirm || confirmationCode !== 'ERASE_MY_KYC_DATA') {
      return res.status(400).json({
        ok: false,
        error: 'Missing or invalid confirmation. User must explicitly confirm with confirmationCode="ERASE_MY_KYC_DATA"'
      });
    }

    // Soft-delete: mark with erasedAt timestamp, redact PII fields
    const kycRecords = await KYC.find({ userId });
    const erasureTimestamp = new Date();
    
    for (const kyc of kycRecords) {
      // Redact sensitive fields to [erased]
      kyc.firstName = '[erased]';
      kyc.lastName = '[erased]';
      kyc.address = '[erased]';
      kyc.city = '[erased]';
      kyc.postalCode = '[erased]';
      kyc.phoneNumber = '[erased]';
      kyc.idNumber = '[erased]';
      kyc.idDocumentUrl = null;
      kyc.idFrontUrl = null;
      kyc.idBackUrl = null;
      kyc.amlChecks = {
        sanctions: false,
        pep: false,
        adverseMedia: false,
        watchlist: false,
        provider: '[erased]',
        raw: null
      };
      kyc.erasedAt = erasureTimestamp;
      await kyc.save();
    }

    // Audit trail
    await AuditLog.create({
      action: 'kyc_erasure_requested',
      actor: String(userId),
      actorType: 'user',
      resourceType: 'kyc',
      details: { recordsErased: kycRecords.length, erasureTimestamp }
    });

    res.json({
      ok: true,
      message: 'KYC data has been permanently erased per GDPR Article 17',
      erasedRecords: kycRecords.length,
      erasureTimestamp
    });
  } catch (err) {
    logger.error('kyc', 'Erasure request failed', err);
    res.status(500).json({ ok: false, error: 'Erasure request failed' });
  }
});

// GET /api/kyc/erasure-status
// Check if user's KYC data has been erased
router.get('/erasure-status', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const kycRecords = await KYC.find({ userId }).lean();
    
    const erasedCount = kycRecords.filter(k => k.erasedAt).length;
    const status = erasedCount === kycRecords.length && kycRecords.length > 0 ? 'erased' : 'active';
    
    res.json({
      ok: true,
      status,
      erasedRecords: erasedCount,
      totalRecords: kycRecords.length,
      erasureTimestamp: kycRecords.find(k => k.erasedAt)?.erasedAt || null
    });
  } catch (err) {
    logger.error('kyc', 'Erasure status check failed', err);
    res.status(500).json({ ok: false, error: 'Status check failed' });
  }
});

// Run AML check (requires authentication)
router.post('/aml/check', auth, kycCtrl.runAMLCheck);

// Get KYC status (requires authentication)
router.get('/status', auth, kycCtrl.getKYCStatus);

// Draft endpoints — let a mid-flow user save progress and resume later.
// PATCH saves partial data, GET retrieves it, DELETE clears it (called
// after successful submit so a completed user doesn't see a stale resume
// prompt on next login).
// PATCH is on `standard`, not `strict`: the wizard autosaves progress on a
// short debounce while the user types, and strict's 10-per-15-minutes would
// exhaust the same budget POST /submit needs before the user ever reaches
// the final step. The endpoint is auth'd and only writes a small blob.
router.patch('/draft', auth, limiters.standard, kycCtrl.saveDraft);
router.get('/draft', auth, kycCtrl.getDraft);
router.delete('/draft', auth, kycCtrl.clearDraft);

module.exports = router;
