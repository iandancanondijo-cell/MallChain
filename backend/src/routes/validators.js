const express = require('express');
const router = express.Router();
const {
  listValidators,
  listLeaderboard,
  getValidator,
  applyValidator,
  getMyApplication,
} = require('../controllers/validatorController');
const auth = require('../middleware/auth');

router.get('/list', listValidators);
router.get('/leaderboard', listLeaderboard);
router.get('/detail/:operatorAddress', getValidator);
router.post('/apply', auth, applyValidator);
router.get('/my-application', auth, getMyApplication);
// Application review lives at /api/admin/validators/applications* (adminPanel.js)
// — requireAdmin-gated with per-actor audit logging. These routes used to
// duplicate that behind a single shared static API key with no audit trail
// and no per-actor identity (reviewer fell back to the literal string
// 'admin' for every reviewer). Confirmed dead: the frontend only ever calls
// the adminPanel.js path.

module.exports = router;
