const express = require('express');
const router = express.Router();
const rewardsCtrl = require('../controllers/rewardsController');

// Get rewards info for an address (GET or POST for mnemonic/publicKey)
router.get('/info/:address', rewardsCtrl.info);
router.post('/info/:address', rewardsCtrl.info);

// Reward claims (MsgWithdrawDelegatorReward) are client-signed and broadcast
// through /api/staking/broadcast — see controllers/rewardsController.js for
// why the old treasury-signed /claim endpoint here was removed.

module.exports = router;
