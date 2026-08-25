const path = require('path');
const KYC = require('../models/kyc');
const User = require('../models/user');
const { KYC_UPLOAD_DIR } = require('../middleware/upload');
const { screenAml } = require('../services/amlProvider');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');

exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'No document uploaded', 400);
  }
  // The ref is just the on-disk filename — resolved back to a path only by
  // getDocument below, and never exposed as a public URL.
  res.json({ ok: true, documentRef: req.file.filename });
});

exports.getDocument = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  const kyc = await KYC.findById(req.params.kycId);
  if (!kyc) throw new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404);

  const isOwner = String(kyc.userId) === String(userId);
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
  if (!isOwner && !isAdmin) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Forbidden', 403);
  }
  if (!kyc.idDocumentUrl) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'No document on file', 404);
  }

  // idDocumentUrl only needs to start with `${userId}-` (see submitKYC) —
  // nothing stops an owner from submitting e.g. `${userId}-../../../etc/passwd`
  // as the value. path.join would happily resolve that outside
  // KYC_UPLOAD_DIR, turning this into an arbitrary-file-read via a KYC
  // record the attacker owns. Strip any directory component so only a
  // bare filename inside KYC_UPLOAD_DIR can ever be served — this matches
  // what uploadDocument actually produces (multer's filename has no path
  // separators) and is a no-op for every legitimate document.
  const filePath = path.join(KYC_UPLOAD_DIR, path.basename(kyc.idDocumentUrl));
  // res.sendFile's error callback fires after headers may already be in
  // flight — it must reply directly rather than throw into asyncHandler.
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { message: 'Document not found' } });
  });
});

// Delegates to services/amlProvider.js — a real vendor (Chainalysis, TRM,
// ComplyAdvantage, etc.) plugs in there once credentials exist; until then
// this calls the mock provider, which returns the same shape as before.
const performAMLCheck = async (kycData) => {
  const checks = await screenAml(kycData);

  let riskLevel = 'low';
  if (checks.sanctions || checks.adverseMedia || checks.watchlist) {
    riskLevel = 'high';
  } else if (checks.pep) {
    riskLevel = 'medium';
  }

  return { checks, riskLevel };
};

exports.submitKYC = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const kycData = req.body;

  // idDocumentUrl is a client-supplied string (Joi only checks it's
  // non-empty) that getDocument later trusts to stream a file back to
  // whoever owns *this* KYC record — without this check, submitting
  // another user's uploaded filename (predictable: `${userId}-${ts}-
  // ${name}`, see upload.js) would let an attacker read that user's ID
  // document back through their own, legitimately-owned KYC record.
  if (kycData.idDocumentUrl && !kycData.idDocumentUrl.startsWith(`${userId}-`)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Document was not uploaded by this account', 403);
  }

  // Check if user already has a pending KYC
  const existingKYC = await KYC.findOne({ userId, status: { $in: ['pending', 'review'] } });
  if (existingKYC) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'KYC already in progress', 400);
  }

  // The AML check below is a mocked signal (no real sanctions/watchlist
  // provider is integrated) — it's informational input for an admin's
  // review, not an approval trigger. Every submission requires a real
  // human decision now; nothing here can auto-approve.
  const { checks, riskLevel } = await performAMLCheck(kycData);
  const status = 'pending';

  let kyc;
  try {
    // Create KYC record
    kyc = await KYC.create({
      userId,
      ...kycData,
      riskLevel,
      amlChecks: checks,
      status
    });

    // A real name only exists here (KYC firstName/lastName) — the account
    // record has no name field of its own. Populate it as a display
    // convenience, but never clobber a name the user already set manually
    // via their profile.
    if (kycData.firstName || kycData.lastName) {
      const user = await User.findById(userId).select('name');
      if (user && !user.name) {
        await User.findByIdAndUpdate(userId, {
          name: [kycData.firstName, kycData.lastName].filter(Boolean).join(' '),
        });
      }
    }
  } catch (err) {
    // A raw DB error can contain field values (this record holds ID
    // numbers, addresses, financial details) — never forward err.message
    // to the client, unlike errorHandler.js's generic fallback.
    console.error('KYC submission error:', err);
    throw new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to submit KYC', 500);
  }

  res.json({
    success: true,
    kycId: kyc._id,
    riskLevel,
    status,
    checks
  });
});

exports.runAMLCheck = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const { kycData } = req.body;

  let checks, riskLevel;
  try {
    // Perform AML check
    ({ checks, riskLevel } = await performAMLCheck(kycData));

    // Update existing KYC or create new one — this is a mocked signal, not
    // an approval trigger (see submitKYC for the same reasoning); status is
    // left untouched here so a real admin decision is what changes it.
    await KYC.findOneAndUpdate(
      { userId },
      {
        riskLevel,
        amlChecks: checks,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error('AML check error:', err);
    throw new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to run AML check', 500);
  }

  res.json({
    success: true,
    checks,
    riskLevel
  });
});

exports.getKYCStatus = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  let kyc;
  try {
    kyc = await KYC.findOne({ userId }).sort({ submittedAt: -1 });
  } catch (err) {
    console.error('KYC status error:', err);
    throw new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to get KYC status', 500);
  }

  if (!kyc) {
    return res.json({ status: 'not_submitted' });
  }

  // This is the user's own submission — safe to return in full so a
  // real "Profile" view can show exactly what was submitted and what an
  // admin has (or hasn't) verified, instead of just a bare status chip.
  res.json({
    kycId: kyc._id,
    status: kyc.status,
    riskLevel: kyc.riskLevel,
    amlChecks: kyc.amlChecks,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt || null,
    notes: kyc.notes || '',
    hasDocument: !!kyc.idDocumentUrl,
    personal: {
      firstName: kyc.firstName,
      lastName: kyc.lastName,
      dateOfBirth: kyc.dateOfBirth,
      nationality: kyc.nationality,
    },
    address: {
      address: kyc.address,
      city: kyc.city,
      country: kyc.country,
      postalCode: kyc.postalCode,
      phoneNumber: kyc.phoneNumber,
    },
    identity: {
      idType: kyc.idType,
      idNumber: kyc.idNumber,
      idExpiry: kyc.idExpiry,
    },
    financial: {
      occupation: kyc.occupation,
      sourceOfFunds: kyc.sourceOfFunds,
      annualIncome: kyc.annualIncome,
      politicalExposure: kyc.politicalExposure,
    },
  });
});
