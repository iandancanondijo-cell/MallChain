const express = require('express');
const router = express.Router();
const walletCreationController = require('../controllers/walletCreationController');

// POST /api/wallet/create - Create a new wallet from mnemonic
router.post('/create', walletCreationController.createWallet);

// POST /api/wallet/validate - Validate a mnemonic phrase
router.post('/validate', walletCreationController.validateMnemonic);

// POST /api/wallet/generate-mnemonic - Generate a new BIP39 mnemonic phrase
router.post('/generate-mnemonic', walletCreationController.generateMnemonic);

// GET /api/wallet/:address - Fetch wallet balance from blockchain
router.get('/:address', walletCreationController.getWalletBalance);

module.exports = router;
