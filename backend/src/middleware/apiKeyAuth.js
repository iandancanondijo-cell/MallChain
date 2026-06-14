const crypto = require('crypto')

// Simple API key auth middleware for protecting sensitive endpoints
module.exports = function apiKeyAuth(req, res, next){
  const key = process.env.ADMIN_API_KEY || null
  if (!key) return res.status(500).json({ error: 'admin api key not configured' })
  const got = req.get('x-api-key') || ''
  if (!got) return res.status(401).json({ error: 'missing api key' })
  const gotBuf = Buffer.from(got)
  const keyBuf = Buffer.from(key)
  if (gotBuf.length !== keyBuf.length || !crypto.timingSafeEqual(gotBuf, keyBuf)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}
