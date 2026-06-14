const express = require('express');
const router = express.Router();
const vault = require('../controllers/vaultController');
const auth = require('../middleware/auth');

router.get('/', vault.list);
router.get('/:id', vault.get);
// In development allow creating vaults without auth to ease testing.
// Remove `auth` middleware if you want to require auth in production.
router.post('/', auth, vault.create);
router.put('/:id', auth, vault.update);
router.delete('/:id', auth, vault.remove);

module.exports = router;
