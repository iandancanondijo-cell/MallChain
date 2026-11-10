/**
 * CSRF state for the Google OAuth round-trip.
 *
 * The `state` parameter must be an unpredictable per-attempt nonce that the
 * callback can verify came from this browser. routes/auth.js previously put the
 * referral code in it, which made state fully attacker-chosen and turned the
 * "Continue with Google" flow into a login-CSRF vector, while also dropping the
 * referral if we simply removed it.
 *
 * Both are kept: `state` carries a random nonce, and the nonce plus the
 * referral travel together in a signed, HttpOnly cookie that the callback
 * re-reads. Cookie-based rather than Redis-based so it works across backend
 * instances with no shared store and degrades to "login fails" rather than
 * "CSRF check skipped" when Redis is down.
 */
const crypto = require('crypto');
const { config } = require('../config');

const COOKIE_NAME = 'oauth_state';
const COOKIE_PATH = '/api/auth';
const TTL_MS = 10 * 60 * 1000;

function payloadKey() {
  // Domain-separated so a leaked OAuth-state signing key is not also the
  // session or CSRF secret.
  return crypto
    .createHmac('sha256', config.secrets.session)
    .update('mallchain:oauth-state:v1')
    .digest();
}

function mac(body) {
  return crypto.createHmac('sha256', payloadKey()).update(body).digest('base64url');
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    // 'lax', not 'strict': the callback arrives as a top-level cross-site GET
    // redirect from accounts.google.com, and a Strict cookie is not sent on it.
    sameSite: 'lax',
    path: COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Issues the state nonce for this attempt and stores it (plus any referral
 * code) in the signed cookie. Returns the nonce to put in `state`.
 */
function issue(req, res, referralCode) {
  const nonce = crypto.randomBytes(16).toString('hex');

  let ref = null;
  if (typeof referralCode === 'string' && referralCode.trim()) {
    // Referral codes are `MALL-<8 hex>`; cap defensively rather than trusting
    // the query string's shape.
    ref = referralCode.trim().slice(0, 64);
  }

  const payload = { nonce, ref, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  res.cookie(COOKIE_NAME, `${body}.${mac(body)}`, cookieOptions(TTL_MS));
  return nonce;
}

/**
 * Verifies and consumes the state cookie. Returns { valid, ref } — `valid`
 * means the `state` on this callback matches the nonce this browser was
 * issued, and `ref` is the referral code carried through the round-trip.
 */
function consume(req, res, stateFromQuery) {
  const finish = (result) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return result;
  };

  const raw = req.cookies && req.cookies[COOKIE_NAME];
  if (!raw || typeof stateFromQuery !== 'string' || !stateFromQuery) {
    return finish({ valid: false, ref: null });
  }

  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return finish({ valid: false, ref: null });

  const body = raw.slice(0, dot);
  const providedMac = Buffer.from(raw.slice(dot + 1), 'base64url');
  const expectedMac = Buffer.from(mac(body), 'base64url');

  if (
    providedMac.length !== expectedMac.length ||
    !crypto.timingSafeEqual(providedMac, expectedMac)
  ) {
    return finish({ valid: false, ref: null });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return finish({ valid: false, ref: null });
  }

  if (!payload || typeof payload.nonce !== 'string' || !Number.isFinite(payload.exp)) {
    return finish({ valid: false, ref: null });
  }
  if (payload.exp < Date.now()) return finish({ valid: false, ref: null });

  const nonceBuf = Buffer.from(payload.nonce, 'utf8');
  const stateBuf = Buffer.from(stateFromQuery, 'utf8');
  const matches =
    nonceBuf.length === stateBuf.length && crypto.timingSafeEqual(nonceBuf, stateBuf);

  if (!matches) return finish({ valid: false, ref: null });

  return finish({ valid: true, ref: typeof payload.ref === 'string' ? payload.ref : null });
}

module.exports = { issue, consume, COOKIE_NAME };
