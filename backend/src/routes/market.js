const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/marketController')
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize } = require('../middleware/inputValidation')

// Task 8.6: Apply input validation and sanitization middleware to market routes
// Protect against NoSQL injection and XSS attacks on all endpoints

// GET endpoints - prevent NoSQL injection on queries
router.get('/price', preventNoSQLInjection, ctrl.getMarketPrice)
// Circulating supply × the on-chain price, both read from the chain in the
// same call. The price card had a unit price and no supply figure to multiply
// it by, so it stated no cap at all (backend-handoff-2026-11-09 §2).
router.get('/cap', preventNoSQLInjection, ctrl.getMarketCap)
router.get('/supply', preventNoSQLInjection, ctrl.getTotalSupply)
router.get('/monthly_emissions', preventNoSQLInjection, ctrl.getMonthlyEmissions)
router.get('/monthly_breakdown', preventNoSQLInjection, ctrl.getMonthlyBreakdown)

module.exports = router
