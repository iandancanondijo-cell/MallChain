const path = require('path');
const KYC = require('../models/kyc');
const User = require('../models/user');
const AuditLog = require('../models/AuditLog');
const { KYC_UPLOAD_DIR } = require('../middleware/upload');
const { screenAml } = require('../services/amlProvider');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const activityEvents = require('../services/activityEvents');
// idFrontUrl / idBackUrl / idDocumentUrl are stored encrypted at rest
// (ENCRYPTED_FIELDS in models/kyc.js). Lookups that translate them back to
// the on-disk filename must pass them through decryptField first —
// otherwise we'd resolve `path.join(KYC_UPLOAD_DIR, "v1:...:...")` and
// sendFile() would 404.
const { decryptField } = require('../utils/fieldEncryption');
const { verdictForAccount } = require('../middleware/requireKyc');

exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'No document uploaded', 400);
  }
  
  // P1 ISSUE #2 WORKAROUND: Add file corruption detection
  // Verify PNG/JPEG headers to ensure file integrity
  const buffer = req.file.buffer || Buffer.alloc(0);
  
  if (buffer.length > 0) {
    // PNG magic bytes: 89 50 4E 47
    const isPng = buffer.length >= 4 && 
      buffer[0] === 0x89 && buffer[1] === 0x50 && 
      buffer[2] === 0x4E && buffer[3] === 0x47;
    
    // JPEG magic bytes: FF D8
    const isJpeg = buffer.length >= 2 && 
      buffer[0] === 0xFF && buffer[1] === 0xD8;
    
    if (!isPng && !isJpeg) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'File appears corrupted or is not a valid PNG/JPEG image',
        400
      );
    }
  }
  
  // The ref is just the on-disk filename — resolved back to a path only by
  // getDocument below, and never exposed as a public URL.
  res.json({ ok: true, documentRef: req.file.filename });
});

exports.getDocument = asyncHandler(async (req, res) => {
  // req.user is the cached JSON object (NOT a Mongoose doc), so there is
  // no `id` virtual — fall through to _id/stringify of the ObjectId.
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const kyc = await KYC.findById(req.params.kycId);
  if (!kyc) throw new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404);

  const isOwner = String(kyc.userId) === String(userId);
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
  if (!isOwner && !isAdmin) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Forbidden', 403);
  }

  // side ∈ { 'front', 'back', 'document' } — 'document' is the legacy
  // single-side field, still here so old submissions remain viewable.
  // Default to 'front' because every new submission is dual-side and
  // admins reviewing such a record most often want to start with the
  // front (photo + name + DOB) anyway.
  const sideParam = typeof req.query?.side === 'string' ? req.query.side.toLowerCase() : 'front';
  const sideRequested = typeof req.query?.side === 'string' && req.query.side.length > 0;
  const fieldName = sideParam === 'back'
    ? 'idBackUrl'
    : sideParam === 'document' || sideParam === 'single'
      ? 'idDocumentUrl'
      : 'idFrontUrl';

  // idFrontUrl / idBackUrl / idDocumentUrl are AES-GCM encrypted at rest
  // (see ENCRYPTED_FIELDS in models/kyc.js). The stored value is opaque
  // ciphertext like `v1:iv:tag:ct` — feeding that straight into
  // path.basename() yields junk and sendFile() would 404. decryptField
  // is a no-op for already-plain values, so legacy records (pre-encryption
  // migration) keep working too.
  let storedUrl = decryptField(kyc[fieldName]);

  // Records submitted before the dual-side change only have idDocumentUrl.
  // With no explicit ?side the caller asked for "the document", not
  // specifically the front, so fall back to the legacy field rather than
  // 404-ing every pre-dual-side submission — which is what the comment above
  // promises ("still here so old submissions remain viewable") but the
  // default did not do. An explicit ?side=front|back|document is always
  // honoured exactly, with no cross-field fallback.
  if (!storedUrl && !sideRequested && kyc.idDocumentUrl) {
    storedUrl = decryptField(kyc.idDocumentUrl);
  }

  if (!storedUrl) {
    throw new AppError(ErrorCodes.NOT_FOUND, `No ${fieldName === 'idDocumentUrl' ? 'document' : sideParam + ' document'} on file`, 404);
  }

  // Each id*Url only needs to start with `${userId}-` (see submitKYC) —
  // nothing stops an owner from submitting e.g. `${userId}-../../../etc/passwd`
  // as the value. path.join would happily resolve that outside
  // KYC_UPLOAD_DIR, turning this into an arbitrary-file-read via a KYC
  // record the attacker owns. Strip any directory component so only a
  // bare filename inside KYC_UPLOAD_DIR can ever be served — this matches
  // what uploadDocument actually produces (multer's filename has no path
  // separators) and is a no-op for every legitimate document.
  const filePath = path.join(KYC_UPLOAD_DIR, path.basename(storedUrl));

  // Every view of a raw identity document is logged — who (viewer id/role)
  // looked at whose KYC record and when. This matters most for the isAdmin
  // path above: an admin can view ANY user's ID document, and that access
  // needs its own trail independent of the (separate) KYC approve/reject
  // decision audit log already written elsewhere. Logged before sendFile
  // rather than in its callback so a viewing attempt is recorded even if
  // sendFile itself later fails (e.g. the file went missing on disk).
  // reason is optional context an admin can attach from the frontend's
  // access-confirmation step (e.g. "reviewing rejected KYC appeal") — never
  // required, since the log itself is unconditional and must never be
  // skippable, but it makes the trail more useful when one is given.
  const reason = typeof req.query?.reason === 'string' ? req.query.reason.slice(0, 300) : undefined;

  AuditLog.create({
    action: 'kyc_document_viewed',
    actor: String(userId),
    actorType: isAdmin && !isOwner ? 'admin' : 'user',
    resourceType: 'kyc',
    resourceId: String(kyc._id),
    details: { subjectUserId: String(kyc.userId), viewedOwnDocument: isOwner, reason: reason || null },
  }).catch((err) => logger.error('kycController', 'failed to write document-view audit log', err));

  // res.sendFile's error callback fires after headers may already be in
  // flight — it must reply directly rather than throw into asyncHandler.
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { message: 'Document not found' } });
  });
});

// Delegates to services/amlProvider.js — a real vendor (Chainalysis, TRM,
// ComplyAdvantage, etc.) plugs in there once credentials exist. Until then no
// vendor is reachable, so nothing is screened, and this code treats "nothing
// was screened" exactly like "the screening failed": the submission is held for
// a human at high risk, and the record states which of the two happened.
//
// FAIL-CLOSED, NOT FAIL-500: a screening provider outage (e.g. Chainalysis
// returning Cloudflare 530, confirmed live 2026-11-02 when a real user's
// POST /api/kyc/submit died with "Internal server error" after 4 retries)
// must not block a legitimate submission. The AML signal is informational
// input for the admin reviewer — nothing here auto-approves — so when the
// provider is unreachable we mark the checks as un-runnable, flag the
// submission 'high' risk so it surfaces prominently in the manual review
// queue, and let the record be created.
//
// The shape this returns is the compliance audit trail, so nothing here may
// assert a finding it did not obtain: every un-screened path reports the four
// list flags as false (no list was consulted) with `screened:false`, never as
// a clean result and never as a hit. The applicant's politically-exposed
// answer is kept as a declaration (`raw.declaredPoliticalExposure`, plus the
// top-level `politicalExposure` field on the record) rather than promoted into
// `pep`, which means "a PEP list matched".
const unscreenedResult = (kycData, provider, warning) => ({
  checks: {
    screened: false,
    sanctions: false,
    pep: false,
    adverseMedia: false,
    watchlist: false,
    provider,
    raw: {
      warning,
      declaredPoliticalExposure: Boolean(kycData.politicalExposure),
    },
  },
  riskLevel: 'high',
});

const performAMLCheck = async (kycData) => {
  let checks;
  try {
    checks = await screenAml(kycData);
  } catch (err) {
    logger.error('kycController', 'AML screening unavailable — holding submission for manual review', err);
    return unscreenedResult(
      kycData,
      'unavailable',
      `AML screening provider unreachable at submit time — manual review required (${err.message})`,
    );
  }

  // No vendor configured (dev/test) or production safeguard active: the flags
  // are false because nobody looked, which is not evidence of innocence.
  if (checks.screened === false) {
    logger.warn('kycController', 'AML screening did not run — holding submission for manual review', {
      provider: checks.provider,
    });
    return unscreenedResult(
      kycData,
      checks.provider || 'none',
      checks.warning || 'AML screening did not run — manual review required',
    );
  }

  let riskLevel = 'low';
  if (checks.sanctions || checks.adverseMedia || checks.watchlist) {
    riskLevel = 'high';
  } else if (checks.pep) {
    riskLevel = 'medium';
  }

  return { checks, riskLevel };
};

exports.submitKYC = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const kycData = req.body;

  // idDocumentUrl is a client-supplied string (Joi only checks it's
  // non-empty) that getDocument later trusts to stream a file back to
  // whoever owns *this* KYC record — without this check, submitting
  // Validate document ownership: idDocumentUrl, idFrontUrl, idBackUrl must start with userId
  if (kycData.idDocumentUrl && !kycData.idDocumentUrl.startsWith(`${userId}-`)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Document was not uploaded by this account', 403);
  }
  if (kycData.idFrontUrl && !kycData.idFrontUrl.startsWith(`${userId}-`)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Front document was not uploaded by this account', 403);
  }
  if (kycData.idBackUrl && !kycData.idBackUrl.startsWith(`${userId}-`)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Back document was not uploaded by this account', 403);
  }

  // Validate at least one document format provided
  const hasSingleDoc = !!kycData.idDocumentUrl;
  const hasDualDocs = !!(kycData.idFrontUrl && kycData.idBackUrl);
  
  if (!hasSingleDoc && !hasDualDocs) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Document(s) required: either idDocumentUrl or both idFrontUrl and idBackUrl', 400);
  }

  // Warn if using deprecated single-document format
  if (hasSingleDoc && !hasDualDocs) {
    logger.warn('kycController', 'Deprecated single-document KYC format used', { userId });
  }

  // Check if user already has a pending KYC
  const existingKYC = await KYC.findOne({ userId, status: { $in: ['pending', 'review'] } });
  if (existingKYC) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'KYC already in progress', 400);
  }

  // The AML result below is informational input for an admin's review, not an
  // approval trigger — and until a real vendor is configured it is not a
  // screening result at all: `amlChecks.screened` says which of the two the
  // record holds. Every submission requires a real human decision either way;
  // nothing here can auto-approve.
  const { checks, riskLevel } = await performAMLCheck(kycData);
  const status = 'pending';

  let kyc;
  try {
    // If the user saved wizard progress before submitting, promote that
    // draft record in place rather than creating a second record for the
    // same userId (the pre-save PII encryption hook runs on this path too,
    // which findOneAndUpdate would bypass). .set() marks every submitted
    // field modified so encryption covers them.
    const draftRecord = await KYC.findOne({ userId, status: 'draft' });
    if (draftRecord) {
      draftRecord.set({ ...kycData, riskLevel, amlChecks: checks, status });
      draftRecord.draft = undefined;
      draftRecord.submittedAt = new Date();
      await draftRecord.save();
      kyc = draftRecord;
    } else {
      kyc = await KYC.create({
        userId,
        ...kycData,
        riskLevel,
        amlChecks: checks,
        status
      });
    }

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

  activityEvents.emitKycSubmitted(userId, { kycId: kyc._id, riskLevel }).catch(() => {});
  res.json({
    success: true,
    kycId: kyc._id,
    riskLevel,
    status,
    checks
  });
});

exports.runAMLCheck = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const { kycData } = req.body;

  let checks, riskLevel;
  try {
    // Perform AML check
    ({ checks, riskLevel } = await performAMLCheck(kycData));

    // Update existing KYC or create new one — this is informational input for
    // a reviewer, not an approval trigger, and with no vendor configured it
    // records that screening did not run (see submitKYC for the same
    // reasoning); status is left untouched here so a real admin decision is
    // what changes it.
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
  const userId = req.user?._id || req.user?.id || req.user?.userId;
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
    // `verdict` is the field a client should branch on (handoff §6): `status`
    // here is this route's own record vocabulary, while a draft record, a
    // missing record and an unreviewed one all used to be told apart by reading
    // status + kycLevel + reviewedAt together and hoping they agreed. The
    // derivation lives in middleware/requireKyc.js, which is also the function
    // that decides whether a wallet may be linked — so the banner and the gate
    // cannot disagree about the same account. They would otherwise disagree
    // right here: an admin can approve an account by setting kycLevel without
    // a KYC document ever existing, and this branch's `status` has no record to
    // describe.
    return res.json({
      status: 'not_submitted',
      verdict: verdictForAccount(req.user, null),
    });
  }

  // decryptKycPii undoes the model's pre-save encryption of idNumber/
  // phoneNumber/address/city/postalCode — this is the user's own
  // submission, safe to return in full so a real "Profile" view can show
  // exactly what was submitted and what an admin has (or hasn't) verified.
  const decrypted = KYC.decryptKycPii(kyc);
  res.json({
    kycId: kyc._id,
    id: String(kyc._id),
    status: kyc.status,
    // 'draft' → not_submitted, 'review'/'pending' → pending, 'approved' →
    // verified, 'rejected' → rejected; kycLevel >= 2 overrides the document.
    verdict: verdictForAccount(req.user, kyc),
    riskLevel: kyc.riskLevel,
    amlChecks: kyc.amlChecks,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt || null,
    notes: kyc.notes || '',
    hasDocument: !!kyc.idDocumentUrl,
    hasFrontDocument: !!kyc.idFrontUrl,
    hasBackDocument: !!kyc.idBackUrl,
    personal: {
      // firstName/lastName/dateOfBirth/annualIncome are in models/kyc.js
      // ENCRYPTED_FIELDS, so on the hydrated document they are still
      // `v1:…` ciphertext — reading them off `kyc` handed the user their own
      // encrypted blob instead of their own name. Everything in that list
      // must come from `decrypted`; the fields the model leaves in plain
      // text (nationality, country, occupation, …) stay on `kyc`.
      firstName: decrypted.firstName,
      lastName: decrypted.lastName,
      dateOfBirth: decrypted.dateOfBirth,
      nationality: kyc.nationality,
    },
    address: {
      address: decrypted.address,
      city: decrypted.city,
      country: kyc.country,
      postalCode: decrypted.postalCode,
      phoneNumber: decrypted.phoneNumber,
    },
    identity: {
      idType: kyc.idType,
      idNumber: decrypted.idNumber,
      idExpiry: kyc.idExpiry,
    },
    financial: {
      occupation: kyc.occupation,
      sourceOfFunds: kyc.sourceOfFunds,
      annualIncome: decrypted.annualIncome,
      politicalExposure: kyc.politicalExposure,
    },
  });
});

/**
 * PATCH /api/kyc/draft — save partial KYC progress so the user can resume
 * after closing the browser. Only the fields present in req.body are
 * merged; everything else is left untouched. The draft is stored on the
 * user's most recent KYC record (created lazily if none exists yet) and
 * cleared automatically on successful submit.
 *
 * Body: { step: 'personal'|'address'|'identity'|'financial'|'review', data: { ... } }
 *
 * Returns: { ok: true, step, updatedAt }
 */
exports.saveDraft = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const { step, data } = req.body || {};
  const VALID_STEPS = ['personal', 'address', 'identity', 'financial', 'review'];
  if (!step || !VALID_STEPS.includes(step)) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, `step must be one of: ${VALID_STEPS.join(', ')}`, 400);
  }
  if (!data || typeof data !== 'object') {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'data must be an object', 400);
  }

  // Upsert a draft record — if the user has no KYC record yet (hasn't
  // submitted), create one with status 'draft' so we have somewhere to
  // attach the progress. If they already have a pending/approved/rejected
  // record, just update its draft field. Without $setOnInsert, a fresh
  // upsert would inherit the schema default status 'pending' and
  // submittedAt Date.now — making an in-progress user look like they had
  // already submitted (and tripping submitKYC's "already in progress"
  // guard against their own draft).
  const kyc = await KYC.findOneAndUpdate(
    { userId },
    {
      $set: {
        'draft.step': step,
        'draft.data': data,
        'draft.updatedAt': new Date(),
      },
      $setOnInsert: {
        status: 'draft',
        submittedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ ok: true, step: kyc.draft.step, updatedAt: kyc.draft.updatedAt });
});

/**
 * GET /api/kyc/draft — retrieve saved KYC draft progress. Returns null
 * fields if no draft exists, so the frontend can decide whether to start
 * fresh or resume.
 *
 * Returns: { ok: true, step, data, updatedAt } | { ok: true, step: null, data: null }
 */
exports.getDraft = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  const kyc = await KYC.findOne({ userId }).sort({ submittedAt: -1 });
  if (!kyc || !kyc.draft || !kyc.draft.step) {
    return res.json({ ok: true, step: null, data: null, updatedAt: null });
  }

  // Decrypt any PII fields that made it into the draft data — same set as
  // the main record, since the draft mirrors the submit shape.
  const decrypted = { ...kyc.draft.data };
  const ENCRYPTED_FIELDS = ['idNumber', 'phoneNumber', 'address', 'city', 'postalCode'];
  for (const field of ENCRYPTED_FIELDS) {
    if (decrypted[field] != null) {
      decrypted[field] = require('../utils/fieldEncryption').decryptField(decrypted[field]);
    }
  }

  res.json({ ok: true, step: kyc.draft.step, data: decrypted, updatedAt: kyc.draft.updatedAt });
});

/**
 * DELETE /api/kyc/draft — clear saved draft progress. Called after
 * successful submit so a completed user doesn't see a stale "resume"
 * prompt on next login.
 *
 * Returns: { ok: true }
 */
exports.clearDraft = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401);
  }

  await KYC.updateOne(
    { userId },
    { $unset: { draft: 1 } }
  );

  res.json({ ok: true });
});
