/**
 * Wallet secret (PIN / Cipher Wall sequence) verification endpoints
 * POST /api/wallet/verify-pin - Verify the secret with rate limiting & lockout
 * Enforces server-side rate limiting for brute-force protection
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const PinAttempt = require('../models/PinAttempt');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { requireVerifiedKyc } = require('../middleware/requireKyc');

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

  // Input validation. The secret is either a legacy 4-8 digit PIN or a
  // Crypt Cipher Wall sequence (ordered glyphs: hieroglyphs, symbols,
  // digits, letters). Both are just strings bcrypt-compared against the
  // stored hash — the client decides which UX collects them. The 64-BYTE
  // UTF-8 ceiling matters because bcrypt only ever reads the first 72
  // bytes of the input; past that, client and server hashes could silently
  // derive from different content. Glyphs are 1-4 UTF-8 bytes each, so
  // this comfortably covers the 12-glyph maximum the wall enforces.
  if (pin.length < 4 || pin.length > 64 || /[\r\n]/.test(pin) || Buffer.byteLength(pin, 'utf8') > 64) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid secret format (4-64 characters)',
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
        code: 'no_pin_set',
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
 * POST /api/wallet/pin/set-pin
 * Upload (or replace) the bcrypt hash of the wallet PIN for this account.
 * The PIN itself never leaves the device — only its bcrypt hash, identical
 * to the one kept client-side in st.wallet.pinHash — so verify-pin can
 * enforce server-side rate limiting/lockout. Requires an authenticated
 * session; overwriting an existing hash is the legitimate "change PIN"
 * path (the client proves knowledge of nothing here — an attacker with a
 * hijacked session cookie already owns the account session).
 *
 * Body: { pinHash: string }  ($2a/$2b/$2y bcrypt, cost 04-15)
 *
 * requireVerifiedKyc({ allowExistingWallet }): setting a cipher is how a brand
 * new wallet becomes usable, so it belongs on the verified-identity side of the
 * rule — "no wallet before verification" is not honoured if an unverified
 * account can complete the creation flow here after /link-wallet refuses it.
 * The exception is for the owner of an address this account already holds: the
 * cipher wall disconnects the local copy after three wrong attempts, and that
 * person must be able to set a cipher again for the wallet that is already
 * theirs. This route carries no address, so the exception is "the account has
 * a linked wallet", not "this particular address".
 */
router.post('/set-pin', requireAuth, requireVerifiedKyc({ allowExistingWallet: true }), async (req, res) => {
  const { pinHash } = req.body || {};
  const userId = req.user._id || req.user.id;

  if (typeof pinHash !== 'string' || !/^\$2[aby]\$(0[4-9]|1[0-5])\$[./A-Za-z0-9]{53}$/.test(pinHash)) {
    return res.status(400).json({
      ok: false,
      error: 'pinHash must be a bcrypt hash of a 4-8 digit PIN',
    });
  }

  try {
    const User = require('../models/user');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user not found' });
    }

    user.wallet = user.wallet || {};
    user.wallet.pinHash = pinHash;
    user.markModified('wallet');
    await user.save();

    // A fresh PIN clears any stale lockout from wrong guesses on the old one.
    await PinAttempt.resetAttempts(userId).catch(() => {});

    logger.info('wallet', 'Wallet PIN hash stored', { userId, ip: req.ip });
    return res.json({ ok: true, hasPinSet: true });
  } catch (error) {
    logger.error('wallet', 'PIN set error', error, { userId });
    return res.status(500).json({ ok: false, error: 'Failed to store PIN' });
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
