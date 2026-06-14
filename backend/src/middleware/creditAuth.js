// Simple API-key or session-based auth for sensitive credit operations
module.exports = function creditAuth(req, res, next){
  const apiKey = process.env.CREDIT_API_KEY || null
  if (req.user) return next() // authenticated via passport
  if (!apiKey) return res.status(401).json({ error: 'no auth configured' })
  const provided = req.get('x-credit-key') || req.get('authorization') || ''
  if (!provided) return res.status(401).json({ error: 'missing api key' })
  // allow 'Bearer <key>' or raw key
  const key = provided.startsWith('Bearer ') ? provided.slice(7).trim() : provided.trim()
  if (key !== apiKey) return res.status(403).json({ error: 'invalid api key' })
  return next()
}
