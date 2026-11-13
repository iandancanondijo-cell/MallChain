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
const { requireAdmin } = require('../middleware/adminAuth');
const User = require('../models/user');
const AMLReview = require('../models/amlReview');
const KYCSubmission = require('../models/kycSubmission');
const ComplianceLog = require('../models/complianceLog');
// getAmlProvider, not an `amlProvider` export — there never was one, and the
// destructured undefined made every POST /aml-screen throw on the first call.
const { getAmlProvider } = require('../services/amlProvider');

const RESTRICTED_COUNTRIES = process.env.RESTRICTED_COUNTRIES?.split(',') || [];
const AGE_REQUIREMENT = Number(process.env.AGE_REQUIREMENT || 18);

// AMLReview.riskLevel is a 1-5 score while providers report a label; an
// unrecognised label scores 1 (lowest) but never overrides a hit, which the
// caller already recorded in `status`/`reason`.
const SCREENING_RISK_TO_SCORE = { low: 1, medium: 2, high: 4, critical: 5, unknown: 3 };

/**
 * Which account made this request.
 *
 * middleware/auth puts either a Mongoose document or its lean, Redis-cached
 * form on req.user. Only the document has the `id` virtual, so reading
 * `req.user.id` alone made every route in this file answer "User not found"
 * whenever the session was served from the cache — the same request succeeded
 * or failed depending on cache state.
 */
function actorId(req) {
  return req.user._id || req.user.id || req.user.userId;
}

/**
 * GET /api/compliance/status
 * Get user's compliance status
 */
router.get('/status', requireJWT, async (req, res) => {
  try {
    const userId = actorId(req);
    // ageVerifiedAt/tosAcceptedAt/privacyAcceptedAt have to be selected or
    // they are undefined on the document no matter what the account holds —
    // this endpoint used to report tosAccepted:false for every user.
    const user = await User.findById(userId).select(
      'email kycLevel createdAt ageVerifiedAt tosAcceptedAt privacyAcceptedAt'
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get KYC status
    const kycSubmission = await KYCSubmission.findOne({ userId }).sort('-createdAt');
    const kycStatus = kycSubmission?.status || 'pending';

    // Get AML status. No review means no screening has ever run, which is not
    // the same fact as "screened and clear" (see /aml-check).
    const amlReview = await AMLReview.findOne({ userId }).sort('-createdAt');
    const amlStatus = amlReview?.status || 'not_screened';

    // Check geographic restrictions
    const clientCountry = req.headers['cf-ipcountry'] || 'UNKNOWN';
    const geographicRestriction = RESTRICTED_COUNTRIES.includes(clientCountry);

    return res.json({
      ageVerified: !!user.ageVerifiedAt,
      ageVerifiedAt: user.ageVerifiedAt || null,
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
        userId: actorId(req),
        calculatedAge: actualAge,
        requirement: AGE_REQUIREMENT,
      });

      return res.status(403).json({
        error: 'age_verification_failed',
        message: `You must be at least ${AGE_REQUIREMENT} years old`,
      });
    }

    // Update user record
    await User.findByIdAndUpdate(actorId(req), {
      ageVerifiedAt: new Date(),
    });

    // Log compliance event
    await ComplianceLog.create({
      userId: actorId(req),
      eventType: 'age_verification',
      status: 'success',
      metadata: {
        calculatedAge: actualAge,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    logger.info('compliance', 'Age verification successful', {
      userId: actorId(req),
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
    const userId = actorId(req);
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
    const userId = actorId(req);
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
    const userId = actorId(req);
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get AML review. Absence of a review is absence of screening, not a
    // clean bill of health: reporting 'clear' here advertised a compliance
    // result that was never obtained.
    const amlReview = await AMLReview.findOne({ userId }).sort('-createdAt');

    if (!amlReview) {
      return res.json({
        status: 'not_screened',
        screened: false,
        message: 'No AML screening has been run for this account',
        reviewedAt: null,
      });
    }

    return res.json({
      status: amlReview.status,
      screened: amlReview.screeningData?.screened !== false,
      provider: amlReview.provider || null,
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

    await User.findByIdAndUpdate(actorId(req), {
      tosAcceptedAt: tosVersion ? new Date() : undefined,
      privacyAcceptedAt: privacyVersion ? new Date() : undefined,
      tosVersion: tosVersion || undefined,
      privacyVersion: privacyVersion || undefined,
    });

    // Log compliance event
    await ComplianceLog.create({
      userId: actorId(req),
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
      userId: actorId(req),
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
 *
 * Requires a configured vendor. Without one nothing is screened, so nothing is
 * recorded: writing an AMLReview with status 'clear' would put a compliance
 * finding in the audit trail that was never obtained. The response says which
 * provider was missing instead (services/amlProvider.js).
 */
router.post('/aml-screen', requireJWT, requireAdmin, async (req, res) => {
  try {
    const userId = actorId(req);
    // Only fields the User schema actually declares: naming a path that isn't
    // there makes .select() throw, which would fail the request before it
    // reached the provider. (A PEP declaration lives on the KYC record, not on
    // the account.)
    const user = await User.findById(userId).select('name email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Screen with the configured AML provider (email is encrypted at rest —
    // decrypt it first, otherwise the provider screens against ciphertext and
    // never matches).
    const screeningResult = await getAmlProvider().screen({
      firstName: user.name ? String(user.name).split(' ')[0] : undefined,
      lastName: user.name ? String(user.name).split(' ').slice(1).join(' ') : undefined,
      name: user.name,
      email: User.decryptUserPii(user).email,
    });

    if (screeningResult.screened === false) {
      logger.warn('compliance', 'AML screening requested but no vendor is configured', {
        userId,
        provider: screeningResult.provider,
      });
      return res.status(503).json({
        screened: false,
        provider: screeningResult.provider,
        error: screeningResult.warning
          || 'No AML screening vendor is configured — set AML_PROVIDER_TYPE and AML_PROVIDER_API_KEY',
      });
    }

    const hits = ['sanctions', 'pep', 'adverseMedia', 'watchlist']
      .filter((flag) => screeningResult[flag]);
    const flagged = hits.length > 0;
    const reason = flagged
      ? `AML screening hit: ${hits.join(', ')} (${screeningResult.provider})`
      : undefined;

    // Save result
    const amlReview = new AMLReview({
      userId,
      status: flagged ? 'flagged' : 'clear',
      reason,
      riskLevel: SCREENING_RISK_TO_SCORE[screeningResult.riskLevel] || 1,
      screeningData: screeningResult,
      provider: screeningResult.provider,
      screenedAt: new Date(),
      reviewedAt: new Date(),
    });

    await amlReview.save();

    // Log compliance event. ComplianceLog.status has no 'clear' in its enum —
    // passing one made this create throw a validation error that surfaced as
    // "AML screening failed"; a no-hit screening is a success.
    await ComplianceLog.create({
      userId,
      eventType: 'aml_screening',
      status: flagged ? 'flagged' : 'success',
      metadata: {
        reason,
        provider: screeningResult.provider,
        riskLevel: screeningResult.riskLevel,
      },
    });

    logger.info('compliance', 'AML screening completed', {
      userId,
      status: flagged ? 'flagged' : 'clear',
      provider: screeningResult.provider,
    });

    return res.json({
      success: true,
      screened: true,
      provider: screeningResult.provider,
      status: flagged ? 'flagged' : 'clear',
      reason,
    });
  } catch (err) {
    // Fail closed, and never as a clean result: an unreadable vendor response
    // or an unreachable provider is recorded as needing manual review.
    logger.error('compliance', 'AML screening failed', err);
    res.status(503).json({
      screened: false,
      provider: 'unavailable',
      error: 'AML screening could not be completed — review the account manually',
    });
  }
});

module.exports = router;
