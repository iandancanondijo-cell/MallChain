const rateLimit = require('express-rate-limit')
/**
 * IPv6-safe IP key generator. express-rate-limit's built-in ipKeyGenerator
 * throws ERR_ERL_KEY_GEN_IPV6 on IPv6 addresses; req.ip handles both.
 */
function safeIpKeyGenerator(req) {
  return req.ip || ''
}

function skipAdmin(req) {
  if (req.user?.role === 'admin' || req.user?.role === 'superadmin') return true
  if (req.path?.startsWith('/admin/') || req.path?.startsWith('/api/admin/')) return true
  return false
}

function createLimiter(opts = {}){
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 60,
    // Identity first, IP last. Every one of these per-route limiters used to
    // be keyed by IP alone, which is both unfair and ineffective: everyone
    // behind one NAT/carrier gateway shared a budget, while an attacker with
    // a proxy farm got a fresh budget per request. `identify()` below reads
    // the same JWT the auth middleware will read later in the chain, so a
    // signed-in caller is limited per account and anonymous traffic still
    // falls back to per-IP.
    keyGenerator: identityKeyGenerator,
    skip: skipAdmin,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false }
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
  //
  // Raised from 300/15min. This limiter is mounted on /api/blockchain — the
  // dashboard's status/health/stats polling — and 300 per 15 min (20/min) was
  // below what a single logged-in tab does on its own, so ordinary use
  // produced 429s that surfaced as "unavailable" panels. Nowhere looser for
  // abusers: anonymous callers are still capped by the global 300-per-IP
  // floor in createGlobalLimiters(), and this bucket keys on the account.
  lenient: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1200, // 1200 requests per 15 minutes ≈ 80/min per account
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
    req.ip || ''
  )
}

function createUserLimiter(opts = {}) {
  return rateLimit(Object.assign({
    windowMs: opts.windowMs || 60 * 1000,
    max: opts.max || 30,
    keyGenerator: accountKeyGenerator,
    skip: skipAdmin,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message: { error: 'rate_limit_exceeded', message: 'Too many requests from your account. Please try again later.' }
  }, opts || {}))
}

/**
 * Resolve the authenticated identity of a request at the edge — i.e. before
 * any auth middleware has had a chance to run, which is where a global
 * limiter sits.
 *
 * This exists because the global `/api` limiter used to write
 * `req.user?.id || req.ip` as its key. `app.use('/api', globalLimiter)` is
 * mounted ahead of every route, so `req.user` is always undefined there and
 * the "key by account" branch was dead code: every request was bucketed by
 * IP alone. Behind one NAT / corporate / mobile-carrier gateway that means
 * unrelated users share a single budget, and for a signed-in account it means
 * the budget is neither attributable nor enforceable.
 *
 * Only verifies the JWT signature (HMAC) — no DB read, no session lookup — so
 * it stays cheap enough to run on every request. An unverifiable or absent
 * token is simply treated as anonymous.
 */
const JWT_SECRET = process.env.JWT_SECRET
const AUTH_COOKIE_NAME = 'auth_token'

function identify(req) {
  // Memoised per request — the limiters consult this from both skip() and
  // keyGenerator(), and several limiters can run for one request, so
  // jwt.verify must only execute once.
  if (req.__rateLimitIdentity !== undefined) return req.__rateLimitIdentity
  req.__rateLimitIdentity = resolveIdentity(req)
  return req.__rateLimitIdentity
}

/** Rate-limit bucket key: the account when the request proves one, else IP. */
function identityKeyGenerator(req) {
  const id = identify(req)
  return id ? `u:${id.userId}` : safeIpKeyGenerator(req)
}

function resolveIdentity(req) {
  if (!JWT_SECRET) return null
  const auth = req.headers?.authorization
  let token = null
  if (auth && /^Bearer\s/i.test(auth)) token = auth.slice(7).trim()
  else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) token = req.cookies[AUTH_COOKIE_NAME]
  if (!token) return null
  try {
    // eslint-disable-next-line global-require
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, JWT_SECRET)
    const userId = decoded.userId || decoded.id
    return userId ? { userId: String(userId) } : null
  } catch {
    return null
  }
}

/**
 * The global floor for `/api`, split by whether the caller is authenticated.
 *
 * Both buckets stay generous enough for a real signed-in browser session and
 * strict enough to cap burst abuse:
 *
 * - Anonymous traffic: 300 requests / 15 min per IP (≈ 20/min). Unchanged
 *   from the original B9 remediation floor.
 * - Authenticated traffic: 2400 requests / 15 min per *account*, which is
 *   ~6x the measured steady state of one open tab (≈ 35 req/min of dashboard,
 *   price, notification and mines polling). Keying by account rather than IP
 *   is also the security win: an authenticated abuser can no longer buy more
 *   budget by rotating source IPs, and one person's polling can no longer
 *   lock their neighbours out of the API.
 *
 * Per-route limiters (auth, financial, tx, mines) still apply on top of this
 * floor, so nothing sensitive gets looser.
 */
function createGlobalLimiters(opts = {}) {
  const windowMs = opts.windowMs || 15 * 60 * 1000
  const anonMax = opts.anonMax ?? Number(process.env.RATE_LIMIT_ANON_MAX || 300)
  const userMax = opts.userMax ?? Number(process.env.RATE_LIMIT_USER_MAX || 2400)
  const message = { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' }

  const authed = rateLimit({
    windowMs,
    max: userMax,
    keyGenerator: (req) => {
      const id = identify(req)
      return id ? `u:${id.userId}` : ''
    },
    skip: (req) => !identify(req),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message
  })

  const anon = rateLimit({
    windowMs,
    max: anonMax,
    keyGenerator: safeIpKeyGenerator,
    skip: (req) => Boolean(identify(req)) || skipAdmin(req),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    message
  })

  return [authed, anon]
}

module.exports = {
  createLimiter,
  createGlobalLimiters,
  identify,
  limiters,
  createUserLimiter
}
