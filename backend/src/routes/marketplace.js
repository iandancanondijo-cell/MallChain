/**
 * Escrow route exposure for external marketplace integration — see the
 * header comment in controllers/marketplaceEscrowController.js for the
 * important caveat about x/marketplace's on-chain registration status.
 *
 * `/catalog` is the storefront's product listing surface (Mongo, off-chain
 * discovery) and sits beside these escrow routes on purpose: a buyer browses
 * the catalog, then the cart settles through MsgCreateEscrow below. See
 * routes/marketplaceCatalog.js for why the catalog is not on-chain.
 *
 * `/orders` is the buyer's account-side receipt for a settled purchase
 * (routes/marketplaceOrders.js): the order id is server-issued, and the
 * amount/seller/buyer it stores are cross-checked against the escrow above
 * whenever the node answers.
 */
const express = require('express');
const router = express.Router();
const escrowController = require('../controllers/marketplaceEscrowController');

router.use('/catalog', require('./marketplaceCatalog'));
router.use('/orders', require('./marketplaceOrders'));

router.post('/escrow/broadcast', escrowController.broadcast);
router.get('/escrow/:id', escrowController.getEscrow);
router.get('/escrow', escrowController.listEscrows);

module.exports = router;
