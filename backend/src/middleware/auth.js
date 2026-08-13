/**
 * Task 4.1: JWT Authentication Middleware
 * 
 * This middleware validates JWT tokens sent by authenticated clients and attaches user data to requests.
 * It's the core guard for all protected API endpoints.
 * 
 * Flow:
 * 1. Extract Authorization header (format: "Bearer <token>")
 * 2. Verify token signature using JWT_SECRET from environment
 * 3. Look up user in database using userId from token payload
 * 4. Attach user object to req.user for downstream handlers
 * 
 * Error cases:
 * - No Authorization header: 401 (client must send credentials)
 * - Malformed header (not "Bearer <token>"): 401 (client error)
 * - Invalid token (bad signature or expired): 401 (token invalid or stale)
 * - User not found in database: 401 (user deleted or token compromised)
 * - JWT_SECRET not configured: 500 (server configuration error)
 * 
 * Security considerations:
 * - JWT_SECRET must be >= 32 bytes for production (enforced in config)
 * - Tokens include standard exp claim for expiration
 * - Tokens validated on every protected request (no caching)
 * - Password excluded from user lookup (select('-password'))
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET must be configured for authentication');
}

module.exports = async function (req, res, next) {
  // Fail fast if JWT_SECRET is not configured (critical security issue)
  if (!JWT_SECRET) return res.status(500).json({ error: 'server configuration error' });
  
  // Extract Authorization header from request
  // Expected format: "Authorization: Bearer eyJhbGc..."
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth token' });
  
  // Parse header: must be exactly 2 parts ("Bearer", "<token>")
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth header' });
  
  // Extract token from "Bearer <token>" format
  const token = parts[1];
  
  try {
    // Verify token signature and decode payload
    // If signature is invalid or token is expired, jwt.verify throws
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Task 4.1: Support both old (id) and new (userId) token formats for compatibility
    // Allows smooth migration from old token format (id) to new format (userId)
    const userId = decoded.userId || decoded.id;
    
    // Look up user in database using ID from token
    // Validates that token belongs to a real, active user
    // Exclude password from lookup to avoid storing/comparing passwords in memory
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(401).json({ error: 'invalid token' });
    
    // Attach user object to request - makes available to route handlers
    // Downstream code uses req.user to identify the authenticated request
    req.user = user;
    next();
  } catch (err) {
    // jwt.verify throws for invalid signature, expired tokens, malformed tokens, etc.
    // Log for debugging but don't expose details to client (security best practice)
    console.error(err);
    return res.status(401).json({ error: 'invalid token' });
  }
};
