const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');
const User = require('../models/user');
const totp = require('../utils/totp');
const { limiters } = require('../middleware/rateLimiter');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
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
      if (req.body.notifications.frequency) settings.notifications.frequency = req.body.notifications.frequency;
    }
    if (req.body.security) Object.assign(settings.security, req.body.security);
    if (req.body.privacy) Object.assign(settings.privacy, req.body.privacy);
    if (req.body.display) Object.assign(settings.display, req.body.display);

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
    if (req.body.frequency) settings.notifications.frequency = req.body.frequency;

    await settings.save();
    res.json(ok(settings.notifications));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/security - Security settings
router.put('/security', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    const allowedFields = ['twoFactorEnabled', 'sessionTimeout', 'loginNotifications', 'deviceManagement'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) settings.security[field] = req.body[field];
    });

    await settings.save();
    res.json(ok(settings.security));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/privacy - Privacy settings
router.put('/privacy', auth, async (req, res) => {
  try {
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

    res.json(ok({
      secret,
      // For manual entry into an authenticator app (no QR renderer wired
      // up client-side) — the same information a QR code would encode.
      otpauthUrl: totp.keyUri(secret, req.user.email || String(req.user._id)),
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

    res.json(ok({ changed: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
