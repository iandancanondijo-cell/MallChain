const express = require('express');
const router = express.Router();
const vault = require('../controllers/vaultController');
const auth = require('../middleware/auth');

// Vault entries hold encrypted secret blobs (see vaultController's plaintext-
// password guard) — reads were previously unauthenticated while every write
// required `auth`, letting anyone list or fetch any vault entry by id with
// no credentials at all. Require auth uniformly across the resource.
router.get('/', auth, vault.list);
router.get('/:id', auth, vault.get);
router.post('/', auth, vault.create);
router.put('/:id', auth, vault.update);
router.delete('/:id', auth, vault.remove);

module.exports = router;
