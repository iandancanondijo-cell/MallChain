const rateLimit = require('express-rate-limit')

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
 * Create per-user rate limiter using IP address
 */
function createUserLimiter(opts = {}) {
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 30,
    keyGenerator: (req) => {
      // Use IP address as key, fallback to user ID if available
      return req.ip || req.user?.id || req.headers['x-forwarded-for']?.split(',')[0]
    },
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
