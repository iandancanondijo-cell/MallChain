const express = require('express');
const router = express.Router();
const rewardsCtrl = require('../controllers/rewardsController');
const auth = require('../middleware/auth');

// Get rewards info for an address (GET or POST for mnemonic/publicKey)
router.get('/info/:address', rewardsCtrl.info);
router.post('/info/:address', rewardsCtrl.info);

// Claim all rewards
router.post('/claim', auth, rewardsCtrl.claim);

module.exports = router;
