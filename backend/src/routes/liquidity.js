const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/liquidityController')
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')
const { requireAdmin } = require('../middleware/adminAuth')

// GET /api/liquidity/pools
router.get('/pools', ctrl.getAllPools)

// GET /api/liquidity/pools/:poolId
router.get('/pools/:poolId', ctrl.getPool)

// POST /api/liquidity/add
// Signs and broadcasts a real on-chain MsgAddLiquidity funded by the
// server's own OPERATOR_MNEMONIC — the caller never proves ownership of any
// funds here (userAddress is just an internal attribution key, not a
// depositor whose funds get moved), so requiring merely *any* logged-in
// user (the previous `auth` gate) still let any account mint itself a real
// operator-funded liquidity position for free. This is genuinely an
// internal treasury/bookkeeping action — the buy flow's automatic seeding
// (routes/buy.js's applyLiquidityAfterCredit) calls addLiquidityToPool()
// directly in-process and never goes through this HTTP route at all — so
// it belongs behind requireAdmin like every other treasury-affecting admin
// endpoint (e.g. GET /activity below), not behind plain `auth`.
//
// Never expose either of these two routes to end users: removeLiquidity
// also does not pay the underlying tokens out to `userAddress`'s own
// wallet — it only debits the operator's own on-chain LP position and this
// internal per-address bookkeeping counter. There is no real user-owned LP
// position anywhere in this system to add to or redeem.
router.post('/add', requireAdmin, ctrl.addLiquidity)

// POST /api/liquidity/remove — see the requireAdmin/no-payout note above.
router.post('/remove', requireAdmin, ctrl.removeLiquidity)

// GET /api/liquidity/position
router.get('/position', ctrl.getUserPosition)

// GET /api/liquidity/activity — financial ledger detail (quote/wallet/amount
// per stage); admin-only, matching every other admin-panel financial view.
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const {
      flow,
      quoteId,
      saleId,
      withdrawalId,
      paymentId,
      walletAddress,
      startDate,
      endDate,
      page = 0,
      limit = 100,
    } = req.query

    const query = {}
    if (flow) query.flow = flow
    if (quoteId) query.quoteId = quoteId
    if (saleId) query.saleId = saleId
    if (withdrawalId) query.withdrawalId = withdrawalId
    if (paymentId) query.paymentId = paymentId
    if (walletAddress) query.walletAddress = walletAddress
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const skip = Math.max(Number(page) || 0, 0) * safeLimit
    const [items, total] = await Promise.all([
      LiquidityPoolActivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      LiquidityPoolActivity.countDocuments(query),
    ])

    return res.json({ ok: true, items, total, page: Number(page) || 0, limit: safeLimit })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

module.exports = router
