const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/marketController')

// GET /api/market/price
router.get('/price', ctrl.getMarketPrice)
// GET /api/market/supply
router.get('/supply', ctrl.getTotalSupply)
// GET /api/market/monthly_emissions
router.get('/monthly_emissions', ctrl.getMonthlyEmissions)
// GET /api/market/monthly_breakdown
router.get('/monthly_breakdown', ctrl.getMonthlyBreakdown)

module.exports = router
