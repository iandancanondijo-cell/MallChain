const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/liquidityController')

// GET /api/liquidity/pools
router.get('/pools', ctrl.getAllPools)

// GET /api/liquidity/pools/:poolId
router.get('/pools/:poolId', ctrl.getPool)

// POST /api/liquidity/add
router.post('/add', ctrl.addLiquidity)

// POST /api/liquidity/remove
router.post('/remove', ctrl.removeLiquidity)

// GET /api/liquidity/position
router.get('/position', ctrl.getUserPosition)

module.exports = router
