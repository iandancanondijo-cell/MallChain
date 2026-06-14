const express = require('express')
const router = express.Router()
const axios = require('axios')

const CHAIN_REST = process.env.MALL_CHAIN_REST || process.env.CHAIN_REST || 'http://127.0.0.1:1317'

router.get('/health', (_req, res) => res.json({ ok: true }))

router.get('/balance/:address', async (req, res) => {
  try {
    const url = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${req.params.address}`
    const r = await axios.get(url, { timeout: 5000 })
    const data = r.data || {}
    if (data && data.balances && data.balances.length) {
      const found = data.balances.find(b => /mlc/i.test(b.denom)) || data.balances[0]
      const amount = (found && found.amount) ? found.amount : '0'
      return res.json({ balance: amount })
    }
    return res.json({ balance: '0' })
  } catch (e) {
    console.error('mallwallet REST balance error', e && e.message ? e.message : e)
    try {
      res.json({ balance: '0' })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
})

module.exports = router
