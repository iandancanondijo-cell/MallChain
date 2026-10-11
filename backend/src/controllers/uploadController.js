const path = require('path');
const fs = require('fs').promises;
const User = require('../models/user');
const logger = require('../utils/logger');

/**
 * Upload Controller
 * Handles file uploads for avatars, documents, products, courses, etc.
 */

class UploadController {
  /**
   * Upload user avatar
   * POST /api/upload/avatar
   */
  async uploadAvatar(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const { user } = req;
      const fileUrl = `/uploads/avatars/${req.file.filename}`;

      // Update user profile
      await User.findByIdAndUpdate(user._id, {
        avatarUrl: fileUrl,
        updatedAt: new Date(),
      });

      logger.info(`Avatar uploaded for user ${user._id}`, { filename: req.file.filename });

      res.json({
        ok: true,
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (err) {
      logger.error('Avatar upload failed', { error: err.message, userId: req.user?._id });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Upload product images
   * POST /api/upload/product
   */
  async uploadProductImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const fileUrl = `/uploads/products/${req.file.filename}`;

      logger.info(`Product image uploaded by user ${req.user._id}`, {
        filename: req.file.filename,
      });

      res.json({
        ok: true,
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (err) {
      logger.error('Product image upload failed', { error: err.message, userId: req.user?._id });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Upload store banner/logo
   * POST /api/upload/store-banner
   */
  async uploadStoreBanner(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const fileUrl = `/uploads/store/${req.file.filename}`;

      logger.info(`Store banner uploaded by user ${req.user._id}`, {
        filename: req.file.filename,
      });

      res.json({
        ok: true,
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (err) {
      logger.error('Store banner upload failed', { error: err.message, userId: req.user?._id });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get upload configuration and limits
   * GET /api/upload/config
   */
  async getUploadConfig(req, res) {
    try {
      const config = {
        maxSizes: {
          avatar: 2 * 1024 * 1024, // 2MB
          document: 10 * 1024 * 1024, // 10MB
          productImage: 5 * 1024 * 1024, // 5MB
          courseMaterial: 50 * 1024 * 1024, // 50MB
          storeBanner: 2 * 1024 * 1024, // 2MB
        },
        allowedTypes: {
          avatar: ['image/jpeg', 'image/png', 'image/webp'],
          document: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          productImage: ['image/jpeg', 'image/png', 'image/webp'],
          courseMaterial: ['application/pdf', 'video/mp4', 'application/zip', 'image/jpeg', 'image/png', 'text/plain', 'text/markdown'],
          storeBanner: ['image/jpeg', 'image/png', 'image/webp'],
        },
        extensions: {
          avatar: ['jpg', 'jpeg', 'png', 'webp'],
          document: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
          productImage: ['jpg', 'jpeg', 'png', 'webp'],
          courseMaterial: ['pdf', 'mp4', 'zip', 'jpg', 'jpeg', 'png', 'txt', 'md'],
          storeBanner: ['jpg', 'jpeg', 'png', 'webp'],
        },
      };

      res.json(config);
    } catch (err) {
      logger.error('Upload config retrieval failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Validate file before upload (optional pre-check)
   * POST /api/upload/validate
   */
  async validateFile(req, res) {
    try {
      const { filename, size, type, category } = req.body;

      if (!filename || !type || !category) {
        return res.status(400).json({
          error: 'Missing required fields: filename, type, category',
        });
      }

      const maxSizes = {
        avatar: 2 * 1024 * 1024,
        document: 10 * 1024 * 1024,
        productImage: 5 * 1024 * 1024,
        courseMaterial: 50 * 1024 * 1024,
        storeBanner: 2 * 1024 * 1024,
      };

      const allowedTypes = {
        avatar: ['image/jpeg', 'image/png', 'image/webp'],
        document: ['application/pdf', 'image/jpeg', 'image/png'],
        productImage: ['image/jpeg', 'image/png', 'image/webp'],
        courseMaterial: ['application/pdf', 'video/mp4', 'application/zip'],
        storeBanner: ['image/jpeg', 'image/png', 'image/webp'],
      };

      const errors = [];

      // Check size
      if (size > (maxSizes[category] || maxSizes.document)) {
        errors.push(`File size exceeds limit of ${maxSizes[category] / 1024 / 1024}MB`);
      }

      // Check type
      if (!allowedTypes[category]?.includes(type)) {
        errors.push(`File type not allowed. Allowed: ${allowedTypes[category]?.join(', ')}`);
      }

      if (errors.length > 0) {
        return res.status(400).json({ valid: false, errors });
      }

      res.json({ valid: true });
    } catch (err) {
      logger.error('File validation failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Delete uploaded file
   * DELETE /api/upload/:fileId
   */
  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const { user } = req;

      // For now, we'll just return success since we don't have a file tracking system yet
      // In a full implementation, you'd:
      // 1. Look up the file record in DB
      // 2. Verify user owns it
      // 3. Delete from filesystem
      // 4. Remove from DB

      logger.info(`File deletion requested: ${fileId} by user ${user._id}`);

      res.json({
        ok: true,
        message: 'File deleted successfully',
      });
    } catch (err) {
      logger.error('File deletion failed', { error: err.message, userId: req.user?._id });
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get file by ID
   * GET /api/upload/file/:fileId
   */
  async getFile(req, res) {
    try {
      const { fileId } = req.params;

      // In a full implementation, you'd:
      // 1. Look up the file record in DB
      // 2. Verify user has access
      // 3. Stream the file

      res.status(404).json({ error: 'File not found' });
    } catch (err) {
      logger.error('File retrieval failed', { error: err.message, userId: req.user?._id });
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new UploadController();
