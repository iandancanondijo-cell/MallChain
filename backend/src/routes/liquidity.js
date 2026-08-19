const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/liquidityController')
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')
const auth = require('../middleware/auth')

// GET /api/liquidity/pools
router.get('/pools', ctrl.getAllPools)

// GET /api/liquidity/pools/:poolId
router.get('/pools/:poolId', ctrl.getPool)

// POST /api/liquidity/add
// Signs and broadcasts a real on-chain MsgAddLiquidity funded by the
// server's own OPERATOR_MNEMONIC — unlike the client-signed staking/send
// flows, the caller never proves ownership of any funds here, so this was
// reachable by anyone to repeatedly drain the operator wallet's balance and
// gas. Require a logged-in user, matching every other endpoint in this
// codebase that moves funds from a server-held account.
router.post('/add', auth, ctrl.addLiquidity)

// POST /api/liquidity/remove
router.post('/remove', auth, ctrl.removeLiquidity)

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
