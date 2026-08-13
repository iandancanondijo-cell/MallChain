const express = require('express');
const router = express.Router();
const blockchainTxCtrl = require('../controllers/blockchainTxController');
const { preventNoSQLInjection, validateQuery, limitPayloadSize } = require('../middleware/inputValidation');
const Joi = require('joi');

// Task 8.6: Apply input validation to blockchain transaction routes
// Query parameter validation schemas
const addressQuerySchema = Joi.object({
  address: Joi.string()
    .pattern(/^mall1[a-z0-9]{38,58}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid Mallchain address format',
    }),
});

const hashQuerySchema = Joi.object({
  hash: Joi.string()
    .hex()
    .uppercase()
    .max(64)
    .optional()
    .messages({
      'string.hex': 'Hash must be hexadecimal',
      'string.max': 'Hash exceeds maximum length',
    }),
});

// Specific routes FIRST (before :hash parameter)
router.get('/blocks', preventNoSQLInjection, blockchainTxCtrl.getRecentBlocks);
router.get('/stats', preventNoSQLInjection, blockchainTxCtrl.getBlockchainStats);
router.get('/address/balance', preventNoSQLInjection, validateQuery(addressQuerySchema), blockchainTxCtrl.getAddressBalance);
router.get('/address/txs', preventNoSQLInjection, validateQuery(addressQuerySchema), blockchainTxCtrl.getAddressBlockchainTxs);
router.get('/sync', preventNoSQLInjection, blockchainTxCtrl.syncBlockchainTxs);
router.get('/all', preventNoSQLInjection, blockchainTxCtrl.getAllBlockchainTxs);

// Parametric route LAST
router.get('/:hash', preventNoSQLInjection, blockchainTxCtrl.getBlockchainTx);

module.exports = router;
