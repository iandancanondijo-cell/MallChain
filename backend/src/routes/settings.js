const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), getJwtSecret());
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

// In-memory storage for settings (replace with database in production)
const userSettings = new Map();

// Default settings template
function getDefaultSettings() {
  return {
    // Preferences
    prefs: {
      accent: 'gold',
      currency: 'USD',
      lang: 'EN',
      theme: 'dark'
    },
    // Notification settings
    notifications: {
      email: {
        transactions: true,
        campaigns: true,
        governance: true,
        marketing: false,
        security: true
      },
      push: {
        transactions: true,
        campaigns: true,
        governance: false,
        marketing: false,
        security: true
      },
      frequency: 'realtime' // realtime, daily, weekly
    },
    // Security settings
    security: {
      twoFactorEnabled: false,
      sessionTimeout: 120, // minutes
      loginNotifications: true,
      deviceManagement: true,
      trustedDevices: []
    },
    // Privacy settings
    privacy: {
      profileVisibility: 'public', // public, friends, private
      showActivity: true,
      showBalance: false,
      allowMessages: true,
      dataSharing: false
    },
    // Display settings
    display: {
      compactMode: false,
      showBalances: true,
      defaultView: 'dashboard', // dashboard, wallet, mines
      itemsPerPage: 20
    },
    updatedAt: new Date().toISOString()
  };
}

// Get or create settings for user
function getOrCreateSettings(userId) {
  if (!userSettings.has(userId)) {
    userSettings.set(userId, getDefaultSettings());
  }
  return userSettings.get(userId);
}

// GET /api/settings - Get user settings
router.get('/', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings - Update settings
router.put('/', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    // Deep merge the updates
    if (req.body.prefs) {
      settings.prefs = { ...settings.prefs, ...req.body.prefs };
    }
    if (req.body.notifications) {
      if (req.body.notifications.email) {
        settings.notifications.email = { ...settings.notifications.email, ...req.body.notifications.email };
      }
      if (req.body.notifications.push) {
        settings.notifications.push = { ...settings.notifications.push, ...req.body.notifications.push };
      }
      if (req.body.notifications.frequency) {
        settings.notifications.frequency = req.body.notifications.frequency;
      }
    }
    if (req.body.security) {
      settings.security = { ...settings.security, ...req.body.security };
    }
    if (req.body.privacy) {
      settings.privacy = { ...settings.privacy, ...req.body.privacy };
    }
    if (req.body.display) {
      settings.display = { ...settings.display, ...req.body.display };
    }
    
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/notifications - Notification preferences
router.put('/notifications', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    if (req.body.email) {
      settings.notifications.email = { ...settings.notifications.email, ...req.body.email };
    }
    if (req.body.push) {
      settings.notifications.push = { ...settings.notifications.push, ...req.body.push };
    }
    if (req.body.frequency) {
      settings.notifications.frequency = req.body.frequency;
    }
    
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok(settings.notifications));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/security - Security settings
router.put('/security', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    const allowedFields = ['twoFactorEnabled', 'sessionTimeout', 'loginNotifications', 'deviceManagement'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings.security[field] = req.body[field];
      }
    });
    
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok(settings.security));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// PUT /api/settings/privacy - Privacy settings
router.put('/privacy', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    const allowedFields = ['profileVisibility', 'showActivity', 'showBalance', 'allowMessages', 'dataSharing'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings.privacy[field] = req.body[field];
      }
    });
    
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok(settings.privacy));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/reset - Reset to defaults
router.post('/reset', verifyToken, async (req, res) => {
  try {
    const settings = getDefaultSettings();
    userSettings.set(req.userId, settings);
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/settings/export - Export settings (for backup)
router.get('/export', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      userId: req.userId,
      settings: settings
    };
    res.json(ok(exportData));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/import - Import settings (from backup)
router.post('/import', verifyToken, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json(fail('settings data is required'));
    }

    // Validate the structure
    const requiredKeys = ['prefs', 'notifications', 'security', 'privacy', 'display'];
    const hasAllKeys = requiredKeys.every(key => settings[key]);
    
    if (!hasAllKeys) {
      return res.status(400).json(fail('Invalid settings format'));
    }

    settings.updatedAt = new Date().toISOString();
    userSettings.set(req.userId, settings);
    
    res.json(ok(settings));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/enable - Enable 2FA
router.post('/security/2fa/enable', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    // In production, verify the 2FA code before enabling
    const { code } = req.body;
    if (!code) {
      return res.status(400).json(fail('2FA code is required'));
    }

    settings.security.twoFactorEnabled = true;
    settings.security.twoFactorEnabledAt = new Date().toISOString();
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok({ enabled: true, backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3'] }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/settings/security/2fa/disable - Disable 2FA
router.post('/security/2fa/disable', verifyToken, async (req, res) => {
  try {
    const settings = getOrCreateSettings(req.userId);
    
    settings.security.twoFactorEnabled = false;
    settings.security.twoFactorDisabledAt = new Date().toISOString();
    settings.updatedAt = new Date().toISOString();
    
    res.json(ok({ enabled: false }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
