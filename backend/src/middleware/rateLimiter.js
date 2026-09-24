const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

/**
 * Create a generic rate limiter
 */
function createLimiter(opts = {}){
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 60,
    standardHeaders: true,
    legacyHeaders: false
  }, opts || {}))
}

/**
 * Create per-endpoint rate limiters with different tiers
 */
const limiters = {
  // Strict limits for sensitive operations
  strict: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per 15 minutes
    message: { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }
  }),
  
  // Standard limits for regular operations
  standard: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }
  }),
  
  // Lenient limits for read operations
  lenient: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 requests per 15 minutes
    message: { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }
  }),
  
  // Very strict for authentication
  auth: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per 15 minutes
    skipSuccessfulRequests: true,
    message: { error: 'rate_limit_exceeded', message: 'Too many authentication attempts. Please try again later.' }
  }),
  
  // Strict for financial operations
  financial: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per 15 minutes
    message: { error: 'rate_limit_exceeded', message: 'Too many financial operations. Please try again later.' }
  })
}

/**
 * Rate limiter keyed by account identity (JWT user id, or — for this app's
 * client-signs/backend-just-broadcasts financial routes, which run with no
 * auth middleware at all, so req.user is never populated there — the
 * wallet address the request is signing from). Falls back to IP only when
 * neither is present (fully anonymous requests).
 *
 * Was previously prioritized IP first with user id as a "fallback" that
 * req.ip (virtually always present) meant never actually happened — purely
 * IP-based limiting is bypassable by rotating source IPs (proxy farms,
 * botnets) against a single account/wallet, which this closes for the
 * routes that key on it.
 */
function accountKeyGenerator(req) {
  const body = req.validatedBody || req.body || {}
  return (
    req.user?.id ||
    body.from ||
    body.fromAddress ||
    body.buyerAddress ||
    body.buyer ||
    body.address ||
    ipKeyGenerator(req) ||
    req.headers['x-forwarded-for']?.split(',')[0]
  )
}

function createUserLimiter(opts = {}) {
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 30,
    keyGenerator: accountKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limit_exceeded', message: 'Too many requests from your account. Please try again later.' }
  }, opts || {}))
}

module.exports = {
  createLimiter,
  limiters,
  createUserLimiter
}
