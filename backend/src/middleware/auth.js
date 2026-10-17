/**
 * Task 4.1: JWT Authentication Middleware
 *
 * Validates JWT tokens sent by authenticated clients and attaches the user
 * document to req.user. Core guard for all protected API endpoints.
 *
 * Shares its implementation with adminAuth.js's requireAdmin/requireSuperAdmin
 * via requireAuth.js — see that file for the token/lookup/cache logic.
 */
const requireAuth = require('./requireAuth');

const authMiddleware = requireAuth();

// Exposed as both default and named export so route files can use either
// `const auth = require('../middleware/auth');` (most of the codebase)
// or `const { requireAuth } = require('../middleware/auth');` (a few files
// like walletPin.js, adminConfig.js) — without breaking the other style.
module.exports = authMiddleware;
module.exports.requireAuth = authMiddleware;
