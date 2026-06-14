const express = require('express');
const router = express.Router();
const stakingCtrl = require('../controllers/stakingController');
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiter');

const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

// Aggregated staking dashboard data
router.get('/summary/:address', stakingCtrl.summary);

// Broadcast client-signed staking txs
router.post('/broadcast', txLimiter, stakingCtrl.broadcast);

// Get staking info for an address (GET or POST for mnemonic/publicKey)
router.get('/info/:address', stakingCtrl.info);
router.post('/info/:address', stakingCtrl.info);

// Legacy aliases for older clients
router.post('/stake', txLimiter, stakingCtrl.broadcast);
router.post('/unstake', txLimiter, stakingCtrl.broadcast);

// Delegate tokens (server treasury signer — requires auth)
router.post('/delegate', auth, stakingCtrl.delegate);

// Undelegate tokens
router.post('/undelegate', auth, stakingCtrl.undelegate);

// Claim staking rewards
router.post('/claim', auth, stakingCtrl.claim);

module.exports = router;
