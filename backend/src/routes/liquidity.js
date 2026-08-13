const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/liquidityController')
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')

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

// GET /api/liquidity/activity
router.get('/activity', async (req, res) => {
  try {
    const {
      flow,
      quoteId,
      saleId,
      withdrawalId,
      paymentId,
      limit = 100,
    } = req.query

    const query = {}
    if (flow) query.flow = flow
    if (quoteId) query.quoteId = quoteId
    if (saleId) query.saleId = saleId
    if (withdrawalId) query.withdrawalId = withdrawalId
    if (paymentId) query.paymentId = paymentId

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const items = await LiquidityPoolActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()

    return res.json({ ok: true, items, total: items.length })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

module.exports = router
