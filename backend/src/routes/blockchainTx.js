const express = require('express');
const router = express.Router();
const blockchainTxCtrl = require('../controllers/blockchainTxController');

// Specific routes FIRST (before :hash parameter)
router.get('/blocks', blockchainTxCtrl.getRecentBlocks);
router.get('/stats', blockchainTxCtrl.getBlockchainStats);
router.get('/address/balance', blockchainTxCtrl.getAddressBalance);
router.get('/address/txs', blockchainTxCtrl.getAddressBlockchainTxs);
router.get('/sync', blockchainTxCtrl.syncBlockchainTxs);
router.get('/all', blockchainTxCtrl.getAllBlockchainTxs);

// Parametric route LAST
router.get('/:hash', blockchainTxCtrl.getBlockchainTx);

module.exports = router;
