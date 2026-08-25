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

module.exports = requireAuth();
