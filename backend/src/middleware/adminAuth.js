const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET must be configured for authentication');
}

/**
 * Admin auth middleware - requires valid JWT + admin or superadmin role.
 * Attaches req.user with the full user document.
 */
async function requireAdmin(req, res, next) {
  if (!JWT_SECRET) return res.status(500).json({ error: 'server configuration error' });

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth token' });

  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth header' });

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'invalid token' });
    if (user.banned) return res.status(403).json({ error: 'account is banned' });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'admin access required' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'invalid token' });
  }
}

/**
 * Superadmin auth middleware - requires valid JWT + superadmin role only.
 */
async function requireSuperAdmin(req, res, next) {
  if (!JWT_SECRET) return res.status(500).json({ error: 'server configuration error' });

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth token' });

  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth header' });

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'invalid token' });
    if (user.banned) return res.status(403).json({ error: 'account is banned' });
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'superadmin access required' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = { requireAdmin, requireSuperAdmin };
