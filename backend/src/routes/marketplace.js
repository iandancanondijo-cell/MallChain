/**
 * Escrow route exposure for external marketplace integration — see the
 * header comment in controllers/marketplaceEscrowController.js for the
 * important caveat about x/marketplace's on-chain registration status.
 */
const express = require('express');
const router = express.Router();
const escrowController = require('../controllers/marketplaceEscrowController');

router.post('/escrow/broadcast', escrowController.broadcast);
router.get('/escrow/:id', escrowController.getEscrow);
router.get('/escrow', escrowController.listEscrows);

module.exports = router;
