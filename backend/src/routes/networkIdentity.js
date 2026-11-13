const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../utils/errorHandler')
const { getNetworkIdentity } = require('../controllers/networkIdentityController')

// GET /api/network — the chain's identity, answered by the chain.
//
// Public and unauthenticated on purpose: a header chip that names the network
// is shown to signed-out visitors too, and the answer contains nothing but
// public chain parameters. See networkIdentityController.js for why this
// exists instead of every surface reading its own build flag.
router.get('/', asyncHandler(getNetworkIdentity))

module.exports = router
