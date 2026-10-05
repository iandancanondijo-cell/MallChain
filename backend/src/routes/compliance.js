/**
 * Compliance & Regulatory Routes
 * Handles age verification, KYC/AML checks, terms acceptance, etc.
 * 
 * Endpoints:
 * GET /api/compliance/status - Check compliance status
 * POST /api/compliance/age-verify - Record age verification
 * POST /api/compliance/kyc-initiate - Start KYC verification
 * GET /api/compliance/kyc-status - Check KYC status
 * GET /api/compliance/aml-check - AML screening results
 * POST /api/compliance/terms-accept - Accept terms
 * GET /api/compliance/restrictions - Geographic restrictions
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const requireJWT = require('../middleware/auth');
const User = require('../models/user');
const AMLReview = require('../models/amlReview');
const KYCSubmission = require('../models/kycSubmission');
const ComplianceLog = require('../models/complianceLog');
const { amlProvider } = require('../services/amlProvider');

const RESTRICTED_COUNTRIES = process.env.RESTRICTED_COUNTRIES?.split(',') || [];
const AGE_REQUIREMENT = Number(process.env.AGE_REQUIREMENT || 18);

/**
 * GET /api/compliance/status
 * Get user's compliance status
 */
router.get('/status', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select(
      'email kycLevel createdAt'
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get KYC status
    const kycSubmission = await KYCSubmission.findOne({ userId }).sort('-createdAt');
    const kycStatus = kycSubmission?.status || 'pending';

    // Get AML status
    const amlReview = await AMLReview.findOne({ userId }).sort('-createdAt');
    const amlStatus = amlReview?.status || 'clear';

    // Check geographic restrictions
    const clientCountry = req.headers['cf-ipcountry'] || 'UNKNOWN';
    const geographicRestriction = RESTRICTED_COUNTRIES.includes(clientCountry);

    return res.json({
      ageVerified: user.createdAt
        ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24) >= 365 // Assume age verified if account >365 days
        : false,
      tosAccepted: !!user.tosAcceptedAt,
      privacyAccepted: !!user.privacyAcceptedAt,
      kycLevel: user.kycLevel || 0,
      kycStatus,
      amlStatus,
      geographicRestriction,
      restrictedReason: geographicRestriction
        ? `Mallchain services are not available in ${clientCountry}`
        : undefined,
      lastVerified: Date.now(),
    });
  } catch (err) {
    logger.error('compliance', 'Failed to get compliance status', err);
    res.status(500).json({ error: 'Failed to get compliance status' });
  }
});

/**
 * POST /api/compliance/age-verify
 * Record age verification
 */
router.post('/age-verify', requireJWT, async (req, res) => {
  try {
    const { birthDate } = req.body;

    if (!birthDate) {
      return res.status(400).json({ error: 'Birth date required' });
    }

    const birth = new Date(birthDate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    let actualAge = age;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      actualAge = age - 1;
    }

    if (actualAge < AGE_REQUIREMENT) {
      logger.warn('compliance', 'Age verification failed - under age', {
        userId: req.user.id,
        calculatedAge: actualAge,
        requirement: AGE_REQUIREMENT,
      });

      return res.status(403).json({
        error: 'age_verification_failed',
        message: `You must be at least ${AGE_REQUIREMENT} years old`,
      });
    }

    // Update user record
    await User.findByIdAndUpdate(req.user.id, {
      ageVerifiedAt: new Date(),
    });

    // Log compliance event
    await ComplianceLog.create({
      userId: req.user.id,
      eventType: 'age_verification',
      status: 'success',
      metadata: {
        calculatedAge: actualAge,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logger.info('compliance', 'Age verification successful', {
      userId: req.user.id,
      age: actualAge,
    });

    return res.json({
      success: true,
      message: 'Age verified successfully',
      ageVerified: true,
    });
  } catch (err) {
    logger.error('compliance', 'Age verification failed', err);
    res.status(500).json({ error: 'Age verification failed' });
  }
});

/**
 * POST /api/compliance/kyc-initiate
 * Initiate KYC verification
 */
router.post('/kyc-initiate', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { documentType, documentUrl, selfieUrl } = req.body;

    if (!documentType || !documentUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for existing pending KYC
    const existingKYC = await KYCSubmission.findOne({
      userId,
      status: 'pending',
    });

    if (existingKYC) {
      return res.status(409).json({
        error: 'kyc_already_pending',
        message: 'KYC verification already in progress',
      });
    }

    // Create KYC submission
    const kycSubmission = new KYCSubmission({
      userId,
      documentType,
      documentUrl,
      selfieUrl,
      status: 'pending',
      submittedAt: new Date(),
      ipAddress: req.ip,
    });

    await kycSubmission.save();

    // Update user KYC level
    await User.findByIdAndUpdate(userId, { kycLevel: 1 });

    // Log compliance event
    await ComplianceLog.create({
      userId,
      eventType: 'kyc_submission',
      status: 'initiated',
      metadata: {
        documentType,
        submissionId: kycSubmission._id,
        ipAddress: req.ip,
      },
    });

    logger.info('compliance', 'KYC verification initiated', {
      userId,
      documentType,
      submissionId: kycSubmission._id,
    });

    return res.json({
      success: true,
      message: 'KYC verification initiated',
      submissionId: kycSubmission._id,
      status: 'pending',
    });
  } catch (err) {
    logger.error('compliance', 'KYC initiation failed', err);
    res.status(500).json({ error: 'KYC initiation failed' });
  }
});

/**
 * GET /api/compliance/kyc-status
 * Check KYC verification status
 */
router.get('/kyc-status', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const kycSubmission = await KYCSubmission.findOne({ userId }).sort('-createdAt');

    if (!kycSubmission) {
      return res.json({
        status: 'none',
        message: 'No KYC submission found',
      });
    }

    return res.json({
      status: kycSubmission.status,
      submittedAt: kycSubmission.submittedAt,
      verifiedAt: kycSubmission.verifiedAt,
      rejectionReason: kycSubmission.rejectionReason,
      level: kycSubmission.status === 'approved' ? 2 : 1,
    });
  } catch (err) {
    logger.error('compliance', 'Failed to get KYC status', err);
    res.status(500).json({ error: 'Failed to get KYC status' });
  }
});

/**
 * GET /api/compliance/aml-check
 * Check AML screening results
 */
router.get('/aml-check', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get AML review
    const amlReview = await AMLReview.findOne({ userId }).sort('-createdAt');

    if (!amlReview) {
      return res.json({
        status: 'clear',
        message: 'No AML concerns',
        reviewedAt: null,
      });
    }

    return res.json({
      status: amlReview.status,
      reason: amlReview.status === 'flagged' ? amlReview.reason : null,
      reviewedAt: amlReview.reviewedAt,
      reviewedBy: amlReview.reviewedBy ? 'compliance_team' : null,
    });
  } catch (err) {
    logger.error('compliance', 'Failed to get AML check', err);
    res.status(500).json({ error: 'Failed to get AML check' });
  }
});

/**
 * POST /api/compliance/terms-accept
 * Record terms acceptance
 */
router.post('/terms-accept', requireJWT, async (req, res) => {
  try {
    const { tosVersion, privacyVersion } = req.body;

    await User.findByIdAndUpdate(req.user.id, {
      tosAcceptedAt: tosVersion ? new Date() : undefined,
      privacyAcceptedAt: privacyVersion ? new Date() : undefined,
      tosVersion: tosVersion || undefined,
      privacyVersion: privacyVersion || undefined,
    });

    // Log compliance event
    await ComplianceLog.create({
      userId: req.user.id,
      eventType: 'terms_acceptance',
      status: 'accepted',
      metadata: {
        tosVersion,
        privacyVersion,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logger.info('compliance', 'Terms accepted', {
      userId: req.user.id,
      tosVersion,
      privacyVersion,
    });

    return res.json({
      success: true,
      message: 'Terms accepted',
    });
  } catch (err) {
    logger.error('compliance', 'Terms acceptance failed', err);
    res.status(500).json({ error: 'Terms acceptance failed' });
  }
});

/**
 * GET /api/compliance/restrictions
 * Check geographic and service restrictions
 */
router.get('/restrictions', async (req, res) => {
  try {
    const clientCountry = req.headers['cf-ipcountry'] || 'UNKNOWN';
    const isRestricted = RESTRICTED_COUNTRIES.includes(clientCountry);

    if (isRestricted) {
      return res.status(403).json({
        restricted: true,
        country: clientCountry,
        reason: `Mallchain services are not available in ${clientCountry}`,
        message: 'Service unavailable in your region',
      });
    }

    return res.json({
      restricted: false,
      country: clientCountry,
      available: true,
    });
  } catch (err) {
    logger.error('compliance', 'Failed to check restrictions', err);
    res.status(500).json({ error: 'Failed to check restrictions' });
  }
});

/**
 * POST /api/compliance/aml-screen
 * Trigger AML screening for user (admin)
 */
router.post('/aml-screen', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('name email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Screen with AML provider
    const screeningResult = await amlProvider.screen({
      name: user.name,
      email: user.email,
    });

    // Save result
    const amlReview = new AMLReview({
      userId,
      status: screeningResult.flagged ? 'flagged' : 'clear',
      reason: screeningResult.reason,
      screeningData: screeningResult,
      reviewedAt: new Date(),
    });

    await amlReview.save();

    // Log compliance event
    await ComplianceLog.create({
      userId,
      eventType: 'aml_screening',
      status: screeningResult.flagged ? 'flagged' : 'clear',
      metadata: {
        reason: screeningResult.reason,
      },
    });

    logger.info('compliance', 'AML screening completed', {
      userId,
      status: screeningResult.flagged ? 'flagged' : 'clear',
    });

    return res.json({
      success: true,
      status: screeningResult.flagged ? 'flagged' : 'clear',
      reason: screeningResult.reason,
    });
  } catch (err) {
    logger.error('compliance', 'AML screening failed', err);
    res.status(500).json({ error: 'AML screening failed' });
  }
});

module.exports = router;
