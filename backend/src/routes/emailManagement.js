const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const EmailVerification = require('../models/emailVerification');
const UserSettings = require('../models/UserSettings');
const User = require('../models/user');
const logger = require('../utils/logger');
const crypto = require('crypto');
const brevoService = require('../services/brevoService');
const { blindIndex, encryptField, decryptField } = require('../utils/fieldEncryption');
const { createUserLimiter } = require('../middleware/rateLimiter');

// Middleware: require JWT auth for all routes
router.use(requireAuth());

const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// A 6-digit code has a million values. The per-challenge counter stops five
// guesses on one challenge, but nothing stopped a caller from asking for fresh
// challenges over and over — or from spraying codes at somebody else's inbox.
// Keyed by account, so one person behind a shared NAT does not lock out the
// others and one account cannot use the service as a mail cannon.
const issueCodeLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const answerCodeLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, max: 15 });

// Registering the limiters as their own routes puts them ahead of every
// handler below: five code deliveries per quarter-hour, fifteen answers.
router.post(['/send-signup-code', '/change-email', '/set-backup-email'], issueCodeLimiter);
router.post(['/verify-signup', '/verify-current-email', '/verify-new-email', '/verify-backup-email'], answerCodeLimiter);

/** Error payload shape this whole router shares: `error` is what the SPA toasts
 *  (api.ts reads a flat string), `details.code` is what a caller branches on,
 *  and `details.attemptsRemaining` lets the UI count down without a second round trip. */
function refuse(res, status, code, message, details = {}) {
  return res.status(status).json({ error: message, details: { code, ...details } });
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  // crypto.randomInt, not Math.random: Math.random's state is predictable from
  // other output in the process, and this value is the only thing standing
  // between an attacker and a verified email address.
  return String(crypto.randomInt(100000, 1000000));
}

function codesMatch(candidate, storedHash) {
  if (!storedHash || typeof candidate !== 'string') return false;
  const a = Buffer.from(hashCode(candidate), 'hex');
  let b;
  try {
    b = Buffer.from(String(storedHash), 'hex');
  } catch (e) {
    return false;
  }
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '—';
  const at = email.indexOf('@');
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = name.slice(0, Math.min(2, Math.max(1, name.length - 1)));
  return `${shown}${'•'.repeat(Math.max(1, name.length - shown.length))}@${domain}`;
}

const EMAIL_COPY = {
  signup: {
    subject: 'Verify your email for Mallchain',
    heading: 'Verify Your Email',
    intro: 'Confirm this address to finish setting up your Mallchain account.',
  },
  current: {
    subject: 'Confirm your email change on Mallchain',
    heading: 'Confirm Email Change',
    intro: 'A request was made to change the email on your Mallchain account. Confirm this address to approve it.',
  },
  new: {
    subject: 'Verify your new email for Mallchain',
    heading: 'Verify Your New Email',
    intro: 'A request was made to use this address on your Mallchain account.',
  },
  backup: {
    subject: 'Verify your backup email for Mallchain',
    heading: 'Verify Your Backup Email',
    intro: 'This address is being added as a recovery option for your Mallchain account.',
  },
};

/**
 * Sends a code and reports the truth about whether it left the building.
 *
 * brevoService.sendEmail never throws — with no BREVO_API_KEY it returns
 * {success:false}. Every caller here used to ignore that and answer "emails
 * sent", so a signup looked verified-ready, and an email change looked
 * underway, while nobody had received anything. Returning the boolean is the
 * whole point of this helper: the routes act on it.
 */
async function deliverCode(email, code, kind) {
  const copy = EMAIL_COPY[kind];
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #06b6d4;">${copy.heading}</h2>
      <p>${copy.intro}</p>
      <p>Your verification code:</p>
      <div style="background: #f0f9ff; border: 1px solid #06b6d4; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
        <code style="font-size: 22px; letter-spacing: 4px; color: #0e7490;">${code}</code>
      </div>
      <p style="color: #666; font-size: 13px;">This code expires in 24 hours and works only once. If you didn't request it, you can safely ignore this email.</p>
    </div>
  `;

  const result = await brevoService.sendEmail(email, copy.subject, html);
  const delivered = !!(result && result.success);
  if (!delivered) {
    logger.warn('emailManagement', 'verification code was not delivered', {
      recipient: maskEmail(email),
      kind,
      reason: (result && result.error) || 'unknown',
    });
  }
  return delivered;
}

/** The newest live challenge for one purpose. Hashes are opted back in here and
 *  nowhere else — no route serialises a document that came from this query. */
function findChallenge(userId, purpose, statuses) {
  return EmailVerification.findOne({ userId, purpose, status: { $in: statuses } })
    .select('+currentCodeHash +newCodeHash')
    .sort('-createdAt')
    .lean();
}

/** Retire a purpose's outstanding challenges so a stale code cannot be used. */
function withdraw(userId, purpose, statuses) {
  return EmailVerification.updateMany(
    { userId, purpose, status: { $in: statuses } },
    { $set: { status: 'expired' } }
  );
}

/**
 * The one check every verify route runs, so an expired or exhausted challenge
 * cannot be answered and a wrong guess is counted the same way everywhere.
 * Returns null when the answer is good enough to keep going.
 */
async function checkAttempt(req, res, challenge, hashField, attemptField) {
  if (!challenge) {
    refuse(res, 404, 'no_pending_verification', 'No verification is pending. Request a new code.');
    return false;
  }
  if (new Date(challenge.codeExpiry).getTime() < Date.now()) {
    await EmailVerification.updateOne({ _id: challenge._id }, { $set: { status: 'expired' } });
    refuse(res, 410, 'code_expired', 'This code has expired. Request a new one.');
    return false;
  }
  const attempts = Number(challenge.attempts?.[attemptField]) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    await EmailVerification.updateOne({ _id: challenge._id }, { $set: { status: 'expired' } });
    refuse(res, 429, 'too_many_attempts', 'Too many incorrect attempts. Request a new code.');
    return false;
  }
  return true;
}

/** Records a wrong guess; the fifth one retires the challenge outright. */
async function burnAttempt(challenge, attemptField, res) {
  const next = (Number(challenge.attempts?.[attemptField]) || 0) + 1;
  const exhausted = next >= MAX_ATTEMPTS;
  await EmailVerification.updateOne(
    { _id: challenge._id },
    exhausted ? { $set: { status: 'expired' } } : { $inc: { [`attempts.${attemptField}`]: 1 } }
  );
  return refuse(
    res,
    exhausted ? 429 : 401,
    exhausted ? 'too_many_attempts' : 'invalid_code',
    exhausted
      ? 'Too many incorrect attempts. Request a new code.'
      : 'That code is not correct.',
    { attemptsRemaining: Math.max(0, MAX_ATTEMPTS - next) }
  );
}

/**
 * GET /api/email-management/status
 * Current address, whether it is proven, and any live challenge for either
 * purpose. The pending backup is returned separately: it is a different
 * promise than a pending change, and the UI needs to know which one it is on.
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user._id;
    const [rawUser, settings, pendingChange, pendingBackup] = await Promise.all([
      User.findById(userId).select('email').lean(),
      UserSettings.findOne({ userId }).lean(),
      EmailVerification.findOne({
        userId,
        purpose: 'change',
        status: { $in: ['pending', 'current-verified', 'new-verified'] },
      }).sort('-createdAt').lean(),
      EmailVerification.findOne({ userId, purpose: 'backup', status: 'pending' })
        .sort('-createdAt').lean(),
    ]);

    const currentEmail = rawUser ? User.decryptUserPii(rawUser).email : null;
    const contact = settings?.contactInfo || {};
    const storedBackup = contact.backupEmail ? decryptField(contact.backupEmail) : null;

    res.json({
      currentEmail,
      emailVerified: !!contact.emailVerified,
      emailVerifiedAt: contact.emailVerifiedAt || null,
      backupEmail: storedBackup,
      backupEmailVerifiedAt: contact.backupEmailVerifiedAt || null,
      hasPendingChange: !!pendingChange,
      pendingChange: pendingChange
        ? {
            newEmail: pendingChange.newEmail,
            status: pendingChange.status,
            currentVerified: !!pendingChange.currentEmailVerifiedAt,
            newVerified: !!pendingChange.newEmailVerifiedAt,
            createdAt: pendingChange.createdAt,
            expiresAt: pendingChange.codeExpiry,
          }
        : null,
      pendingBackupEmail: pendingBackup ? pendingBackup.newEmail : null,
      pendingBackupExpiresAt: pendingBackup ? pendingBackup.codeExpiry : null,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to get email status', error);
    refuse(res, 500, 'status_unavailable', 'Failed to get email status');
  }
});

/**
 * POST /api/email-management/send-signup-code
 * Issue the code that EnhancedRegistrationFlow asks for at its email step.
 *
 * This endpoint did not exist. The wizard collected a code, posted it to
 * /verify-signup, and that route accepted anything six characters or longer —
 * so there was nothing to send. An address is now proven by answering a code
 * this server actually delivered.
 */
router.post('/send-signup-code', async (req, res) => {
  try {
    const userId = req.user._id;

    const settings = await UserSettings.findOne({ userId }).lean();
    if (settings?.contactInfo?.emailVerified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'This email is already verified',
      });
    }

    const rawUser = await User.findById(userId).select('email').lean();
    if (!rawUser) return refuse(res, 404, 'user_not_found', 'User not found');
    const email = User.decryptUserPii(rawUser).email;
    if (!email) return refuse(res, 400, 'no_email_on_account', 'This account has no email address to verify');

    const code = generateCode();
    await withdraw(userId, 'signup', ['pending', 'new-verified']);

    const challenge = new EmailVerification({
      userId,
      purpose: 'signup',
      currentEmail: email,
      newEmail: email,
      newCodeHash: hashCode(code),
      codeExpiry: new Date(Date.now() + CODE_TTL_MS),
      status: 'pending',
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    const delivered = await deliverCode(email, code, 'signup');
    if (!delivered) {
      return refuse(
        res,
        503,
        'email_delivery_unavailable',
        'We could not send the verification code right now. Please try again shortly.'
      );
    }
    await challenge.save();

    logger.info('emailManagement', 'Signup verification code sent', {
      userId: userId.toString(),
      email: maskEmail(email),
    });

    res.json({
      success: true,
      sentTo: maskEmail(email),
      expiresAt: challenge.codeExpiry,
      message: 'Verification code sent',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to send signup code', error);
    refuse(res, 500, 'send_failed', 'Failed to send the verification code');
  }
});

/**
 * POST /api/email-management/verify-signup
 * Prove the account's own address by answering the code /send-signup-code delivered.
 */
router.post('/verify-signup', async (req, res) => {
  try {
    const userId = req.user._id;
    const { code } = req.body;

    if (!/^\d{6}$/.test(String(code || ''))) {
      return refuse(res, 400, 'code_format', 'Enter the 6-digit code from your email');
    }

    const challenge = await findChallenge(userId, 'signup', ['pending']);
    if (!(await checkAttempt(req, res, challenge, 'newCodeHash', 'newEmailAttempts'))) return;

    if (!codesMatch(code, challenge.newCodeHash)) {
      return await burnAttempt(challenge, 'newEmailAttempts', res);
    }

    await EmailVerification.updateOne(
      { _id: challenge._id },
      { $set: { status: 'completed', newEmailVerifiedAt: new Date(), completedAt: new Date() } }
    );

    // The flag lives on UserSettings. It used to be written with
    // User.findByIdAndUpdate({emailVerified:true}) — a path models/user.js
    // never defined, so strict mode dropped it: the write silently did nothing.
    await UserSettings.updateOne(
      { userId },
      { $set: { 'contactInfo.emailVerified': true, 'contactInfo.emailVerifiedAt': new Date() } },
      { upsert: true }
    );

    logger.info('emailManagement', 'Signup email verified', {
      userId: userId.toString(),
      email: maskEmail(challenge.newEmail),
    });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify signup email', error);
    refuse(res, 500, 'verify_failed', 'Failed to verify email');
  }
});

/**
 * POST /api/email-management/change-email
 * Start a two-address change: one code to the current address, a different one
 * to the new address.
 *
 * The same code used to go to both, which made "prove you own the old address"
 * and "prove you own the new one" a single factor — anyone holding either
 * inbox could complete the whole change. Separate secrets, separate steps.
 */
router.post('/change-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes('@')) {
      return refuse(res, 400, 'email_format', 'Valid email required');
    }

    const normalizedNewEmail = newEmail.toLowerCase().trim();

    const existingUser = await User.findOne({ email_blind: blindIndex(normalizedNewEmail) });
    if (existingUser && String(existingUser._id) !== String(userId)) {
      return refuse(res, 409, 'email_in_use', 'Email already in use');
    }

    const rawUser = await User.findById(userId).select('email').lean();
    if (!rawUser) return refuse(res, 404, 'user_not_found', 'User not found');
    const currentEmail = User.decryptUserPii(rawUser).email;

    if (normalizedNewEmail === String(currentEmail).toLowerCase()) {
      return refuse(res, 400, 'same_email', 'The new address is the same as your current one');
    }

    await withdraw(userId, 'change', ['pending', 'current-verified', 'new-verified']);

    const currentCode = generateCode();
    const newCode = generateCode();
    const expiry = new Date(Date.now() + CODE_TTL_MS);

    const challenge = new EmailVerification({
      userId,
      purpose: 'change',
      currentEmail,
      newEmail: normalizedNewEmail,
      currentCodeHash: hashCode(currentCode),
      newCodeHash: hashCode(newCode),
      codeExpiry: expiry,
      status: 'pending',
      expiresAt: expiry,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    const [toCurrent, toNew] = await Promise.all([
      deliverCode(currentEmail, currentCode, 'current'),
      deliverCode(normalizedNewEmail, newCode, 'new'),
    ]);

    if (!toCurrent || !toNew) {
      // No record, no half-started change: the person cannot answer a code
      // that never arrived, and the panel should not show a pending change
      // that only exists in the database.
      return refuse(
        res,
        503,
        'email_delivery_unavailable',
        'We could not reach one of the two addresses, so the change was not started. Please check both addresses and try again.'
      );
    }

    await challenge.save();

    logger.info('emailManagement', 'Email change initiated', {
      userId: userId.toString(),
      fromEmail: maskEmail(currentEmail),
      toEmail: maskEmail(normalizedNewEmail),
    });

    res.json({
      success: true,
      message: 'A different code was sent to each address',
      verificationId: challenge._id,
      expiresAt: expiry,
      requiresCurrentFirst: true,
      sentTo: { current: maskEmail(currentEmail), new: maskEmail(normalizedNewEmail) },
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to initiate email change', error);
    refuse(res, 500, 'change_start_failed', 'Failed to initiate email change');
  }
});

/**
 * POST /api/email-management/verify-current-email — step 1 of a change.
 */
router.post('/verify-current-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { verificationCode } = req.body;

    if (!/^\d{6}$/.test(String(verificationCode || ''))) {
      return refuse(res, 400, 'code_format', 'Enter the 6-digit code from your current email');
    }

    const challenge = await findChallenge(userId, 'change', ['pending']);
    if (!(await checkAttempt(req, res, challenge, 'currentCodeHash', 'currentEmailAttempts'))) return;

    if (!codesMatch(verificationCode, challenge.currentCodeHash)) {
      return await burnAttempt(challenge, 'currentEmailAttempts', res);
    }

    await EmailVerification.updateOne(
      { _id: challenge._id },
      {
        $set: { status: 'current-verified', currentEmailVerifiedAt: new Date() },
        $unset: { currentCodeHash: '' },
      }
    );

    logger.info('emailManagement', 'Current email verified', {
      userId: userId.toString(),
      email: maskEmail(challenge.currentEmail),
    });

    res.json({
      success: true,
      message: 'Current email verified',
      nextStep: 'Verify new email to complete change',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify current email', error);
    refuse(res, 500, 'verify_failed', 'Failed to verify current email');
  }
});

/**
 * POST /api/email-management/verify-new-email — step 2 of a change.
 *
 * Queries only 'current-verified'. The old version also accepted 'pending',
 * so step 2 could be answered first and step 1 skipped entirely, which made
 * the current-address check decorative. The ordering is the security property
 * of this whole flow, so a pending challenge gets its own refusal.
 */
router.post('/verify-new-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { verificationCode } = req.body;

    if (!/^\d{6}$/.test(String(verificationCode || ''))) {
      return refuse(res, 400, 'code_format', 'Enter the 6-digit code from your new email');
    }

    const pending = await EmailVerification.exists({ userId, purpose: 'change', status: 'pending' });
    if (pending) {
      return refuse(
        res,
        400,
        'current_email_not_verified',
        'Verify the code sent to your current email first'
      );
    }

    const challenge = await findChallenge(userId, 'change', ['current-verified']);
    if (!(await checkAttempt(req, res, challenge, 'newCodeHash', 'newEmailAttempts'))) return;

    if (!codesMatch(verificationCode, challenge.newCodeHash)) {
      return await burnAttempt(challenge, 'newEmailAttempts', res);
    }

    await EmailVerification.updateOne(
      { _id: challenge._id },
      {
        $set: { status: 'new-verified', newEmailVerifiedAt: new Date() },
        $unset: { newCodeHash: '' },
      }
    );

    logger.info('emailManagement', 'New email verified', {
      userId: userId.toString(),
      email: maskEmail(challenge.newEmail),
    });

    res.json({
      success: true,
      message: 'New email verified',
      nextStep: 'Complete email change process',
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify new email', error);
    refuse(res, 500, 'verify_failed', 'Failed to verify new email');
  }
});

/**
 * POST /api/email-management/complete-change
 * Applies a change whose two halves were both proven.
 */
router.post('/complete-change', async (req, res) => {
  try {
    const userId = req.user._id;

    const challenge = await EmailVerification.findOne({
      userId,
      purpose: 'change',
      status: 'new-verified',
      currentEmailVerifiedAt: { $ne: null },
    }).sort('-createdAt').lean();

    if (!challenge) {
      return refuse(
        res,
        404,
        'change_not_ready',
        'This change has not been confirmed by both addresses yet'
      );
    }

    // Update user email. Must go through save() — not findByIdAndUpdate —
    // so the pre('save') hook encrypts the new email and recomputes
    // email_blind; a bypassed hook stores plaintext with a stale blind index,
    // which breaks email login and leaks PII at rest.
    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) return refuse(res, 404, 'user_not_found', 'User not found');
    userToUpdate.email = challenge.newEmail;
    await userToUpdate.save();

    await EmailVerification.updateOne(
      { _id: challenge._id },
      { $set: { status: 'completed', completedAt: new Date() } }
    );

    // /verify-new-email is what proved the new address, so the account stays
    // verified; only the timestamp moves.
    await UserSettings.updateOne(
      { userId },
      { $set: { 'contactInfo.emailVerified': true, 'contactInfo.emailVerifiedAt': new Date() } },
      { upsert: true }
    );

    logger.info('emailManagement', 'Email change completed', {
      userId: userId.toString(),
      oldEmail: maskEmail(challenge.currentEmail),
      newEmail: maskEmail(challenge.newEmail),
    });

    res.json({
      success: true,
      message: 'Email successfully changed',
      newEmail: challenge.newEmail,
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to complete email change', error);
    refuse(res, 500, 'complete_failed', 'Failed to complete email change');
  }
});

/**
 * POST /api/email-management/cancel-change
 */
router.post('/cancel-change', async (req, res) => {
  try {
    const userId = req.user._id;

    const withdrawn = await withdraw(userId, 'change', ['pending', 'current-verified', 'new-verified']);
    if (!withdrawn.modifiedCount) {
      return refuse(res, 404, 'no_pending_change', 'No pending email change to cancel');
    }

    logger.info('emailManagement', 'Email change cancelled', { userId: userId.toString() });
    res.json({ success: true, message: 'Email change cancelled' });
  } catch (error) {
    logger.error('emailManagement', 'Failed to cancel email change', error);
    refuse(res, 500, 'cancel_failed', 'Failed to cancel email change');
  }
});

/**
 * POST /api/email-management/set-backup-email
 * Step 1 of attaching a recovery address.
 *
 * Backup challenges used to be written into the same collection with no
 * discriminator and status 'pending', and the change flow's queries filtered
 * on status alone — so answering the code sent to an attacker-chosen backup
 * address satisfied /verify-new-email and completed a primary-email change.
 * Purpose is now part of every query in this file.
 */
router.post('/set-backup-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { backupEmail } = req.body;

    if (!backupEmail || !backupEmail.includes('@')) {
      return refuse(res, 400, 'email_format', 'Valid email required');
    }

    const normalizedBackupEmail = backupEmail.toLowerCase().trim();

    const [rawUser, settings] = await Promise.all([
      User.findById(userId).select('email').lean(),
      UserSettings.findOne({ userId }).lean(),
    ]);
    if (!rawUser) return refuse(res, 404, 'user_not_found', 'User not found');
    const currentEmail = User.decryptUserPii(rawUser).email;

    if (normalizedBackupEmail === String(currentEmail).toLowerCase()) {
      return refuse(res, 400, 'same_email', 'Backup email cannot be same as primary email');
    }

    const existing = settings?.contactInfo?.backupEmail
      ? decryptField(settings.contactInfo.backupEmail)
      : null;
    if (
      existing &&
      existing.toLowerCase() === normalizedBackupEmail &&
      settings.contactInfo.backupEmailVerifiedAt
    ) {
      return res.json({ success: true, alreadyVerified: true, message: 'This backup email is already confirmed' });
    }

    // Someone else's address cannot become this account's recovery option.
    const takenBy = await User.findOne({ email_blind: blindIndex(normalizedBackupEmail) });
    if (takenBy && String(takenBy._id) !== String(userId)) {
      return refuse(res, 409, 'email_in_use', 'That email is already used by another Mallchain account');
    }

    const code = generateCode();
    await withdraw(userId, 'backup', ['pending']);

    const challenge = new EmailVerification({
      userId,
      purpose: 'backup',
      currentEmail,
      newEmail: normalizedBackupEmail,
      newCodeHash: hashCode(code),
      codeExpiry: new Date(Date.now() + CODE_TTL_MS),
      status: 'pending',
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    const delivered = await deliverCode(normalizedBackupEmail, code, 'backup');
    if (!delivered) {
      return refuse(
        res,
        503,
        'email_delivery_unavailable',
        'We could not send a code to that address, so the backup email was not started.'
      );
    }
    await challenge.save();

    logger.info('emailManagement', 'Backup email setup initiated', {
      userId: userId.toString(),
      backupEmail: maskEmail(normalizedBackupEmail),
    });

    res.json({
      success: true,
      message: 'Verification code sent',
      verificationId: challenge._id,
      expiresAt: challenge.codeExpiry,
      sentTo: maskEmail(normalizedBackupEmail),
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to set backup email', error);
    refuse(res, 500, 'backup_start_failed', 'Failed to set backup email');
  }
});

/**
 * POST /api/email-management/verify-backup-email
 * Step 2: only a code answered from the backup inbox attaches the address.
 */
router.post('/verify-backup-email', async (req, res) => {
  try {
    const userId = req.user._id;
    const { verificationCode } = req.body;

    if (!/^\d{6}$/.test(String(verificationCode || ''))) {
      return refuse(res, 400, 'code_format', 'Enter the 6-digit code from your backup email');
    }

    const challenge = await findChallenge(userId, 'backup', ['pending']);
    if (!(await checkAttempt(req, res, challenge, 'newCodeHash', 'newEmailAttempts'))) return;

    if (!codesMatch(verificationCode, challenge.newCodeHash)) {
      return await burnAttempt(challenge, 'newEmailAttempts', res);
    }

    await EmailVerification.updateOne(
      { _id: challenge._id },
      { $set: { status: 'completed', newEmailVerifiedAt: new Date(), completedAt: new Date() } }
    );

    // Encrypted like every other address at rest: this document is returned in
    // full by GET /api/settings, and a recovery address in plaintext there is
    // a PII leak and a hint to whoever holds the session.
    await UserSettings.updateOne(
      { userId },
      {
        $set: {
          'contactInfo.backupEmail': encryptField(challenge.newEmail),
          'contactInfo.backupEmailVerifiedAt': new Date(),
        },
      },
      { upsert: true }
    );

    logger.info('emailManagement', 'Backup email confirmed', {
      userId: userId.toString(),
      backupEmail: maskEmail(challenge.newEmail),
    });

    res.json({
      success: true,
      message: 'Backup email confirmed',
      backupEmail: maskEmail(challenge.newEmail),
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to verify backup email', error);
    refuse(res, 500, 'backup_verify_failed', 'Failed to verify backup email');
  }
});

/**
 * GET /api/email-management/recovery-options
 *
 * Reads UserSettings. It used to read `User.backupEmail` — a path the User
 * schema never defined — so this could only ever report "no backup email",
 * even after a person had gone through the whole setup.
 */
router.get('/recovery-options', async (req, res) => {
  try {
    const userId = req.user._id;
    const [rawUser, settings] = await Promise.all([
      User.findById(userId).select('email').lean(),
      UserSettings.findOne({ userId }).lean(),
    ]);

    const primaryEmail = rawUser ? User.decryptUserPii(rawUser).email : null;
    const contact = settings?.contactInfo || {};
    const backupEmail = contact.backupEmail ? decryptField(contact.backupEmail) : null;
    const hasBackup = !!backupEmail && !!contact.backupEmailVerifiedAt;

    res.json({
      primaryEmail: maskEmail(primaryEmail),
      backupEmail: hasBackup ? maskEmail(backupEmail) : null,
      recoveryMethods: [
        {
          method: 'email',
          available: !!primaryEmail,
          description: 'Recovery code sent to your primary email',
        },
        {
          method: 'backup_email',
          available: hasBackup,
          description: 'Recovery code sent to your confirmed backup email',
        },
        {
          method: 'security_question',
          available: false,
          description: 'Not available on Mallchain',
        },
      ],
    });
  } catch (error) {
    logger.error('emailManagement', 'Failed to get recovery options', error);
    refuse(res, 500, 'recovery_options_unavailable', 'Failed to get recovery options');
  }
});

module.exports = router;
