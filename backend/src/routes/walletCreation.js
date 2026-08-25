const express = require('express');
const router = express.Router();
const walletCreationController = require('../controllers/walletCreationController');

// create/validate/generate-mnemonic were removed — the frontend now derives
// and validates mnemonics entirely client-side (mallchain-os-v14/src/services/wallet.ts),
// so a real seed phrase never has to transit the network. See walletCreationController.js.

// GET /api/wallet/:address - Fetch wallet balance from blockchain
router.get('/:address', walletCreationController.getWalletBalance);

module.exports = router;
