const express = require('express');
const path = require('path');
const Joi = require('joi');
const router = express.Router();

const auth = require('../middleware/auth');
const { uploadAmlDocument, AML_UPLOAD_DIR } = require('../middleware/upload');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const AuditLog = require('../models/AuditLog');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');

const NATIVE_EARNINGS_SOURCES = WithdrawalAmlReview.NATIVE_EARNINGS_SOURCES;

// Colocated with the route, mirroring routes/kyc.js's own convention of
// keeping its schema next to the handler rather than in the shared
// middleware/validation.js file.
const amlDeclarationSchema = Joi.object({
  fundsSource: Joi.string().valid(
    'mining_staking_rewards', 'mallpoints_conversion', 'referral_bonus',
    'salary', 'business_income', 'gift', 'asset_sale', 'other'
  ).required(),
  narrative: Joi.string().min(20).max(2000).required().messages({
    'string.min': 'Please give a bit more detail (at least 20 characters) about where these funds came from.',
  }),
  // Enforced here, not just in application code: waived only for the three
  // Mallchain-native earnings sources (already verifiable via this
  // platform's own records), required for everything else.
  documentRef: Joi.string().when('fundsSource', {
    is: Joi.valid(...NATIVE_EARNINGS_SOURCES),
    then: Joi.string().optional(),
    otherwise: Joi.string().required().messages({
      'any.required': 'Please upload a supporting document showing this income (e.g. a payslip, bank statement, business receipt, or sale agreement).',
    }),
  }),
  // Record-keeping only (see below) — not used to gate anything.
  estimatedKes: Joi.number().positive().optional(),
});

// Upload the supporting document — must happen before /declare, which
// requires the returned documentRef, exactly matching routes/kyc.js's
// /document-before-/submit ordering.
router.post('/document', auth, uploadAmlDocument.single('document'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'No document uploaded', 400);
  }
  res.json({ ok: true, documentRef: req.file.filename });
}));

router.post('/declare', auth, asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const walletAddress = req.user?.walletAddress;
  if (!walletAddress) {
    throw new AppError(
      ErrorCodes.INVALID_REQUEST_FORMAT,
      'Link a wallet to your account before completing this verification.',
      400
    );
  }

  const { error, value } = amlDeclarationSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST_FORMAT',
        message: 'Verification form validation failed',
        details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
      },
    });
  }

  // documentRef is a client-supplied filename (same predictable
  // `${userId}-${ts}-${name}` shape as KYC's idDocumentUrl) — without this
  // check, submitting another user's uploaded filename would let an
  // attacker attach someone else's document to their own declaration.
  if (value.documentRef && !value.documentRef.startsWith(`${userId}-`)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Document was not uploaded by this account', 403);
  }

  const isNativeEarnings = NATIVE_EARNINGS_SOURCES.includes(value.fundsSource);

  // Record-keeping only — the client's own /sell/preview call already told
  // it this crossed the threshold; the actual gate re-checked at /sell time
  // (requireApprovedAmlReview) doesn't depend on this value at all.
  const triggerAmountKes = Number(value.estimatedKes) || 0;

  const review = await WithdrawalAmlReview.create({
    userId,
    walletAddress,
    triggerAmountKes,
    fundsSource: value.fundsSource,
    isNativeEarnings,
    narrative: value.narrative,
    documentRef: value.documentRef || null,
    status: 'pending',
  });

  res.json({ ok: true, reviewId: review._id, status: review.status });
}));

router.get('/status', auth, asyncHandler(async (req, res) => {
  const walletAddress = req.user?.walletAddress;
  if (!walletAddress) {
    return res.json({ ok: true, walletLinked: false, reviewStatus: 'none', reviewId: null });
  }

  const latest = await WithdrawalAmlReview.findOne({ walletAddress }).sort({ submittedAt: -1 });
  res.json({
    ok: true,
    walletLinked: true,
    reviewStatus: latest ? latest.status : 'none',
    reviewId: latest ? latest._id : null,
    reviewNotes: latest?.reviewNotes || null,
  });
}));

router.get('/:reviewId/document', auth, asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const review = await WithdrawalAmlReview.findById(req.params.reviewId);
  if (!review) throw new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404);

  const isOwner = String(review.userId) === String(userId);
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
  if (!isOwner && !isAdmin) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Forbidden', 403);
  }
  if (!review.documentRef) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'No document on file', 404);
  }

  // path.basename strips any directory component a malicious documentRef
  // might carry — same path-traversal hardening as kycController.js's
  // getDocument, for the identical reason (documentRef is client-supplied).
  const filePath = path.join(AML_UPLOAD_DIR, path.basename(review.documentRef));

  const reason = typeof req.query?.reason === 'string' ? req.query.reason.slice(0, 300) : undefined;
  AuditLog.create({
    action: 'withdrawal_aml_document_viewed',
    actor: String(userId),
    actorType: isAdmin && !isOwner ? 'admin' : 'user',
    resourceType: 'withdrawal_aml_review',
    resourceId: String(review._id),
    details: { subjectUserId: String(review.userId), viewedOwnDocument: isOwner, reason: reason || null },
  }).catch((err) => logger.error('withdrawalAml', 'failed to write document-view audit log', err));

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { message: 'Document not found' } });
  });
}));

module.exports = router;
