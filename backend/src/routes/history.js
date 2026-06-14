const express = require('express')
const router = express.Router()
const axios = require('axios')

const CHAIN_REST = process.env.MALL_CHAIN_REST || process.env.CHAIN_REST || 'http://127.0.0.1:1317'

// GET /api/history/:address
router.get('/:address', async (req, res) => {
  try {
    const address = req.params.address
    // Query txs involving this address (sent or received)
    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?events=message.sender='${address}'&events=transfer.recipient='${address}'&order_by=ORDER_BY_DESC&limit=50`
    const r = await axios.get(url, { timeout: 10000 })
    const txs = (r.data.txs || []).map(tx => {
      // Find amount, to/from, block, hash, timestamp, confirmations
      const msg = tx.body && tx.body.messages && tx.body.messages[0] || {}
      const from = msg.from_address || msg.creator || ''
      const to = msg.to_address || msg.to || ''
      const amount = (msg.amount && msg.amount[0] && msg.amount[0].amount) || msg.amount || ''
      const type = from === address ? 'outgoing' : 'incoming'
      const block = tx.height
      const txHash = tx.txhash
      const timestamp = tx.timestamp || ''
      return { type, from, to, amount, block, txHash, timestamp }
    })
    // Get latest block for confirmation count
    const blockUrl = `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`
    const blockRes = await axios.get(blockUrl)
    const latestHeight = Number(blockRes.data.block.header.height)
    txs.forEach(tx => {
      tx.confirmations = tx.block ? (latestHeight - Number(tx.block) + 1) : 0
    })
    res.json({ txs })
  } catch (e) {
    console.error('history fetch error', e && e.message ? e.message : e)
    res.status(500).json({ error: 'Failed to fetch on-chain history', details: String(e) })
  }
})

module.exports = router
