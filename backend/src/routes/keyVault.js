const express = require('express');
const router = express.Router();
const keyVaultCtrl = require('../controllers/keyVaultController');
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiter');
const { preventNoSQLInjection, limitPayloadSize } = require('../middleware/inputValidation');

// On-chain encrypted key-recovery vault (x/vault) — distinct from
// routes/vault.js's unrelated authority-approval CRUD store mounted at
// /api/vault. See proto/marketplace/vault/v1/tx.proto for why setup/confirm/
// disable are broadcast as client-signed txs rather than plain API calls:
// the chain must never receive a password or plaintext TOTP secret.
const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

router.get('/blob/:owner', auth, preventNoSQLInjection, keyVaultCtrl.getBlob);

router.post('/broadcast',
  txLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  keyVaultCtrl.broadcast
);

module.exports = router;
