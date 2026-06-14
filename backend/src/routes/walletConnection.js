const express = require('express');
const router = express.Router();
const walletCtrl = require('../controllers/walletConnectionController');

/**
 * POST /api/wallet/connect
 * Connect to a wallet by address, private key, or seed phrase
 * Body: { address, method: 'address' | 'privateKey' | 'seedPhrase' }
 */
router.post('/connect', walletCtrl.connectWallet);

/**
 * POST /api/wallet/validate
 * Validate a wallet address without full connection
 * Body: { address }
 */
router.post('/validate', walletCtrl.validateAddress);

/**
 * GET /api/wallet/balance/:address
 * Get balance for a wallet address
 */
router.get('/balance/:address', walletCtrl.getWalletBalance);

module.exports = router;
