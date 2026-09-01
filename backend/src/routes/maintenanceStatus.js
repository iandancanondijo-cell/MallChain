const express = require('express');
const router = express.Router();
const MaintenanceMode = require('../models/MaintenanceMode');
const { limiters } = require('../middleware/rateLimiter');

// GET /api/maintenance — public, read-only maintenance status. Distinct
// from /api/admin/maintenance (which requires admin auth and is what
// actually toggles it): regular users need to see which flows are paused
// too, so the frontend can show a real banner and disable those actions —
// previously the only "maintenance" banner in the app was a fake, per-browser
// local toggle with no backend behind it at all.
router.get('/', limiters.lenient, async (_req, res) => {
  try {
    const state = await MaintenanceMode.findById('singleton').lean();
    return res.json({
      ok: true,
      global: state?.global || false,
      scopes: state?.scopes || {},
      reason: state?.reason || '',
    });
  } catch (err) {
    // Fail open — a Mongo blip here must never itself look like every flow
    // is paused.
    return res.json({ ok: true, global: false, scopes: {}, reason: '' });
  }
});

module.exports = router;
