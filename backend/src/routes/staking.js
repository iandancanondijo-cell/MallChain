const express = require('express');
const router = express.Router();
const stakingCtrl = require('../controllers/stakingController');
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiter');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize } = require('../middleware/inputValidation');

const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

// Task 8.6: Apply input validation to staking routes to prevent NoSQL injection and XSS
// Aggregated staking dashboard data
router.get('/summary/:address', preventNoSQLInjection, stakingCtrl.summary);

// Broadcast client-signed staking txs
router.post('/broadcast', 
  txLimiter, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.broadcast
);

// Get staking info for an address (GET or POST for mnemonic/publicKey)
router.get('/info/:address', preventNoSQLInjection, stakingCtrl.info);
router.post('/info/:address', 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.info
);

// Legacy aliases for older clients
router.post('/stake', 
  txLimiter, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.broadcast
);

router.post('/unstake', 
  txLimiter, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.broadcast
);

// Delegate tokens (server treasury signer — requires auth)
router.post('/delegate', 
  auth, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.delegate
);

// Undelegate tokens
router.post('/undelegate', 
  auth, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.undelegate
);

// Claim staking rewards
router.post('/claim', 
  auth, 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.claim
);

module.exports = router;
