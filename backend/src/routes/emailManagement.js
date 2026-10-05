const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const EmailVerification = require('../models/emailVerification');
const User = require('../models/user');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Middleware: require JWT auth for all routes
router.use(requireAuth());

/**
 * Helper: Hash verification code for secure storage
 */
function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Helper: Generate a random verification code
 */
function generateVerificationCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Helper: Send verification email (stub - integrate with email service)
 */
async function sendVerificationEmail(email, code, isNewEmail = true) {
  // TODO: Integrate with email service (SendGrid, Mailgun, etc)
  // For now, just log it
  logger.info('emailManagement', `Verification email would be sent to ${email}`, { code: code.substring(0, 8) + '...' });
  return true;
}

/**
 * GET /api/email-management/status
 * Get current email and verification status
 */
router.get('/status', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('email');
    
    // Check for pending email changes
    const pendingChange = await EmailVerification.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'current-verified', 'new-verified'] },
    }).lean();

    res.json({
      currentEmail: user?.email || null,
      hasPendingChange: !!pendingChange,
      pendingChange: pendingChange
        ? {
            newEmail: pendingChange.newEmail,
            status: pendingChange.status,
            createdAt: pendingChange.createdAt,
            expiresAt: pendingChange.expiresAt,
          }
        : null,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to get email status', error);
    res.status(500).json({ error: 'Failed to get email status' });
  }
});

/**
 * POST /api/email-management/verify-signup
 * Verify email code during signup (before full change flow)
 * Used by EnhancedRegistrationFlow to verify email after account creation
 */
router.post('/verify-signup', async (req, res) => {
  try {
    const userId = req.user._id;
    const { code } = req.body;

    if (!code || code.length < 6) {
      return res.status(400).json({ error: 'Valid verification code required' });
    }

    // For signup, we just verify that the code matches
    // In a real implementation, you would:
    // 1. Look up the verification record for this user
    // 2. Check if the code matches
    // 3. Mark email as verified
    // 4. Allow user to proceed

    // Simplified version: accept any 6-digit code during signup
    // TODO: Implement full verification flow with actual code storage
    
    // For now, just mark as verified
    await User.findByIdAndUpdate(userId, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    logger.info('emailManagement', 'Signup email verified', {
      userId: userId.toString(),
    });

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify signup email', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * POST /api/email-management/change-email
 * Initiate email change request
 */
router.post('/change-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Normalize email
    const normalizedNewEmail = newEmail.toLowerCase().trim();

    // Check if new email already in use
    const existingUser = await User.findOne({ email: normalizedNewEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Cancel any existing pending changes
    await EmailVerification.deleteMany({
      userId,
      status: { $in: ['pending', 'current-verified', 'new-verified'] },
    });

    // Get current user email
    const user = await User.findById(userId).select('email');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashCode(verificationCode);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    // Create verification record
    const verification = new EmailVerification({
      userId,
      currentEmail: user.email,
      newEmail: normalizedNewEmail,
      verificationCode,
      verificationCodeHash,
      verificationCodeExpiry: expiresAt,
      status: 'pending',
      expiresAt,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    await verification.save();

    // Send verification emails
    await sendVerificationEmail(user.email, verificationCode, false); // Current email
    await sendVerificationEmail(normalizedNewEmail, verificationCode, true); // New email

    logger.info('emailManagement', 'Email change initiated', {
      userId: userId.toString(),
      fromEmail: user.email,
      toEmail: normalizedNewEmail,
    });

    res.json({
      success: true,
      message: 'Verification emails sent',
      verificationId: verification._id,
      expiresAt,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to initiate email change', error);
    res.status(500).json({ error: 'Failed to initiate email change' });
  }
});

/**
 * POST /api/email-management/verify-email
 * Verify current email during change process
 */
router.post('/verify-current-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { verificationCode } = req.body;

    if (!verificationCode) {
      return res.status(400).json({ error: 'Verification code required' });
    }

    const verification = await EmailVerification.findOne({
      userId,
      status: 'pending',
    });

    if (!verification) {
      return res.status(404).json({ error: 'No pending email change found' });
    }

    if (verification.verificationCodeExpiry < new Date()) {
      await verification.deleteOne();
      return res.status(410).json({ error: 'Verification code expired' });
    }

    // Check attempt limit
    if (verification.attempts.currentEmailAttempts >= 5) {
      await verification.deleteOne();
      return res.status(429).json({ error: 'Too many verification attempts' });
    }

    const codeHash = hashCode(verificationCode);
    if (codeHash !== verification.verificationCodeHash) {
      verification.attempts.currentEmailAttempts += 1;
      await verification.save();
      return res.status(401).json({
        error: 'Invalid verification code',
        attemptsRemaining: 5 - verification.attempts.currentEmailAttempts,
      });
    }

    // Mark current email as verified
    verification.currentEmailVerifiedAt = new Date();
    verification.status = 'current-verified';
    await verification.save();

    logger.info('emailManagement', 'Current email verified', {
      userId: userId.toString(),
      email: verification.currentEmail,
    });

    res.json({
      success: true,
      message: 'Current email verified',
      nextStep: 'Verify new email to complete change',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify current email', error);
    res.status(500).json({ error: 'Failed to verify current email' });
  }
});

/**
 * POST /api/email-management/verify-new-email
 * Verify new email during change process
 */
router.post('/verify-new-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { verificationCode } = req.body;

    if (!verificationCode) {
      return res.status(400).json({ error: 'Verification code required' });
    }

    const verification = await EmailVerification.findOne({
      userId,
      status: { $in: ['pending', 'current-verified'] },
    });

    if (!verification) {
      return res.status(404).json({ error: 'No pending email change found' });
    }

    if (verification.verificationCodeExpiry < new Date()) {
      await verification.deleteOne();
      return res.status(410).json({ error: 'Verification code expired' });
    }

    // Check attempt limit
    if (verification.attempts.newEmailAttempts >= 5) {
      await verification.deleteOne();
      return res.status(429).json({ error: 'Too many verification attempts' });
    }

    const codeHash = hashCode(verificationCode);
    if (codeHash !== verification.verificationCodeHash) {
      verification.attempts.newEmailAttempts += 1;
      await verification.save();
      return res.status(401).json({
        error: 'Invalid verification code',
        attemptsRemaining: 5 - verification.attempts.newEmailAttempts,
      });
    }

    // Mark new email as verified
    verification.newEmailVerifiedAt = new Date();
    verification.status = 'new-verified';
    await verification.save();

    logger.info('emailManagement', 'New email verified', {
      userId: userId.toString(),
      email: verification.newEmail,
    });

    res.json({
      success: true,
      message: 'New email verified',
      nextStep: 'Complete email change process',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify new email', error);
    res.status(500).json({ error: 'Failed to verify new email' });
  }
});

/**
 * POST /api/email-management/complete-change
 * Complete the email change (both emails verified)
 */
router.post('/complete-change', async (req, res) => {
  try {
    const userId = req.user._id;

    const verification = await EmailVerification.findOne({
      userId,
      status: 'new-verified',
    });

    if (!verification) {
      return res.status(404).json({ error: 'Email change not ready to complete' });
    }

    // Update user email
    await User.findByIdAndUpdate(userId, {
      email: verification.newEmail,
    });

    // Mark verification as completed
    verification.status = 'completed';
    verification.completedAt = new Date();
    await verification.save();

    logger.info('emailManagement', 'Email change completed', {
      userId: userId.toString(),
      oldEmail: verification.currentEmail,
      newEmail: verification.newEmail,
    });

    res.json({
      success: true,
      message: 'Email successfully changed',
      newEmail: verification.newEmail,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to complete email change', error);
    res.status(500).json({ error: 'Failed to complete email change' });
  }
});

/**
 * POST /api/email-management/cancel-change
 * Cancel a pending email change
 */
router.post('/cancel-change', async (req, res) => {
  try {
    const userId = req.user._id;

    const verification = await EmailVerification.findOne({
      userId,
      status: { $in: ['pending', 'current-verified', 'new-verified'] },
    });

    if (!verification) {
      return res.status(404).json({ error: 'No pending email change to cancel' });
    }

    verification.status = 'rejected';
    await verification.save();

    logger.info('emailManagement', 'Email change cancelled', {
      userId: userId.toString(),
      newEmail: verification.newEmail,
    });

    res.json({
      success: true,
      message: 'Email change cancelled',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to cancel email change', error);
    res.status(500).json({ error: 'Failed to cancel email change' });
  }
});

/**
 * POST /api/email-management/set-backup-email
 * Set backup email for account recovery
 */
router.post('/set-backup-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { backupEmail } = req.body;

    if (!backupEmail || !backupEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const normalizedBackupEmail = backupEmail.toLowerCase().trim();

    // Check if backup email same as current
    const user = await User.findById(userId).select('email');
    if (normalizedBackupEmail === user.email) {
      return res.status(400).json({ error: 'Backup email cannot be same as primary email' });
    }

    // Create verification for backup email
    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashCode(verificationCode);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const verification = new EmailVerification({
      userId,
      currentEmail: user.email,
      newEmail: normalizedBackupEmail,
      verificationCode,
      verificationCodeHash,
      verificationCodeExpiry: expiresAt,
      status: 'pending',
      expiresAt,
      isBackupEmail: true,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    await verification.save();

    // Send verification email
    await sendVerificationEmail(normalizedBackupEmail, verificationCode, true);

    logger.info('emailManagement', 'Backup email setup initiated', {
      userId: userId.toString(),
      backupEmail: normalizedBackupEmail,
    });

    res.json({
      success: true,
      message: 'Verification email sent',
      verificationId: verification._id,
      expiresAt,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to set backup email', error);
    res.status(500).json({ error: 'Failed to set backup email' });
  }
});

/**
 * GET /api/email-management/recovery-options
 * Get available account recovery options
 */
router.get('/recovery-options', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('email backupEmail')
      .lean();

    res.json({
      primaryEmail: user?.email || null,
      backupEmail: user?.backupEmail || null,
      recoveryMethods: [
        { method: 'email', available: !!user?.email, description: 'Recovery code sent to email' },
        {
          method: 'backup_email',
          available: !!user?.backupEmail,
          description: 'Recovery code sent to backup email',
        },
        { method: 'security_question', available: false, description: 'Coming soon' },
      ],
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to get recovery options', error);
    res.status(500).json({ error: 'Failed to get recovery options' });
  }
});

module.exports = router;
