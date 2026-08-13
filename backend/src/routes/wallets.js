const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/walletsController');
const { preventNoSQLInjection } = require('../middleware/inputValidation');

// Task 8.6: Apply NoSQL injection prevention middleware to wallet routes
// GET /api/network/wallets
router.get('/wallets', preventNoSQLInjection, ctrl.getAllWalletsWithMallcoins);

module.exports = router;
