/**
 * Attaches req.user when a valid session is present, and otherwise continues
 * unauthenticated instead of rejecting.
 *
 * Needed for the buy/sell/withdraw status endpoints. Those are deliberately
 * address-keyed relay routes with no auth middleware (the client signs, the
 * backend relays), but their responses carry phone numbers and wallet
 * addresses belonging to whoever holds that record. Making them fully
 * authenticated would break guests polling a checkout; leaving them as-is
 * leaks PII on any shared or leaked id. Optional auth lets each route decide
 * how much to reveal based on whether the caller owns the record.
 *
 * Mirrors requireAuth's token extraction exactly, minus every rejection path.
 * A bad, expired, revoked or absent token is simply "anonymous" here.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getCachedUser } = require('./authCache');
const { isRevoked } = require('./tokenDenylist');

const AUTH_COOKIE_NAME = 'auth_token';
const JWT_SECRET = process.env.JWT_SECRET;

async function optionalAuth(req, res, next) {
  req.user = null;

  try {
    if (!JWT_SECRET) return next();

    const header = req.headers.authorization;
    let token = null;

    if (header) {
      const parts = header.split(' ');
      if (parts.length === 2) token = parts[1];
    } else if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
      token = req.cookies[AUTH_COOKIE_NAME];
    }

    if (!token) return next();

    // Pinned deliberately: verify() without `algorithms` lets the token's own
    // header choose the algorithm.
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const userId = decoded.userId || decoded.id;
    if (!userId) return next();

    if (await isRevoked(decoded)) return next();

    let user = await getCachedUser(userId);
    if (!user) user = await User.findById(userId).select('-password');
    if (!user) return next();

    // A banned account is anonymous for disclosure purposes: it must not keep
    // reading records it could see while in good standing.
    if (user.banned) return next();

    req.user = user;
  } catch {
    // Any verification failure is anonymous, never an error response.
    req.user = null;
  }

  next();
}

module.exports = optionalAuth;
