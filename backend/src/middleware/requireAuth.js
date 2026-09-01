/**
 * Shared JWT auth-middleware factory backing auth.js (plain requireAuth()),
 * adminAuth.js's requireAdmin (requireAuth('admin')) and requireSuperAdmin
 * (requireAuth('superadmin')). The three previously duplicated ~85% of this
 * logic; this keeps one copy while preserving each one's exact prior
 * behavior (banned/role checks only apply for the two admin variants,
 * markActiveToday only fires for the plain-user variant).
 */
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { markActiveToday } = require('../utils/activityTracker');
const { getCachedUser, setCachedUser } = require('./authCache');
const { isRevoked } = require('./tokenDenylist');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET must be configured for authentication');
}

function requireAuth(role) {
  return async function authMiddleware(req, res, next) {
    if (!JWT_SECRET) return res.status(500).json({ error: 'server configuration error' });

    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing auth token' });

    const parts = auth.split(' ');
    if (parts.length !== 2) return res.status(401).json({ error: 'bad auth header' });

    const token = parts[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId || decoded.id;

      // A valid signature only proves the token was genuinely issued — it
      // doesn't mean the session is still meant to be alive. Without this,
      // "log out" only ever cleared the token client-side; the JWT itself
      // stayed usable server-side until it naturally expired.
      if (await isRevoked(decoded)) {
        return res.status(401).json({ error: 'invalid token' });
      }

      let user = await getCachedUser(userId);
      if (!user) {
        user = await User.findById(userId).select('-password');
        if (!user) return res.status(401).json({ error: 'invalid token' });
        await setCachedUser(userId, user);
      }

      // Checked regardless of `role` — a banned user's still-valid JWT
      // previously only got rejected on the admin/superadmin variants
      // (this check lived inside the `if (role)` block below), meaning a
      // banned regular user could keep using every ordinary route (send,
      // withdraw, messaging, ...) with their existing session. The
      // frontend's "frozen" banner (store.state.user.frozen, driven by
      // GET /api/auth/me's `banned` field) was the only thing actually
      // stopping them, which is purely cosmetic against a direct API call.
      if (user.banned) return res.status(403).json({ error: 'account is banned' });

      if (role) {
        if (role === 'admin' && user.role !== 'admin' && user.role !== 'superadmin') {
          return res.status(403).json({ error: 'admin access required' });
        }
        if (role === 'superadmin' && user.role !== 'superadmin') {
          return res.status(403).json({ error: 'superadmin access required' });
        }
      }

      req.user = user;
      req.tokenPayload = decoded; // exposes jti/exp for routes/auth.js's logout handlers
      if (!role) markActiveToday(user._id); // fire-and-forget — feeds the badge streak, never blocks the request
      next();
    } catch (err) {
      console.error(err);
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = requireAuth;
