const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');
const User = require('../models/user');
const totp = require('../utils/totp');
const { limiters } = require('../middleware/rateLimiter');
const { appendAuditEvent } = require('../services/auditChainService');

// The values Settings > Security > Session Timeout offers, and now the only
// ones it accepts: this number is written into the `exp` of the next token by
// utils/sessionPolicy.js, so a stored 0 or 1 would sign the user out on every
// request. Kept here rather than in the policy util because it is what the
// product advertises, not a security bound.
const SESSION_TIMEOUT_CHOICES = [5, 15, 30];

// Tamper-evident chain audit for privileged account-security changes (2FA,
// password, security flags). Non-fatal + serialized inside the service, so
// calling without await is safe; payloads are stored as hashes only.
function chainSecurityAudit(req, action, payload = {}) {
  const u = req.user || {};
  return appendAuditEvent(
    { id: String(u._id || u.id || 'unknown'), role: String(u.role || 'user') },
    action,
    `user:${u._id || u.id || 'unknown'}`,
    payload
  );
}

function ok(data) { return { ok: true, data }; }
function fail(err) {
  // utils/logger.js's error() is (context, message, error, data) — passing the
  // failure object as `message` (which every caller of this helper used to do)
  // landed it in the wrong slot, so the log line read `errorMessage:
  // 'undefined'` and carried none of the reason. Strings are a client-facing
  // refusal, not a fault, so they log at info; only real errors reach error().
  if (typeof err === 'string') {
    logger.warn('settings', 'request refused', { reason: err });
    return { ok: false, error: err };
  }
  logger.error('settings', 'request failed', err);
  return { ok: false, error: 'Invalid request' };
}

/**
 * Phone OTPs are short-lived numeric secrets, so they are compared as hashes
 * (see UserSettings.contactInfo.pendingPhoneOtpHash) with a constant-time
 * equality check rather than `===` on digits an attacker is guessing.
 */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function otpsMatch(candidate, storedHash) {
  const a = Buffer.from(hashOtp(candidate), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clearPendingOtp(settings) {
  settings.contactInfo.pendingPhoneOtpHash = undefined;
  settings.contactInfo.pendingPhoneOtpExpiry = undefined;
  settings.contactInfo.pendingPhoneOtpAttempts = 0;
}

async function getOrCreateSettings(userId) {
  let settings = await UserSettings.findOne({ userId });
  if (!settings) settings = await UserSettings.create({ userId });
  return settings;
}

// GET /api/settings - Get user settings
router.get('/', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings - Update settings
router.put('/', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    if (req.body.prefs) Object.assign(settings.prefs, req.body.prefs);
    if (req.body.notifications) {
      if (req.body.notifications.email) Object.assign(settings.notifications.email, req.body.notifications.email);
      if (req.body.notifications.push) Object.assign(settings.notifications.push, req.body.notifications.push);
      if (req.body.notifications.sms) Object.assign(settings.notifications.sms, req.body.notifications.sms);
      if (req.body.notifications.whatsapp) Object.assign(settings.notifications.whatsapp, req.body.notifications.whatsapp);
      if (req.body.notifications.frequency) settings.notifications.frequency = req.body.notifications.frequency;
    }
    if (req.body.security) Object.assign(settings.security, req.body.security);
    if (req.body.privacy) Object.assign(settings.privacy, req.body.privacy);
    if (req.body.display) Object.assign(settings.display, req.body.display);

    if (req.body.security || req.body.privacy) {
      chainSecurityAudit(req, 'settings_bulk_update', { sections: [req.body.security && 'security', req.body.privacy && 'privacy'].filter(Boolean) });
    }
    await settings.save();
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/notifications - Notification preferences
router.put('/notifications', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    if (req.body.email) Object.assign(settings.notifications.email, req.body.email);
    if (req.body.push) Object.assign(settings.notifications.push, req.body.push);
    if (req.body.sms) Object.assign(settings.notifications.sms, req.body.sms);
    if (req.body.whatsapp) Object.assign(settings.notifications.whatsapp, req.body.whatsapp);
    if (req.body.frequency) settings.notifications.frequency = req.body.frequency;

    await settings.save();
    res.json(ok(settings.notifications));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/settings/contact - Get contact info (phone, email verification status)
router.get('/contact', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    res.json(ok(settings.contactInfo || {}));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/contact - Update contact info (phone number, etc.)
router.put('/contact', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const { phoneNumber, whatsappOptIn } = req.body;

    // Validate phone format (E.164: +<countrycode><number>)
    if (phoneNumber !== undefined) {
      if (phoneNumber === null) {
        settings.contactInfo.phoneNumber = null;
        settings.contactInfo.phoneVerified = false;
        settings.contactInfo.phoneVerifiedAt = null;
        settings.contactInfo.whatsappOptIn = false;
        settings.contactInfo.whatsappOptInAt = null;
      } else {
        const e164Pattern = /^\+[1-9]\d{1,14}$/;
        if (!e164Pattern.test(phoneNumber)) {
          return res.status(400).json(fail('Phone number must be in E.164 format (e.g. +254712345678)'));
        }
        // Changing phone number invalidates verification
        if (settings.contactInfo.phoneNumber !== phoneNumber) {
          settings.contactInfo.phoneNumber = phoneNumber;
          settings.contactInfo.phoneVerified = false;
          settings.contactInfo.phoneVerifiedAt = null;
        }
      }
    }

    if (whatsappOptIn !== undefined) {
      if (whatsappOptIn && !settings.contactInfo.phoneVerified) {
        return res.status(400).json(fail('Phone number must be verified before opting into WhatsApp'));
      }
      settings.contactInfo.whatsappOptIn = whatsappOptIn;
      settings.contactInfo.whatsappOptInAt = whatsappOptIn ? new Date() : null;
    }

    await settings.save();
    res.json(ok(settings.contactInfo));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/contact/phone/send-otp - Send OTP to phone number
//
// The digits used to be handed back in the response outside production
// ("dev mode: check response for code"), which made phone verification a
// formality for anyone who could open the Network tab — the answer arrived
// with the question. The code is now only ever stored as a hash, and the
// response only ever says whether the SMS provider accepted the message.
router.post('/contact/phone/send-otp', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    if (!settings.contactInfo?.phoneNumber) {
      return res.status(400).json(fail('Set a phone number first via PUT /contact'));
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Persist before sending: a code that is delivered but not stored could
    // never be verified, whereas a stored code that was not delivered simply
    // expires unused — the safe direction to fail.
    await UserSettings.updateOne(
      { userId: req.user._id },
      {
        $set: {
          'contactInfo.pendingPhoneOtpHash': hashOtp(otp),
          'contactInfo.pendingPhoneOtpExpiry': otpExpiry,
          'contactInfo.pendingPhoneOtpAttempts': 0,
        },
      }
    );

    const { sendSMS } = require('../services/brevoService');
    const sent = await sendSMS(
      settings.contactInfo.phoneNumber,
      `Your Mallchain verification code is: ${otp}. Valid for 10 minutes.`
    );

    if (!sent?.success) {
      // No SMS left this server. Withdraw the pending code rather than leaving
      // the account sitting on a challenge nobody can answer, and say so —
      // "sent" would be a promise about a message that was never sent.
      await UserSettings.updateOne({ userId: req.user._id }, { $unset: {
        'contactInfo.pendingPhoneOtpHash': 1,
        'contactInfo.pendingPhoneOtpExpiry': 1,
        'contactInfo.pendingPhoneOtpAttempts': 1,
      } });
      logger.warn('settings', 'phone OTP was not delivered', {
        userId: String(req.user._id),
        reason: sent?.error || 'sms provider returned no result',
      });
      // `error` is what the SPA's api client turns into a toast (it reads a flat
      // string), so the sentence goes there and the machine code rides along.
      return res.status(503).json({
        ok: false,
        error: 'The SMS service did not accept the message, so no code was sent. Your phone number has not been changed.',
        details: { code: 'sms_delivery_unavailable' },
      });
    }

    res.json(ok({ sent: true, expiresAt: otpExpiry, message: 'OTP sent to your phone' }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/contact/phone/verify - Verify phone with OTP
//
// Six digits, ten minutes: without a counter a caller can try the whole
// space from a script, so each wrong answer is counted and the challenge is
// burned at five. The code is read with an explicit `+`-select — it is
// `select: false` on the schema precisely so no route that returns a settings
// document can hand it out by accident — and compared as hashes.
const PHONE_OTP_MAX_ATTEMPTS = 5;

router.post('/contact/phone/verify', auth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json(fail('OTP is required'));

    const challenge = await UserSettings.findOne({ userId: req.user._id })
      .select('+contactInfo.pendingPhoneOtpHash +contactInfo.pendingPhoneOtpExpiry +contactInfo.pendingPhoneOtpAttempts')
      .lean();

    const pendingHash = challenge?.contactInfo?.pendingPhoneOtpHash;
    const otpExpiry = challenge?.contactInfo?.pendingPhoneOtpExpiry;
    const attempts = challenge?.contactInfo?.pendingPhoneOtpAttempts ?? 0;

    if (!pendingHash) {
      return res.status(400).json(fail('No code has been sent to this number yet. Request one first.'));
    }
    if (!otpExpiry || new Date() > new Date(otpExpiry)) {
      await UserSettings.updateOne({ userId: req.user._id }, { $unset: {
        'contactInfo.pendingPhoneOtpHash': 1,
        'contactInfo.pendingPhoneOtpExpiry': 1,
        'contactInfo.pendingPhoneOtpAttempts': 1,
      } });
      return res.status(400).json(fail('OTP has expired. Request a new one'));
    }
    if (attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      await UserSettings.updateOne({ userId: req.user._id }, { $unset: {
        'contactInfo.pendingPhoneOtpHash': 1,
        'contactInfo.pendingPhoneOtpExpiry': 1,
        'contactInfo.pendingPhoneOtpAttempts': 1,
      } });
      return res.status(429).json(fail('Too many incorrect codes. Request a new one.'));
    }
    if (!otpsMatch(String(otp).trim(), pendingHash)) {
      await UserSettings.updateOne(
        { userId: req.user._id },
        { $inc: { 'contactInfo.pendingPhoneOtpAttempts': 1 } }
      );
      // settingsApi.unwrap drops everything but `error`, so the countdown has
      // to live inside the sentence or the person never learns how close the
      // challenge is to burning.
      const remaining = PHONE_OTP_MAX_ATTEMPTS - (attempts + 1);
      return res.status(400).json(fail(
        remaining > 0
          ? `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} left before this code stops working.`
          : 'Too many incorrect codes. Request a new one.'
      ));
    }

    // OTP matches — mark phone as verified and burn the challenge so a
    // captured code cannot be replayed against the same number.
    await UserSettings.updateOne(
      { userId: req.user._id },
      {
        $set: {
          'contactInfo.phoneVerified': true,
          'contactInfo.phoneVerifiedAt': new Date(),
        },
        $unset: {
          'contactInfo.pendingPhoneOtpHash': 1,
          'contactInfo.pendingPhoneOtpExpiry': 1,
          'contactInfo.pendingPhoneOtpAttempts': 1,
        },
      }
    );

    logger.info('settings', 'phone number verified', { userId: String(req.user._id) });

    res.json(ok({
      verified: true,
      phoneNumber: challenge.contactInfo?.phoneNumber ?? null,
    }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/contact/whatsapp/opt-in - Opt into WhatsApp notifications
router.post('/contact/whatsapp/opt-in', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    if (!settings.contactInfo?.phoneVerified) {
      return res.status(400).json(fail('Phone number must be verified first'));
    }

    settings.contactInfo.whatsappOptIn = true;
    settings.contactInfo.whatsappOptInAt = new Date();
    await settings.save();

    res.json(ok({ whatsappOptIn: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/contact/whatsapp/opt-out - Opt out of WhatsApp notifications
router.post('/contact/whatsapp/opt-out', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    settings.contactInfo.whatsappOptIn = false;
    settings.contactInfo.whatsappOptInAt = null;
    await settings.save();

    res.json(ok({ whatsappOptIn: false }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// ── Social accounts ──
// Platform enum must match mallchain-os-v14/src/features/settings/components/
// SocialAccounts.tsx SOCIAL_PLATFORMS ids exactly.
const SOCIAL_PLATFORMS = [
  'twitter', 'discord', 'telegram', 'reddit', 'github',
  'youtube', 'twitch', 'linkedin', 'tiktok', 'instagram',
];

function sanitizeHandle(raw) {
  if (typeof raw !== 'string') return null;
  // Strip control characters, trim surrounding whitespace, drop leading '@'
  // (users habitually paste "@handle"; we store the bare username).
  const handle = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^@+/, '').trim();
  if (!handle || handle.length > 100) return null;
  return handle;
}

// GET /api/settings/social - List connected social accounts
router.get('/social', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    res.json(ok(settings.socialAccounts || []));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/social/:platform - Connect/upsert one platform's handle
router.post('/social/:platform', auth, async (req, res) => {
  try {
    const platform = String(req.params.platform || '').toLowerCase();
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      return res.status(400).json(fail(`Unsupported platform: ${platform}. Allowed: ${SOCIAL_PLATFORMS.join(', ')}`));
    }
    const handle = sanitizeHandle(req.body.handle);
    if (handle === null) {
      return res.status(400).json(fail('handle is required and must be a non-empty string of at most 100 characters'));
    }

    const settings = await getOrCreateSettings(req.user._id);
    let account = (settings.socialAccounts || []).find((a) => a.platform === platform);
    if (account) {
      account.handle = handle;
      account.connected = true;
      account.lastConnected = new Date();
    } else {
      settings.socialAccounts.push({ platform, handle, connected: true, lastConnected: new Date() });
    }
    await settings.save();

    res.json(ok({ platform, handle, connected: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// DELETE /api/settings/social/:platform - Disconnect a social account
router.delete('/social/:platform', auth, async (req, res) => {
  try {
    const platform = String(req.params.platform || '').toLowerCase();
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      return res.status(400).json(fail(`Unsupported platform: ${platform}`));
    }

    const settings = await getOrCreateSettings(req.user._id);
    const idx = (settings.socialAccounts || []).findIndex((a) => a.platform === platform);
    if (idx === -1) {
      return res.status(404).json(fail(`No ${platform} account connected`));
    }
    settings.socialAccounts.splice(idx, 1);
    await settings.save();

    res.json(ok({ removed: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/security - Security settings
router.put('/security', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    const allowedFields = ['twoFactorEnabled', 'sessionTimeout', 'loginNotifications', 'deviceManagement'];
    // sessionTimeout is read by utils/sessionPolicy.js and written into the
    // `exp` of the next token, so it is a live input now, not a display
    // preference. The control that sets it offers 5/15/30 minutes or no
    // preference at all; anything else is refused rather than stored, because
    // a 0 or a 1 would sign the user out on every request.
    if (req.body.sessionTimeout !== undefined
      && req.body.sessionTimeout !== null
      && !SESSION_TIMEOUT_CHOICES.includes(Number(req.body.sessionTimeout))) {
      return res.status(400).json(fail(`sessionTimeout must be one of ${SESSION_TIMEOUT_CHOICES.join(', ')} minutes, or null for the server default`));
    }
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) settings.security[field] = req.body[field];
    });

    chainSecurityAudit(req, 'settings_security_update', { fields: allowedFields.filter((f) => req.body[f] !== undefined) });
    await settings.save();
    res.json(ok(settings.security));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// The three choices the Profile & Settings visibility control offers.
// POST /api/identity/resolve (routes/identity.js) reads this field to decide
// whether an account's name and picture may be attached to its wallet address
// on someone else's transaction list, so an arbitrary string stored here would
// silently mean "public" for that lookup. Anything outside the enum is refused.
const PROFILE_VISIBILITY_CHOICES = ['public', 'contacts', 'private'];

// PUT /api/settings/privacy - Privacy settings
router.put('/privacy', auth, async (req, res) => {
  try {
    if (req.body.profileVisibility !== undefined
      && !PROFILE_VISIBILITY_CHOICES.includes(req.body.profileVisibility)) {
      return res.status(400).json(fail(`profileVisibility must be one of ${PROFILE_VISIBILITY_CHOICES.join(', ')}`));
    }

    const settings = await getOrCreateSettings(req.user._id);

    const allowedFields = ['profileVisibility', 'showActivity', 'showBalance', 'allowMessages', 'dataSharing'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) settings.privacy[field] = req.body[field];
    });

    await settings.save();
    res.json(ok(settings.privacy));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/reset - Reset to defaults
router.post('/reset', auth, async (req, res) => {
  try {
    await UserSettings.deleteOne({ userId: req.user._id });
    const settings = await getOrCreateSettings(req.user._id);
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/settings/export - Export settings (for backup)
router.get('/export', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      userId: req.user._id,
      settings,
    };
    res.json(ok(exportData));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/import - Import settings (from backup)
router.post('/import', auth, async (req, res) => {
  try {
    const { settings: incoming } = req.body;
    if (!incoming) {
      return res.status(400).json(fail('settings data is required'));
    }

    const requiredKeys = ['prefs', 'notifications', 'security', 'privacy', 'display'];
    const hasAllKeys = requiredKeys.every((key) => incoming[key]);
    if (!hasAllKeys) {
      return res.status(400).json(fail('Invalid settings format'));
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { prefs: incoming.prefs, notifications: incoming.notifications, security: incoming.security, privacy: incoming.privacy, display: incoming.display } },
      { new: true, upsert: true }
    );

    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/setup - Generate a real TOTP secret to enroll
// (not yet active — /2fa/enable below activates it once a code from it verifies).
router.post('/security/2fa/setup', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const secret = totp.generateSecret();
    settings.security.twoFactorPendingSecret = secret;
    await settings.save();
    chainSecurityAudit(req, 'settings_2fa_setup', {});

    res.json(ok({
      secret,
      // For manual entry into an authenticator app (no QR renderer wired
      // up client-side) — the same information a QR code would encode.
      otpauthUrl: totp.keyUri(secret, User.decryptUserPii(req.user).email || String(req.user._id)),
    }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/enable - Verify a real TOTP code against
// the pending secret before turning 2FA on. Replaces what used to accept
// any non-empty code with no secret ever generated or checked — confirmed
// live that this previously let 2FA be "enabled" with junk input while
// providing zero actual login protection.
router.post('/security/2fa/enable', auth, limiters.strict, async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user._id }).select('+security.twoFactorPendingSecret');
    const pendingSecret = settings?.security?.twoFactorPendingSecret;
    if (!pendingSecret) {
      return res.status(400).json(fail('Call /2fa/setup first to generate a secret'));
    }

    const { code } = req.body;
    if (!totp.verifyToken(pendingSecret, code)) {
      return res.status(400).json(fail('Invalid or expired code'));
    }

    const backupCodes = totp.generateBackupCodes();
    const backupCodeHashes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

    settings.security.twoFactorSecret = pendingSecret;
    settings.security.twoFactorPendingSecret = undefined;
    settings.security.twoFactorBackupCodeHashes = backupCodeHashes;
    settings.security.twoFactorEnabled = true;
    settings.security.twoFactorEnabledAt = new Date();
    await settings.save();
    chainSecurityAudit(req, 'settings_2fa_enable', { backupCodeCount: backupCodes.length });

    // Backup codes are only ever returned this once — only their hashes are stored.
    res.json(ok({ enabled: true, backupCodes }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/disable - Disable 2FA (re-auth required:
// a valid current TOTP/backup code, so a hijacked session token alone can't
// turn off the account's second factor).
router.post('/security/2fa/disable', auth, limiters.strict, async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user._id })
      .select('+security.twoFactorSecret +security.twoFactorBackupCodeHashes');
    if (!settings?.security?.twoFactorEnabled) {
      return res.status(400).json(fail('2FA is not enabled'));
    }

    const { code } = req.body;
    const validTotp = code && totp.verifyToken(settings.security.twoFactorSecret, code);
    let validBackup = false;
    if (!validTotp && code) {
      for (const hash of settings.security.twoFactorBackupCodeHashes || []) {
        if (await bcrypt.compare(String(code).trim().toUpperCase(), hash)) { validBackup = true; break; }
      }
    }
    if (!validTotp && !validBackup) {
      return res.status(400).json(fail('A valid current 2FA code or backup code is required to disable 2FA'));
    }

    settings.security.twoFactorEnabled = false;
    settings.security.twoFactorDisabledAt = new Date();
    settings.security.twoFactorSecret = undefined;
    settings.security.twoFactorBackupCodeHashes = undefined;
    await settings.save();
    chainSecurityAudit(req, 'settings_2fa_disable', { viaBackupCode: !validTotp && validBackup });

    res.json(ok({ enabled: false }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/change-password - Self-service password
// change while logged in. No password reset/change flow existed anywhere
// in the backend before this — a user who suspected their account was
// compromised had no way to rotate their own credentials.
router.post('/security/change-password', auth, limiters.strict, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json(fail('currentPassword and newPassword are required'));
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json(fail('New password must be at least 8 characters and include uppercase, lowercase, and a number'));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user?.password) return res.status(400).json(fail('This account has no password set (OAuth-only login)'));

    const ok_ = await bcrypt.compare(currentPassword, user.password);
    if (!ok_) return res.status(401).json(fail('Current password is incorrect'));

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    chainSecurityAudit(req, 'settings_password_change', {});

    res.json(ok({ changed: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
