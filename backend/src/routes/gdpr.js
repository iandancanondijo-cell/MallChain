const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const { limiters } = require('../middleware/rateLimiter');
const { exportUserData, eraseUserData } = require('../services/gdprService');
const logger = require('../utils/logger');

// GDPR Article 15 — self-service data export. Everything the account is
// linked to (see gdprService.gatherUserData) as one JSON download.
router.get('/export', auth, limiters.standard, async (req, res) => {
  try {
    const data = await exportUserData(req.user);
    res.set('Content-Disposition', 'attachment; filename="mallchain-data-export.json"');
    return res.json(data);
  } catch (e) {
    logger.error('gdpr', 'export failed', e);
    return res.status(500).json({ ok: false, error: 'export failed' });
  }
});

// GDPR Article 17 — self-service erasure. Irreversible, so a password-based
// account must re-confirm its password first (same bar as changing a
// password) — Google-only accounts (no password set) skip that check since
// there's nothing to confirm against, matching how those accounts already
// authenticate everywhere else in this codebase.
router.post('/delete', auth, limiters.strict, async (req, res) => {
  try {
    const user = req.user;
    if (user.password) {
      const { password } = req.body || {};
      if (!password) {
        return res.status(400).json({ ok: false, error: 'password confirmation is required' });
      }
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        return res.status(401).json({ ok: false, error: 'incorrect password' });
      }
    }

    const result = await eraseUserData(user);
    return res.json(result);
  } catch (e) {
    logger.error('gdpr', 'erasure failed', e);
    return res.status(500).json({ ok: false, error: 'erasure failed' });
  }
});

module.exports = router;
