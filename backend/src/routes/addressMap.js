const express = require('express')
const router = express.Router()
const AddressMap = require('../models/AddressMap')

// Get mapping by hex address
// Auto-generate bech32 for any hex address if mapping does not exist
const bech32 = require('bech32')
router.get('/map/:hex', async (req, res) => {
  try {
    const hex = (req.params.hex || '').toLowerCase()
    if (!hex) return res.status(400).json({ ok: false, error: 'missing hex address' })
    let m = await AddressMap.findOne({ hex }).lean()
    if (!m) {
      // Auto-generate bech32 address (prefix mall, 20 bytes from hex)
      let hexStr = hex.replace(/^0x/, '')
      if (hexStr.length > 40) hexStr = hexStr.slice(-40)
      while (hexStr.length < 40) hexStr = '0' + hexStr
      const words = bech32.toWords(Buffer.from(hexStr, 'hex'))
      const bech32Addr = bech32.encode('mall', words)
      // Save mapping for future
      const doc = await AddressMap.findOneAndUpdate({ hex }, { hex, bech32: bech32Addr }, { upsert: true, new: true, setDefaultsOnInsert: true })
      m = { hex, bech32: bech32Addr }
    }
    return res.json({ ok: true, hex: m.hex, bech32: m.bech32 })
  } catch (e) {
    console.error('address map get error', e)
    return res.status(500).json({ ok: false, error: String(e) })
  }
})

// Create or update mapping
router.post('/map', async (req, res) => {
  try {
    const { hex, bech32 } = req.body || {}
    if (!hex || !bech32) return res.status(400).json({ ok: false, error: 'missing hex or bech32' })
    const key = hex.toLowerCase()
    const doc = await AddressMap.findOneAndUpdate({ hex: key }, { hex: key, bech32 }, { upsert: true, new: true, setDefaultsOnInsert: true })
    return res.json({ ok: true, mapping: doc })
  } catch (e) {
    console.error('address map upsert error', e)
    return res.status(500).json({ ok: false, error: String(e) })
  }
})

module.exports = router
