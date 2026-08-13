/**
 * Task 8.6: Authentication Routes with Input Validation
 * 
 * All auth routes apply a security middleware stack to prevent common attacks:
 * 1. limitPayloadSize(0.1): Reject requests > 100KB (prevents memory exhaustion)
 * 2. preventNoSQLInjection: Detect MongoDB operators ($ne, $where, etc.)
 * 3. sanitizeInputs: Remove HTML tags and suspicious characters
 * 4. validateInput(schema): Validate against Joi schema and normalize data
 * 
 * This defense-in-depth approach ensures:
 * - Malformed requests are rejected early
 * - Injection attacks are detected
 * - Data is normalized (lowercase email, trimmed strings, etc.)
 * - Only valid data reaches the controller
 */

const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const passport = require('passport');
const { validateInput, preventNoSQLInjection, sanitizeInputs, limitPayloadSize, schemas } = require('../middleware/inputValidation');

/**
 * Task 4.1: POST /api/auth/register
 * Registers new user with email and password
 * 
 * Middleware stack:
 * - Limit to 100KB payload (email + password shouldn't exceed this)
 * - Prevent NoSQL injection in email/password fields
 * - Sanitize inputs (remove HTML tags)
 * - Validate email format, password strength (uppercase, lowercase, numbers)
 */
router.post('/register', 
  limitPayloadSize(0.1),
  sanitizeInputs,
  validateInput(schemas.auth.register),
  authCtrl.register
);

/**
 * Task 4.1: POST /api/auth/login
 * Authenticates user with email and password
 * Returns JWT token if credentials valid
 * 
 * Security flow:
 * - Input validation prevents malformed login attempts
 * - Database lookup validates credentials
 * - JWT token generated if successful (in authCtrl.login)
 * - Token sent to client for storage in localStorage
 */
router.post('/login', 
  limitPayloadSize(0.1),
  sanitizeInputs,
  validateInput(schemas.auth.login),
  authCtrl.login
);

/**
 * Task 4.1: POST /api/auth/register-username
 * Alternative registration with username instead of email
 */
router.post('/register-username', 
  limitPayloadSize(0.1),
  preventNoSQLInjection,
  sanitizeInputs,
  validateInput(schemas.auth.registerUsername),
  authCtrl.registerUsername
);

/**
 * Task 4.1: POST /api/auth/login-username
 * Alternative login with username instead of email
 */
router.post('/login-username', 
  limitPayloadSize(0.1),
  preventNoSQLInjection,
  sanitizeInputs,
  validateInput(schemas.auth.loginUsername),
  authCtrl.loginUsername
);

/**
 * Task 4.1: GET /api/auth/me
 * Returns current authenticated user profile
 * Requires valid JWT token in Authorization header
 * Protected by auth middleware (applied in controller or route)
 */
router.get('/me', authCtrl.me);

/**
 * Task 4.1: Google OAuth routes
 * 
 * OAuth 2.0 authentication flow:
 * 1. GET /api/auth/google: Redirects to Google login (user clicks "Login with Google")
 * 2. GET /api/auth/google/callback: Google redirects back with auth code
 *    Passport exchanges code for user info
 *    User created/updated in database
 *    JWT token generated and returned
 * 
 * Security notes:
 * - OAuth flows handle CSRF via state parameters in the OAuth protocol itself
 * - Additional CSRF middleware not required for OAuth callbacks
 * - Passport handles secure code exchange with Google
 */
router.get('/google', passport.authenticate('google', { scope: ['profile','email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/' }), authCtrl.googleCallback);

module.exports = router;
