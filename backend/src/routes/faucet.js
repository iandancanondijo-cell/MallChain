const router = require('express').Router();
const ctrl = require('../controllers/faucetController');
const { createLimiter } = require('../middleware/rateLimiter');

const faucetLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.FAUCET_RATE_LIMIT_MAX || 10),
});

router.get('/status', ctrl.status);
router.post('/mlcns', faucetLimiter, ctrl.requestMlcns);

module.exports = router;
