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
    idDocumentUrl: Joi.string().required(),
    occupation: Joi.string().required(),
    sourceOfFunds: Joi.string().required(),
    annualIncome: Joi.string().required(),
    politicalExposure: Joi.boolean().default(false)
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

// Run AML check (requires authentication)
router.post('/aml/check', auth, kycCtrl.runAMLCheck);

// Get KYC status (requires authentication)
router.get('/status', auth, kycCtrl.getKYCStatus);

// Draft endpoints — let a mid-flow user save progress and resume later.
// PATCH saves partial data, GET retrieves it, DELETE clears it (called
// after successful submit so a completed user doesn't see a stale resume
// prompt on next login).
router.patch('/draft', auth, limiters.strict, kycCtrl.saveDraft);
router.get('/draft', auth, kycCtrl.getDraft);
router.delete('/draft', auth, kycCtrl.clearDraft);

module.exports = router;
