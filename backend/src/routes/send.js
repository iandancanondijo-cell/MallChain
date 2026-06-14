const express = require('express');
const router = express.Router();
const sendCtrl = require('../controllers/sendController');
const { validateRequest } = require('../utils/validationSchemas');
const { asyncHandler } = require('../utils/errorHandler');
const schemas = require('../utils/validationSchemas');

// Send mallcoins from one wallet to another
router.post('/mallcoins', validateRequest(schemas.sendMallcoinsSchema), asyncHandler(sendCtrl.sendMallcoins));

// Pay for something using mallcoins
router.post('/payment', validateRequest(schemas.processPaymentSchema), asyncHandler(sendCtrl.processPayment));

// Get transaction status
router.get('/status/:txHash', asyncHandler(sendCtrl.getTransactionStatus));

// Get account metadata (account number / sequence) for signing
router.get('/account/:address', asyncHandler(sendCtrl.getAccountInfo));

// Mallcoin (MLCNS) wallet-to-wallet
router.get('/gas-balance/:address', asyncHandler(sendCtrl.getGasBalance));
router.get('/mlcns/balance/:address', asyncHandler(sendCtrl.getMlcnsBalance));
router.get('/mlcns/price', asyncHandler(sendCtrl.getMlcnsPrice));
router.get('/mlcns/validate/:address', asyncHandler(sendCtrl.validateMlcnsRecipient));
router.post('/mlcns/transfer', asyncHandler(sendCtrl.transferMlcns));

module.exports = router;
