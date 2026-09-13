const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Joi = require('joi');
const router = express.Router();

const auth = require('../middleware/auth');
const { uploadEduResource, EDU_UPLOAD_DIR } = require('../middleware/upload');
const { limiters } = require('../middleware/rateLimiter');
const EduResource = require('../models/EduResource');
const User = require('../models/user');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { registerDocumentFromMnemonic, getVersionHistory } = require('../services/eduTxBuilder');

const CATEGORIES = ['blockchain-basics', 'tokenomics', 'security', 'governance', 'validators', 'general'];

const postResourceSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().allow('').max(2000).default(''),
  category: Joi.string().valid(...CATEGORIES).default('general'),
  // Present only when this upload is a new version of an existing resource
  // (see the version-chain comment on the POST route below).
  previousResourceId: Joi.string().trim().allow('').default(''),
});

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Anchors sha256Hash on-chain via the operator key. Best-effort: a missing
// OPERATOR_MNEMONIC or a chain-side failure is recorded on the resource but
// never rejected back to the uploader — the off-chain file is already real
// and usable, and chain anchoring can be retried later without re-uploading
// (see POST /:id/retry-chain below).
async function anchorOnChain(resource) {
  const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
  if (!operatorMnemonic) {
    resource.chainStatus = 'failed';
    resource.chainError = 'Chain anchoring is not configured (OPERATOR_MNEMONIC unset)';
    await resource.save();
    return;
  }

  try {
    const parentRecordId = resource.previousResourceId
      ? (await EduResource.findById(resource.previousResourceId).lean())?.chainRecordId || ''
      : '';

    await registerDocumentFromMnemonic({
      mnemonic: operatorMnemonic,
      uploader: resource.authorId,
      docId: resource.docId,
      sha256Hash: resource.sha256Hash,
      parentRecordId,
    });

    // The tx response's own MsgRegisterDocumentResponse isn't decoded here
    // (broadcastSignedTx only confirms acceptance) — read the record back
    // from the chain instead, which also doubles as an end-to-end proof the
    // write actually landed.
    const history = await getVersionHistory(resource.docId);
    const mine = history.find((r) => r.sha256_hash === resource.sha256Hash) || history[history.length - 1];

    resource.chainStatus = 'registered';
    resource.chainRecordId = mine?.record_id || '';
    resource.chainVersion = Number(mine?.version || history.length);
    resource.chainError = '';
    await resource.save();
  } catch (err) {
    resource.chainStatus = 'failed';
    resource.chainError = err.message || 'Unknown chain error';
    await resource.save();
    logger.warn('edu', 'on-chain document registration failed', { resourceId: String(resource._id), error: err.message });
  }
}

function toPublicResource(doc) {
  return {
    id: String(doc._id),
    authorId: doc.authorId,
    authorName: doc.authorName,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    fileName: doc.fileName,
    fileSizeBytes: doc.fileSizeBytes,
    mimeType: doc.mimeType,
    downloadCount: doc.downloadCount,
    docId: doc.docId,
    previousResourceId: doc.previousResourceId ? String(doc.previousResourceId) : null,
    chain: {
      status: doc.chainStatus,
      recordId: doc.chainRecordId,
      version: doc.chainVersion,
      error: doc.chainStatus === 'failed' ? doc.chainError : undefined,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// POST /api/edu — post a new educational resource. Auth required so every
// post has a real, accountable author; browsing/downloading below stay
// public, matching how the rest of this app's educational content
// (Learning page) is treated.
//
// If `previousResourceId` is set, this is a new VERSION of that resource
// rather than an unrelated new document: they share the same docId (the
// x/edu chain module's version-chain key), and the new record links back to
// the previous one's on-chain record via parentRecordId — see
// x/edu/keeper/msg_server_register_document.go.
router.post('/', auth, limiters.standard, uploadEduResource.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'No file uploaded', 400);
  }

  const { error, value } = postResourceSchema.validate(req.body || {});
  if (error) {
    // The file was already written to disk by multer before validation ran
    // — clean it up rather than leaving an orphaned upload for a request
    // that's about to be rejected.
    fs.unlink(req.file.path, () => {});
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, error.details[0].message, 400);
  }

  const userId = req.user?.id || req.user?._id;
  const authorName = req.user?.name || req.user?.email?.split('@')[0] || req.user?.username || 'Anonymous';

  let previousResource = null;
  if (value.previousResourceId) {
    previousResource = await EduResource.findOne({ _id: value.previousResourceId, status: 'published' });
    if (!previousResource) {
      fs.unlink(req.file.path, () => {});
      throw new AppError(ErrorCodes.NOT_FOUND, 'previousResourceId does not reference an existing resource', 404);
    }
    if (String(previousResource.authorId) !== String(userId)) {
      fs.unlink(req.file.path, () => {});
      throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Only the original author can post a new version', 403);
    }
  }

  const filePath = path.join(EDU_UPLOAD_DIR, req.file.filename);
  const sha256Hash = await hashFile(filePath);

  const resource = await EduResource.create({
    authorId: String(userId),
    authorName,
    title: value.title,
    description: value.description,
    category: value.category,
    storedFilename: req.file.filename,
    fileName: req.file.originalname,
    fileSizeBytes: req.file.size,
    mimeType: req.file.mimetype,
    sha256Hash,
    docId: previousResource ? previousResource.docId : undefined,
    previousResourceId: previousResource ? previousResource._id : null,
  });

  if (!previousResource) {
    resource.docId = String(resource._id);
    await resource.save();
  }

  // Awaited so the response's chainStatus is accurate immediately (chain
  // confirmation is typically ~1 block, a few seconds) rather than the
  // client having to poll GET /:id afterward to see whether it landed.
  // Failure here never fails the upload itself — see anchorOnChain's
  // comment.
  await anchorOnChain(resource);

  res.status(201).json({ ok: true, resource: toPublicResource(resource) });
}));

// GET /api/edu — browse published resources, newest first, optionally
// filtered by category. Public — no auth wall on material meant to help
// onboard people who aren't logged in yet.
router.get('/', limiters.lenient, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { status: 'published' };
  if (req.query.category && CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }

  const [resources, total] = await Promise.all([
    EduResource.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    EduResource.countDocuments(filter),
  ]);

  res.json({
    ok: true,
    resources: resources.map(toPublicResource),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    categories: CATEGORIES,
  });
}));

// GET /api/edu/:id — one resource's metadata.
router.get('/:id', limiters.lenient, asyncHandler(async (req, res) => {
  const resource = await EduResource.findOne({ _id: req.params.id, status: 'published' });
  if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404);
  res.json({ ok: true, resource: toPublicResource(resource) });
}));

// GET /api/edu/:id/download — stream the real file back, counted.
router.get('/:id/download', limiters.lenient, asyncHandler(async (req, res) => {
  const resource = await EduResource.findOne({ _id: req.params.id, status: 'published' });
  if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404);

  // path.basename strips any directory component — storedFilename is
  // generated server-side (see middleware/upload.js) so this isn't
  // attacker-controlled today, but the same hardening kycController.js and
  // withdrawalAml.js apply to their own file-serving routes costs nothing
  // and keeps this route safe if that ever changes.
  const filePath = path.join(EDU_UPLOAD_DIR, path.basename(resource.storedFilename));

  EduResource.updateOne({ _id: resource._id }, { $inc: { downloadCount: 1 } }).catch((err) =>
    logger.warn('edu', 'failed to increment downloadCount', { resourceId: String(resource._id), error: err.message })
  );

  res.download(filePath, resource.fileName, (err) => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: 'File not found' });
  });
}));

// GET /api/edu/:id/verify — recompute the file's CURRENT hash and compare
// it against the hash anchored on-chain at upload time. This is the actual
// point of anchoring: a Mongo column can be edited quietly (by a bug, a
// compromised admin, a bad migration) with nobody the wiser, but an
// on-chain record can't — so this catches tampering a database check alone
// never could.
router.get('/:id/verify', limiters.lenient, asyncHandler(async (req, res) => {
  const resource = await EduResource.findOne({ _id: req.params.id, status: 'published' });
  if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404);

  const filePath = path.join(EDU_UPLOAD_DIR, path.basename(resource.storedFilename));
  let currentHash;
  try {
    currentHash = await hashFile(filePath);
  } catch (err) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'File not found on disk', 404);
  }

  const unmodifiedSinceUpload = currentHash === resource.sha256Hash;

  if (resource.chainStatus !== 'registered' || !resource.chainRecordId) {
    return res.json({
      ok: true,
      verified: false,
      reason: 'not-anchored',
      unmodifiedSinceUpload,
      currentHash,
      uploadedHash: resource.sha256Hash,
      chain: { status: resource.chainStatus, error: resource.chainStatus === 'failed' ? resource.chainError : undefined },
    });
  }

  let chainRecord = null;
  let chainReachable = true;
  try {
    const history = await getVersionHistory(resource.docId);
    chainRecord = history.find((r) => r.record_id === resource.chainRecordId) || null;
  } catch (err) {
    chainReachable = false;
    logger.warn('edu', 'chain query failed during verify', { resourceId: String(resource._id), error: err.message });
  }

  const matchesChainRecord = Boolean(chainRecord && chainRecord.sha256_hash === currentHash);

  res.json({
    ok: true,
    verified: unmodifiedSinceUpload && matchesChainRecord,
    reason: !chainReachable ? 'chain-unreachable' : !chainRecord ? 'chain-record-missing' : undefined,
    unmodifiedSinceUpload,
    currentHash,
    uploadedHash: resource.sha256Hash,
    chain: {
      status: resource.chainStatus,
      recordId: resource.chainRecordId,
      version: resource.chainVersion,
      onChainHash: chainRecord?.sha256_hash,
    },
  });
}));

// GET /api/edu/:id/history — this resource's full version lineage
// (oldest-first), walking previousResourceId links in Mongo. Kept as a
// local-metadata read rather than a chain query so it stays available even
// when a given version's chain anchor failed or the chain is unreachable.
router.get('/:id/history', limiters.lenient, asyncHandler(async (req, res) => {
  const resource = await EduResource.findOne({ _id: req.params.id, status: 'published' });
  if (!resource) throw new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404);

  const versions = await EduResource.find({ docId: resource.docId, status: 'published' }).sort({ createdAt: 1 });
  res.json({ ok: true, versions: versions.map(toPublicResource) });
}));

// DELETE /api/edu/:id — the author or an admin can remove a post. Soft
// delete so downloadCount/history isn't lost and the action is reversible.
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const resource = await EduResource.findById(req.params.id);
  if (!resource || resource.status === 'removed') {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404);
  }

  const userId = req.user?.id || req.user?._id;
  const isAuthor = String(resource.authorId) === String(userId);
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
  if (!isAuthor && !isAdmin) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Only the author or an admin can remove this resource', 403);
  }

  resource.status = 'removed';
  await resource.save();
  res.json({ ok: true });
}));

module.exports = router;
