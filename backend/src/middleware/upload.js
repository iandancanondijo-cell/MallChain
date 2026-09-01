const fs = require('fs');
const path = require('path');
const multer = require('multer');

const KYC_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'kyc');
fs.mkdirSync(KYC_UPLOAD_DIR, { recursive: true });

const AML_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'aml');
fs.mkdirSync(AML_UPLOAD_DIR, { recursive: true });

function sanitizeFilename(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const kycStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, KYC_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const userId = req.user?.id || req.user?._id || 'unknown';
    cb(null, `${userId}-${Date.now()}-${sanitizeFilename(file.originalname)}`);
  },
});

const uploadKycDocument = multer({
  storage: kycStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, or PDF files are accepted'));
    }
    cb(null, true);
  },
});

// Withdrawal-AML supporting documents (source-of-funds evidence) — same
// settings and `${userId}-...` filename/ownership convention as
// uploadKycDocument, kept in a separate directory since it's a distinct
// document category reviewed through a separate admin flow.
const amlStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AML_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const userId = req.user?.id || req.user?._id || 'unknown';
    cb(null, `${userId}-${Date.now()}-${sanitizeFilename(file.originalname)}`);
  },
});

const uploadAmlDocument = multer({
  storage: amlStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, or PDF files are accepted'));
    }
    cb(null, true);
  },
});

module.exports = { uploadKycDocument, KYC_UPLOAD_DIR, uploadAmlDocument, AML_UPLOAD_DIR };
