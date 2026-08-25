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

      let user = await getCachedUser(userId);
      if (!user) {
        user = await User.findById(userId).select('-password');
        if (!user) return res.status(401).json({ error: 'invalid token' });
        await setCachedUser(userId, user);
      }

      if (role) {
        if (user.banned) return res.status(403).json({ error: 'account is banned' });
        if (role === 'admin' && user.role !== 'admin' && user.role !== 'superadmin') {
          return res.status(403).json({ error: 'admin access required' });
        }
        if (role === 'superadmin' && user.role !== 'superadmin') {
          return res.status(403).json({ error: 'superadmin access required' });
        }
      }

      req.user = user;
      if (!role) markActiveToday(user._id); // fire-and-forget — feeds the badge streak, never blocks the request
      next();
    } catch (err) {
      console.error(err);
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

module.exports = requireAuth;
