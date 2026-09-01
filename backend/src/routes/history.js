const express = require('express')
const router = express.Router()
const chainClient = require('../utils/chainClient')
const { isValidAddress } = require('../services/mallcoinService')
const { limiters } = require('../middleware/rateLimiter')
const logger = require('../utils/logger')
const { getCacheService } = require('../services/cacheService')

const CHAIN_REST = process.env.MALL_CHAIN_REST || process.env.CHAIN_REST || 'http://127.0.0.1:1317'

/**
 * Cosmos tx-search REST only supports AND across multiple `events` params —
 * `events=message.sender='X'&events=transfer.recipient='X'` requires BOTH
 * to match the same tx, which returns nothing for a wallet that isn't its
 * own counterparty. Sent and received are fetched as two separate queries
 * and unioned (deduped by txhash) instead.
 */
async function fetchAddressTxs(address, { limit = 50 } = {}) {
  const sentUrl = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?events=${encodeURIComponent(`message.sender='${address}'`)}&order_by=ORDER_BY_DESC&limit=${limit}`
  const recvUrl = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?events=${encodeURIComponent(`transfer.recipient='${address}'`)}&order_by=ORDER_BY_DESC&limit=${limit}`

  const [sentRes, recvRes] = await Promise.all([
    chainClient.get(sentUrl, { timeout: 10000 }).catch(() => ({ data: { txs: [] } })),
    chainClient.get(recvUrl, { timeout: 10000 }).catch(() => ({ data: { txs: [] } })),
  ])

  const byHash = new Map()
  for (const tx of [...(sentRes.data.txs || []), ...(recvRes.data.txs || [])]) {
    if (tx && tx.txhash) byHash.set(tx.txhash, tx)
  }

  return Array.from(byHash.values())
    .sort((a, b) => Number(b.height) - Number(a.height))
    .slice(0, limit)
}

function mapTx(tx, address) {
  const msg = (tx.body && tx.body.messages && tx.body.messages[0]) || {}
  const from = msg.from_address || msg.creator || ''
  const to = msg.to_address || msg.to || ''
  const amount = (msg.amount && msg.amount[0] && msg.amount[0].amount) || msg.amount || ''
  const type = from === address ? 'outgoing' : 'incoming'
  return { type, from, to, amount, block: tx.height, txHash: tx.txhash, timestamp: tx.timestamp || '' }
}

// Every paginated history fetch used to cost its own /blocks/latest RPC
// call just to compute a confirmation count — the chain only produces a new
// block every few seconds, so a 2s cache turns a request storm into at most
// one real chain call per block.
async function getLatestHeight() {
  const fetchHeight = async () => {
    const blockRes = await chainClient.get(`${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`, { timeout: 10000 })
    return Number(blockRes.data.block.header.height)
  }
  const cache = getCacheService()
  if (!cache) return fetchHeight()
  return cache.getOrSet('chain:latest_height', fetchHeight, 2)
}

// GET /api/history/performance?address=mall1...&days=30
// Must stay defined before GET /:address — an address-shaped param route
// would otherwise swallow this path (Express matches routes in registration
// order, and "performance" is itself a valid-looking path segment).
router.get('/performance', limiters.lenient, async (req, res) => {
  try {
    const address = req.query.address
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'invalid or missing address' })
    }
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90)

    const rawTxs = await fetchAddressTxs(address, { limit: 200 })
    const txs = rawTxs.map(tx => mapTx(tx, address))

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const buckets = new Map() // 'YYYY-MM-DD' -> { date, inflow, outflow }
    for (const tx of txs) {
      if (!tx.timestamp) continue
      const t = new Date(tx.timestamp).getTime()
      if (Number.isNaN(t) || t < cutoff) continue
      const day = tx.timestamp.slice(0, 10)
      const amt = Number(tx.amount) || 0
      const bucket = buckets.get(day) || { date: day, inflow: 0, outflow: 0 }
      if (tx.type === 'incoming') bucket.inflow += amt
      else bucket.outflow += amt
      buckets.set(day, bucket)
    }

    let cumulativeNet = 0
    const series = Array.from(buckets.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(b => {
        const net = b.inflow - b.outflow
        cumulativeNet += net
        return { ...b, net, cumulativeNet }
      })

    res.json({ address, days, series })
  } catch (e) {
    logger.error('history', 'performance aggregation failed', e)
    res.status(500).json({ error: 'Failed to compute wallet performance', details: e && e.message ? e.message : String(e) })
  }
})

// GET /api/history/:address
router.get('/:address', limiters.lenient, async (req, res) => {
  try {
    const address = req.params.address
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'invalid address' })
    }

    const rawTxs = await fetchAddressTxs(address, { limit: 50 })
    const txs = rawTxs.map(tx => mapTx(tx, address))

    const latestHeight = await getLatestHeight()
    txs.forEach(tx => {
      tx.confirmations = tx.block ? (latestHeight - Number(tx.block) + 1) : 0
    })
    res.json({ txs })
  } catch (e) {
    logger.error('history', 'history fetch error', e)
    res.status(500).json({ error: 'Failed to fetch on-chain history', details: e && e.message ? e.message : String(e) })
  }
})

module.exports = router
