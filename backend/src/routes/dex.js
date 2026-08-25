const express = require('express');
const router = express.Router();
const dexCtrl = require('../controllers/dexController');
const { createLimiter } = require('../middleware/rateLimiter');
const { preventNoSQLInjection, limitPayloadSize } = require('../middleware/inputValidation');

// x/dex REST wrapper — the chain module (CreatePool/AddLiquidity/RemoveLiquidity/
// Swap/EstimateSwap) is fully implemented and unit-tested, but had zero
// backend routes and zero frontend pages before this (see WalletSwap.tsx's
// former "not available yet" stub).
const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

router.get('/pools', preventNoSQLInjection, dexCtrl.listPools);
router.get('/pools/:poolId', preventNoSQLInjection, dexCtrl.getPool);
router.get('/pools/:poolId/liquidity/:address', preventNoSQLInjection, dexCtrl.getPoolLiquidity);
router.get('/pools/:poolId/estimate', preventNoSQLInjection, dexCtrl.estimateSwap);

router.post('/broadcast',
  txLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  dexCtrl.broadcast
);

module.exports = router;
