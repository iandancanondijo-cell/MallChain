const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../utils/errorHandler')

const {
  getEmissionState,
  getTransactions,
  getMarketTrades,
  getMarketPrice,
  getStats,
  getHealth,
} = require('../controllers/blockchainController')

// Proxy endpoints to blockchain REST API
router.get('/health', asyncHandler(getHealth))
router.get('/stats', asyncHandler(getStats))
router.get('/emission-state', asyncHandler(getEmissionState))
router.get('/transactions', asyncHandler(getTransactions))
router.get('/market/trades', asyncHandler(getMarketTrades))
router.get('/market/price', asyncHandler(getMarketPrice))

module.exports = router
