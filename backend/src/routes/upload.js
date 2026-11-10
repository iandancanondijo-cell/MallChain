const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const uploadCtrl = require('../controllers/uploadController');
const { limiters } = require('../middleware/rateLimiter');

/**
 * Upload Routes
 * Handles all file uploads across the platform:
 * - Avatars: user profile pictures
 * - Documents: ID verification, certificates
 * - Product Images: marketplace listings
 * - Course Materials: EDU platform resources
 * - Store Banners: shop branding
 */

// Ensure upload directories exist
const uploadDirs = {
  avatars: path.join(__dirname, '..', '..', 'uploads', 'avatars'),
  documents: path.join(__dirname, '..', '..', 'uploads', 'documents'),
  products: path.join(__dirname, '..', '..', 'uploads', 'products'),
  courses: path.join(__dirname, '..', '..', 'uploads', 'courses'),
  store: path.join(__dirname, '..', '..', 'uploads', 'store'),
};

Object.values(uploadDirs).forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// Utility function to sanitize filenames
function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
}

// ============================================================================
// MULTER STORAGE CONFIGURATIONS
// ============================================================================

// Avatar storage (profile pictures)
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirs.avatars),
  filename: (req, file, cb) => {
    const userId = req.user?._id || 'unknown';
    cb(null, `${userId}-${Date.now()}-${sanitizeFilename(file.originalname)}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      // Tagged so multerErrors() can answer 400 with this text instead of
      // letting errorHandler() mask it as a generic 500.
      return cb(Object.assign(
        new Error('Only JPG, PNG, or WebP files are accepted for avatars'),
        { code: 'UPLOAD_MIMETYPE' },
      ));
    }
    cb(null, true);
  },
});

// Product images storage
const productStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirs.products),
  filename: (req, file, cb) => {
    const userId = req.user?._id || 'unknown';
    cb(null, `${userId}-${Date.now()}-${sanitizeFilename(file.originalname)}`);
  },
});

const uploadProductImage = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or WebP files are accepted for product images'));
    }
    cb(null, true);
  },
});

// Store banner storage
const storeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirs.store),
  filename: (req, file, cb) => {
    const userId = req.user?._id || 'unknown';
    cb(null, `${userId}-${Date.now()}-${sanitizeFilename(file.originalname)}`);
  },
});

const uploadStoreBanner = multer({
  storage: storeStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or WebP files are accepted for banners'));
    }
    cb(null, true);
  },
});

// Multiple product images
const uploadProductImages = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or WebP files are accepted'));
    }
    cb(null, true);
  },
});

// ============================================================================
// ROUTES
// ============================================================================

// multer reports its own failures — a file over the size limit, a mimetype its
// fileFilter refused, an unexpected field — by handing an Error to next().
// utils/errorHandler.js masks any non-AppError as 500 'Internal server error'
// unless DEBUG_ERRORS is on, so a 6MB screenshot looked to the user exactly like
// a dead database, and the text multer already had was thrown away. These
// messages name nothing but the request's own limits, so translating them here
// restores the detail without widening what the global handler leaks. An error
// carrying none of these codes is a genuine internal failure and goes on
// untouched.
function multerErrors(label, maxMb) {
  return (err, _req, res, next) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `${label} must be ${maxMb}MB or smaller` });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'UPLOAD_MIMETYPE') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  };
}

/**
 * POST /api/upload/avatar
 * Upload user avatar
 * Authentication: Required
 */
router.post(
  '/avatar',
  auth,
  limiters.standard,
  uploadAvatar.single('file'),
  multerErrors('Avatar image', 2),
  uploadCtrl.uploadAvatar
);

/**
 * POST /api/upload/product
 * Upload single product image
 * Authentication: Required
 */
router.post(
  '/product',
  auth,
  limiters.standard,
  uploadProductImage.single('file'),
  uploadCtrl.uploadProductImage
);

/**
 * POST /api/upload/products
 * Upload multiple product images
 * Authentication: Required
 */
router.post(
  '/products',
  auth,
  limiters.standard,
  uploadProductImages.array('files', 10), // Max 10 images
  (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const urls = req.files.map(file => ({
        url: `/uploads/products/${file.filename}`,
        filename: file.filename,
        size: file.size,
      }));

      res.json({
        ok: true,
        files: urls,
        count: urls.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/upload/store-banner
 * Upload store banner/logo
 * Authentication: Required
 */
router.post(
  '/store-banner',
  auth,
  limiters.standard,
  uploadStoreBanner.single('file'),
  uploadCtrl.uploadStoreBanner
);

/**
 * GET /api/upload/config
 * Get upload configuration and limits
 * Authentication: Not required
 */
router.get('/config', uploadCtrl.getUploadConfig);

/**
 * POST /api/upload/validate
 * Validate file before upload (pre-check)
 * Authentication: Required
 */
router.post('/validate', auth, limiters.standard, uploadCtrl.validateFile);

/**
 * DELETE /api/upload/:fileId
 * Delete uploaded file
 * Authentication: Required
 */
router.delete('/:fileId', auth, uploadCtrl.deleteFile);

/**
 * GET /api/upload/file/:fileId
 * Get file by ID
 * Authentication: Required
 */
router.get('/file/:fileId', auth, uploadCtrl.getFile);

module.exports = router;
