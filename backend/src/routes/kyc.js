const express = require('express');
const router = express.Router();
const kycCtrl = require('../controllers/kycController');
const auth = require('../middleware/auth');
const { validateInput, schemas } = require('../middleware/inputValidation');
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
    occupation: Joi.string().required(),
    sourceOfFunds: Joi.string().required(),
    annualIncome: Joi.string().required(),
    politicalExposure: Joi.boolean().default(false)
  })
};

// Submit KYC data (requires authentication)
router.post('/submit', auth, validateInput(kycSchemas.submitKYC), kycCtrl.submitKYC);

// Run AML check (requires authentication)
router.post('/aml/check', auth, kycCtrl.runAMLCheck);

// Get KYC status (requires authentication)
router.get('/status', auth, kycCtrl.getKYCStatus);

module.exports = router;
