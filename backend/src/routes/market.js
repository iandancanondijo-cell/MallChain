const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/marketController')
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize } = require('../middleware/inputValidation')

// Task 8.6: Apply input validation and sanitization middleware to market routes
// Protect against NoSQL injection and XSS attacks on all endpoints

// GET endpoints - prevent NoSQL injection on queries
router.get('/price', preventNoSQLInjection, ctrl.getMarketPrice)
router.get('/supply', preventNoSQLInjection, ctrl.getTotalSupply)
router.get('/monthly_emissions', preventNoSQLInjection, ctrl.getMonthlyEmissions)
router.get('/monthly_breakdown', preventNoSQLInjection, ctrl.getMonthlyBreakdown)

module.exports = router
