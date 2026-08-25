/**
 * Admin/superadmin auth middleware - valid JWT + role check. Attaches
 * req.user with the full user document. Shares its implementation with
 * auth.js via requireAuth.js — see that file for the token/lookup/cache
 * logic.
 */
const requireAuth = require('./requireAuth');

const requireAdmin = requireAuth('admin');
const requireSuperAdmin = requireAuth('superadmin');

module.exports = { requireAdmin, requireSuperAdmin };
