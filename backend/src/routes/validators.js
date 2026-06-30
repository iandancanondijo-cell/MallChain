const express = require('express');
const router = express.Router();
const {
  createValidator,
  listValidators,
  listLeaderboard,
  getValidator,
  applyValidator,
  listApplications,
  reviewApplication,
  getMyApplication,
} = require('../controllers/validatorController');
const auth = require('../middleware/auth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

router.get('/list', listValidators);
router.get('/leaderboard', listLeaderboard);
router.get('/detail/:operatorAddress', getValidator);
router.post('/apply', auth, applyValidator);
router.get('/my-application', auth, getMyApplication);
router.get('/applications', apiKeyAuth, listApplications);
router.post('/applications/:id/review', apiKeyAuth, reviewApplication);
router.post('/create', auth, createValidator);

module.exports = router;
