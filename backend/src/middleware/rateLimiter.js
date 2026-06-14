const rateLimit = require('express-rate-limit')

function createLimiter(opts = {}){
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 60,
    standardHeaders: true,
    legacyHeaders: false
  }, opts || {}))
}

module.exports = { createLimiter }
