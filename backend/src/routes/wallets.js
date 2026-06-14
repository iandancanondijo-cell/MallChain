const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/walletsController');

// GET /api/network/wallets
router.get('/wallets', ctrl.getAllWalletsWithMallcoins);

module.exports = router;
