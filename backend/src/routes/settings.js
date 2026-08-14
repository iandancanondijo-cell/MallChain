const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');

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

// POST /api/settings/security/2fa/enable - Enable 2FA
router.post('/security/2fa/enable', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    // In production, verify the 2FA code before enabling
    const { code } = req.body;
    if (!code) {
      return res.status(400).json(fail('2FA code is required'));
    }

    settings.security.twoFactorEnabled = true;
    settings.security.twoFactorEnabledAt = new Date();
    await settings.save();

    res.json(ok({ enabled: true, backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3'] }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/disable - Disable 2FA
router.post('/security/2fa/disable', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);

    settings.security.twoFactorEnabled = false;
    settings.security.twoFactorDisabledAt = new Date();
    await settings.save();

    res.json(ok({ enabled: false }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
