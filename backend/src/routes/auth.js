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
const auth = require('../middleware/auth');
const passport = require('passport');
const { validateInput, preventNoSQLInjection, sanitizeInputs, limitPayloadSize, schemas } = require('../middleware/inputValidation');
const { limiters } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../utils/errorHandler');
const { requireVerifiedKyc, kycVerdict } = require('../middleware/requireKyc');
const oauthState = require('../utils/oauthState');

/**
 * Task 4.1: POST /api/auth/register
 * Registers new user with email and password
 * 
 * Middleware stack:
 * - Limit to 100KB payload (email + password shouldn't exceed this)
 * - Sanitize inputs (remove HTML tags)
 * - Validate email format, password strength (uppercase, lowercase, numbers)
 * - THEN the auth rate limiter, so a rejected request only counts as an auth
 *   attempt once it is well-formed.
 *
 * Ordering note (registration "rate limit exceeded" fix): limiters.auth used to
 * run FIRST. With skipSuccessfulRequests it only exempts 2xx responses, so every
 * 400 from validateInput (a mistyped/guessed email, weak password) was counted
 * against the 5-per-15-min-per-IP auth budget — a handful of honest typos would
 * lock a new user out with 429 before they ever entered a correct email. Running
 * the limiter AFTER validation means malformed requests short-circuit at 400 and
 * never draw from the budget; only genuine, well-formed register/login attempts
 * (successes exempt, real failures counted) do. Brute-force protection is
 * unchanged, since an attacker still has to send schema-valid requests to reach
 * the controller at all.
 */
router.post('/register',
  limitPayloadSize(0.1),
  sanitizeInputs,
  validateInput(schemas.auth.register),
  limiters.auth,
  asyncHandler(authCtrl.register)
);

/**
 * GET /api/auth/email-exists?email=user@example.com
 * Checks if an email is already registered. Returns { exists: true/false }.
 * Used by frontend registration form to show real-time validation.
 */
router.get('/email-exists',
  limiters.auth,
  preventNoSQLInjection,
  sanitizeInputs,
  asyncHandler(async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });
    const User = require('../models/user');
    const { blindIndex } = require('../utils/fieldEncryption');
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email_blind: blindIndex(normalizedEmail) });
    res.json({ exists: !!existing });
  })
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
  limiters.auth,
  asyncHandler(authCtrl.login)
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
  limiters.auth,
  asyncHandler(authCtrl.registerUsername)
);

/**
 * Task 4.1: POST /api/auth/login-username
 * Alternative login with username instead of email
 */
router.post('/login-username',
  limiters.auth,
  limitPayloadSize(0.1),
  preventNoSQLInjection,
  sanitizeInputs,
  validateInput(schemas.auth.loginUsername),
  asyncHandler(authCtrl.loginUsername)
);

/**
 * Task 4.1: GET /api/auth/me
 * Returns current authenticated user profile.
 * Accepts either an Authorization: Bearer header or the httpOnly session
 * cookie — see authController.js's me() (does its own inline jwt.verify
 * rather than the shared auth middleware, so it can support both).
 */
router.get('/me', asyncHandler(authCtrl.me));

/**
 * GET /api/auth/compliance-status
 * Per-user compliance snapshot used by the frontend's ComplianceGates
 * (useComplianceStatus hook). Returns exactly the ComplianceStatus shape
 * the client already consumes: kycStatus/amlStatus/geographicRestriction.
 *
 * Data sources (the real ones, not the legacy /api/compliance/status
 * mocks): kycStatus/verdict come from middleware/requireKyc.js's kycVerdict,
 * the same function the wallet gate answers with; any pending
 * WithdrawalAmlReview flips amlStatus to 'under_review' and a rejected one to
 * 'flagged'. Geographic restriction follows the same Cloudflare header +
 * RESTRICTED_COUNTRIES list as compliance.js.
 *
 * Shape: { kycStatus, verdict, amlStatus, geographicRestriction, ... } where
 * verdict is the machine-readable four-value answer — 'verified' |
 * 'rejected' | 'pending' | 'not_submitted' — that a client is meant to branch
 * on instead of reading kycLevel and kycStatus together and hoping they agree.
 */
router.get('/compliance-status', auth, asyncHandler(async (req, res) => {
  const User = require('../models/user');
  const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');

  const userId = req.user?._id || req.user?.id;
  const user = await User.findById(userId).select('kycLevel tosAcceptedAt privacyAcceptedAt createdAt').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  // The same derivation the wallet gate uses (middleware/requireKyc.js), which
  // is what makes this endpoint and a blocked wallet action unable to disagree
  // about where the account stands. It used to be re-implemented here as an
  // inline ternary over the latest non-draft KYC record plus kycLevel — the
  // handoff §6 complaint that a verdict was a *combination* of fields rather
  // than a field. `verdict` is the four-value answer clients should branch on;
  // `kycStatus` keeps its existing vocabulary for current consumers.
  const { kycStatus, verdict } = await kycVerdict(user);

  const pendingAml = await WithdrawalAmlReview.countDocuments({ userId, status: 'pending' });
  const rejectedAml = await WithdrawalAmlReview.countDocuments({ userId, status: 'rejected' });
  const amlStatus = rejectedAml > 0 ? 'flagged' : pendingAml > 0 ? 'under_review' : 'clear';

  const clientCountry = req.headers['cf-ipcountry'] || 'UNKNOWN';
  const restrictedList = (process.env.RESTRICTED_COUNTRIES || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const geographicRestriction = restrictedList.includes(String(clientCountry).toUpperCase());

  return res.json({
    ok: true,
    kycLevel: user.kycLevel || 0,
    kycStatus,
    verdict,
    amlStatus,
    geographicRestriction,
    restrictedReason: geographicRestriction
      ? `Mallchain services are not available in ${clientCountry}`
      : undefined,
    tosAccepted: !!user.tosAcceptedAt,
    privacyAccepted: !!user.privacyAcceptedAt,
    lastVerified: Date.now(),
  });
}));

/**
 * POST /api/auth/link-wallet — associate the logged-in account with an
 * on-chain address (see authController.js's linkWallet for the full
 * rationale). Frontend calls this once after wallet creation/import.
 *
 * Uses the shared auth middleware (rather than an inline jwt.verify, like
 * this file's other non-me routes used to) so it accepts the httpOnly
 * session cookie, gets CSRF-checked when cookie-authenticated, and honors
 * the token denylist/banned-user checks like every other protected route.
 *
 * requireVerifiedKyc: this is the only endpoint that writes
 * User.walletAddress, so it is where "no wallet before verification" has to
 * hold. Client-side doors can be bypassed by anyone who can send an HTTP
 * request; this cannot. 403 + error: 'kyc_verification_required' — see
 * middleware/requireKyc.js for the verdict and why it is not `kycLevel >= 1`.
 *
 * allowSameAddress keeps one thing the rule was never about: an unverified
 * account re-linking the address it already holds. The cipher wall disconnects
 * the local copy after three wrong attempts, and that owner must not be told
 * they cannot get their own wallet back. No new address can pass this check.
 */
router.post('/link-wallet', auth, requireVerifiedKyc({ allowSameAddress: true }), asyncHandler(authCtrl.linkWallet));

/**
 * POST /api/auth/refresh — silently renews the session (new JWT/cookie,
 * new expiry) without requiring a full re-login. authService.ts's
 * isSessionExpiringSoon() drives when the frontend calls this.
 */
router.post('/refresh', auth, asyncHandler(authCtrl.refresh));

/**
 * POST /api/auth/logout — revokes this token server-side (see
 * middleware/tokenDenylist.js). Uses the shared auth middleware (rather
 * than this file's other routes' inline jwt.verify) specifically so
 * req.tokenPayload (jti/exp) is populated for the handler.
 */
router.post('/logout', auth, asyncHandler(authCtrl.logout));

/**
 * POST /api/auth/logout-everywhere — revokes every token issued to this
 * account up to now. Backs SecuritySettings' "Sign Out Everywhere".
 */
router.post('/logout-everywhere', auth, asyncHandler(authCtrl.logoutEverywhere));

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
// utils/passport.js only registers the 'google' strategy when
// GOOGLE_CLIENT_ID/SECRET are set — calling passport.authenticate('google')
// without it registered throws synchronously ("Unknown authentication
// strategy"), which crashed both routes below with a raw 500 rather than a
// message saying Google login just isn't configured in this environment.
function requireGoogleConfigured(req, res, next) {
  if (!passport._strategy('google')) {
    return res.status(501).json({ error: 'Google login is not configured on this server' });
  }
  next();
}
router.get('/google', requireGoogleConfigured, (req, res, next) => {
  // `state` is a fresh random nonce (see utils/oauthState.js). The referral
  // code rides along in the signed cookie the nonce is verified against, so
  // it survives Google's round-trip without making state attacker-chosen.
  const state = oauthState.issue(req, res, req.query.ref);
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

// Runs before passport.authenticate: an invalid state must reject the attempt
// outright, not create or log in a user and then complain.
function requireOAuthState(req, res, next) {
  const { valid, ref } = oauthState.consume(req, res, req.query.state);
  if (!valid) {
    return res.status(400).json({
      error: 'invalid_oauth_state',
      message: 'Google sign-in could not be completed. Please start again.',
    });
  }
  req.oauthReferralCode = ref;
  next();
}

router.get('/google/callback', requireGoogleConfigured, requireOAuthState, passport.authenticate('google', { session: false, failureRedirect: '/' }), asyncHandler(authCtrl.googleCallback));

module.exports = router;
