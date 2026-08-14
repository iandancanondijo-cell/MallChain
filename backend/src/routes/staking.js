const express = require('express');
const router = express.Router();
const stakingCtrl = require('../controllers/stakingController');
const { createLimiter } = require('../middleware/rateLimiter');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize } = require('../middleware/inputValidation');

const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

// Task 8.6: Apply input validation to staking routes to prevent NoSQL injection and XSS
// Aggregated staking dashboard data (active + historical MsgStake records for an address)
router.get('/summary/:address', preventNoSQLInjection, stakingCtrl.summary);

// Broadcast a client-signed MsgStake/MsgUnstake (see mallchain-os-v14/src/services/stakingTx.ts)
router.post('/broadcast',
  txLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  stakingCtrl.broadcast
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

module.exports = router;
