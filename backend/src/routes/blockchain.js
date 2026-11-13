const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../utils/errorHandler')
const { preventNoSQLInjection } = require('../middleware/inputValidation')

const {
  getEmissionState,
  getTransactions,
  getMarketTrades,
  getMarketPrice,
  getStats,
  getHealth,
} = require('../controllers/blockchainController')

const { getOverview } = require('../controllers/networkOverviewController')

// Task 8.6: Apply NoSQL injection prevention middleware to all blockchain data endpoints
// Proxy endpoints to blockchain REST API
//
// /overview must stay mounted alongside /health and /stats: it is the single
// aggregated feed public pages (the landing status table) poll instead of
// firing all three of those per request. See networkOverviewController.js for
// why the per-source status shape matters.
router.get('/overview', preventNoSQLInjection, asyncHandler(getOverview))
router.get('/health', preventNoSQLInjection, asyncHandler(getHealth))
router.get('/stats', preventNoSQLInjection, asyncHandler(getStats))
router.get('/emission-state', preventNoSQLInjection, asyncHandler(getEmissionState))
router.get('/transactions', preventNoSQLInjection, asyncHandler(getTransactions))
router.get('/market/trades', preventNoSQLInjection, asyncHandler(getMarketTrades))
router.get('/market/price', preventNoSQLInjection, asyncHandler(getMarketPrice))

module.exports = router
