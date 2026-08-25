const express = require('express');
const router = express.Router();
const sendCtrl = require('../controllers/sendController');
const { validate, schemas } = require('../middleware/validation');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize, validateQuery } = require('../middleware/inputValidation');
const { asyncHandler } = require('../utils/errorHandler');
const { createUserLimiter } = require('../middleware/rateLimiter');
const Joi = require('joi');

// Keyed by the signing wallet address (from req.body.from), not just IP —
// these broadcast routes run with no auth middleware (client signs, backend
// just relays), so IP alone is bypassable by rotating source IPs against
// one wallet. Same budget as the old limiters.financial (20/15min).
const financialLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'rate_limit_exceeded', message: 'Too many financial operations. Please try again later.' } });

// Task 8.6: Apply input validation to send routes to prevent NoSQL injection and XSS
// Query parameter validation schemas
const txHashQuerySchema = Joi.object({
  txHash: Joi.string()
    .hex()
    .uppercase()
    .max(64)
    .required()
    .messages({
      'string.hex': 'Transaction hash must be hexadecimal',
      'string.max': 'Transaction hash exceeds maximum length',
    }),
});

const addressParamSchema = Joi.object({
  address: Joi.string()
    .pattern(/^mall1[a-z0-9]{38,58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid Mallchain address format',
    }),
});

// Send mallcoins from one wallet to another
router.post('/mallcoins',
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.transfer),
  asyncHandler(sendCtrl.sendMallcoins)
);

// Pay for something using mallcoins
router.post('/payment',
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.mallcoinPayment),
  asyncHandler(sendCtrl.processPayment)
);

// Get transaction status
router.get('/status/:txHash', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getTransactionStatus)
);

// Get account metadata (account number / sequence) for signing
router.get('/account/:address', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getAccountInfo)
);

// Mallcoin (MLCNS) wallet-to-wallet
router.get('/gas-balance/:address', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getGasBalance)
);

router.get('/mlcns/balance/:address', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getMlcnsBalance)
);

router.get('/mlcns/price', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getMlcnsPrice)
);

router.get('/mlcns/validate/:address', 
  preventNoSQLInjection,
  asyncHandler(sendCtrl.validateMlcnsRecipient)
);

router.post('/mlcns/transfer',
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.mlcnsTransfer),
  asyncHandler(sendCtrl.transferMlcns)
);

module.exports = router;
