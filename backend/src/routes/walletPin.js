/**
 * Wallet PIN verification endpoints
 * POST /api/wallet/verify-pin - Verify PIN with rate limiting & lockout
 * Enforces server-side rate limiting for brute-force protection
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const PinAttempt = require('../models/PinAttempt');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/wallet/verify-pin
 * Verify PIN against user's stored hash with rate limiting
 * 
 * Body: { pin: string }
 * Response: { valid: bool, locked: bool, remainingTime?: number, attemptInfo?: object }
 */
router.post('/verify-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  const userId = req.user._id || req.user.id;
  const ipAddress = req.ip;

  // Input validation
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'PIN is required',
    });
  }

  if (!/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid PIN format (4-8 digits)',
    });
  }

  try {
    // Check if user is locked out
    const isLocked = await PinAttempt.isLocked(userId);
    if (isLocked) {
      const doc = await PinAttempt.findOne({ userId });
      const remainingSeconds = doc.lockedUntil ? Math.ceil((doc.lockedUntil - Date.now()) / 1000) : 0;

      logger.warn('wallet', 'PIN verification attempted while locked', {
        userId,
        ipAddress,
        remainingSeconds,
      });

      return res.status(429).json({
        ok: false,
        error: 'Too many failed attempts. Try again later.',
        valid: false,
        locked: true,
        remainingTime: remainingSeconds,
      });
    }

    // Get user's wallet info
    const User = require('../models/user');
    const user = await User.findById(userId).select('+wallet.pinHash').lean();

    if (!user || !user.wallet || !user.wallet.pinHash) {
      return res.status(400).json({
        ok: false,
        error: 'No PIN set for this wallet. Use wallet setup to configure a PIN.',
      });
    }

    // Verify PIN against hash
    let isValid = false;
    try {
      isValid = await bcrypt.compare(pin, user.wallet.pinHash);
    } catch (err) {
      logger.error('wallet', 'bcrypt comparison failed', err, { userId });
      return res.status(500).json({
        ok: false,
        error: 'PIN verification failed',
      });
    }

    if (isValid) {
      // Success: reset attempts
      await PinAttempt.resetAttempts(userId);

      logger.info('wallet', 'PIN verified successfully', {
        userId,
        ipAddress,
      });

      return res.json({
        ok: true,
        valid: true,
        locked: false,
      });
    }

    // Failed: record attempt
    const result = await PinAttempt.recordFailedAttempt(userId);

    logger.warn('wallet', 'PIN verification failed', {
      userId,
      ipAddress,
      attempts: result.attempts,
      locked: result.locked,
    });

    const attemptsRemaining = 3 - result.attempts;

    return res.status(401).json({
      ok: false,
      error: result.locked ? 'Too many failed attempts. Account locked for 5 minutes.' : 'Incorrect PIN',
      valid: false,
      locked: result.locked,
      remainingTime: result.remainingSeconds,
      attemptsRemaining: result.locked ? 0 : Math.max(0, attemptsRemaining),
    });
  } catch (error) {
    logger.error('wallet', 'PIN verification error', error, { userId });
    return res.status(500).json({
      ok: false,
      error: 'PIN verification failed. Please try again.',
    });
  }
});

/**
 * GET /api/wallet/pin-status
 * Check if user has PIN set and current lockout status (if any)
 */
router.get('/pin-status', requireAuth, async (req, res) => {
  const userId = req.user._id || req.user.id;

  try {
    const User = require('../models/user');
    const user = await User.findById(userId).select('+wallet.pinHash').lean();
    const hasPinSet = !!(user && user.wallet && user.wallet.pinHash);

    const isLocked = await PinAttempt.isLocked(userId);
    let lockStatus = null;
    
    if (isLocked) {
      const doc = await PinAttempt.findOne({ userId });
      lockStatus = {
        locked: true,
        remainingSeconds: Math.ceil((doc.lockedUntil - Date.now()) / 1000),
      };
    }

    return res.json({
      ok: true,
      hasPinSet,
      locked: !!lockStatus,
      lockStatus,
    });
  } catch (error) {
    logger.error('wallet', 'PIN status check error', error, { userId });
    return res.status(500).json({
      ok: false,
      error: 'Failed to check PIN status',
    });
  }
});

module.exports = router;
