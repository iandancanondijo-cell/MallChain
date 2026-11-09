/**
 * The single writer for "who is signed in, and where they signed in from".
 *
 * Two collections, one entry point:
 *   - Session        (models/session.js)      → the Active Sessions table
 *   - LoginActivity  (models/loginActivity.js)→ the Login Activity table
 *
 * Both used to have zero writers in practice: the only inserts were behind
 * POST /api/sessions/create and POST /api/login-activity/create, and no
 * client ever called either, so both Settings panels rendered an empty table
 * under a heading that promised real data. Everything issued a token now goes
 * through authController.signToken() → recordIssuedSession() here, which is
 * why the panels can finally describe something the server actually knows.
 *
 * Contract: these functions never throw and never reject. Session bookkeeping
 * is an audit trail; a Mongo or Redis problem must not turn a successful
 * sign-in into a 500 (the same fail-open choice middleware/tokenDenylist.js
 * and utils/activityTracker.js already make). Callers may ignore the returned
 * promise, and every failure is logged.
 */
const crypto = require('crypto');
const Session = require('../models/session');
const LoginActivity = require('../models/loginActivity');
const { revokeToken } = require('../middleware/tokenDenylist');
const { requestMeta } = require('../utils/deviceInfo');
const logger = require('../utils/logger');

// lastActivityAt is what the panel shows as "last active". requireAuth() calls
// touch() on every authenticated request, which without this would be one
// write per poll from every open tab; a minute of staleness is invisible in a
// relative-time label.
const TOUCH_INTERVAL_MS = 60_000;
const TOUCH_MAP_LIMIT = 10_000;
const lastTouchWrites = new Map();

// Flagging used to be decided by one numeric threshold alone, which meant the
// only way anything got flagged was to accumulate enough minor points. Each
// signal now declares whether it deserves a warning (a password that was
// accepted with a bad second factor, or a first-ever sign-in from an address
// this account has never used), and the score remains as a backstop for
// combinations that are individually mild but collectively high.
const SUSPICIOUS_THRESHOLD = 40;

function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * "First sign-in from this address" is only meaningful once there IS a
 * history to compare against, so it only applies to a successful login that
 * differs from every address this account has signed in from before.
 */
async function assessLoginRisk(userId, { success, failureReason, ipAddress }) {
  const suspiciousReasons = [];
  let riskScore = 0;
  let suspicious = false;

  if (!success) {
    riskScore += 20;
    suspiciousReasons.push('Sign-in was rejected');
    if (failureReason === 'invalid_credentials') riskScore += 5;
    if (failureReason === 'account_locked' || failureReason === 'login_cooldown') riskScore += 15;
    if (failureReason === 'mfa_failed') {
      // Worth a warning on its own: something already had the password.
      riskScore += 10;
      suspicious = true;
      suspiciousReasons.push('The password was accepted, but the second factor was not');
    }
  }

  if (success && ipAddress) {
    try {
      const [fromOtherAddresses, fromThisAddress] = await Promise.all([
        LoginActivity.countDocuments({ userId, success: true, ipAddress: { $ne: ipAddress } }),
        LoginActivity.countDocuments({ userId, success: true, ipAddress }),
      ]);
      if (fromOtherAddresses > 0 && fromThisAddress === 0) {
        riskScore += 25;
        suspicious = true;
        suspiciousReasons.push(`First successful sign-in from this network address (${ipAddress})`);
      }
    } catch (error) {
      logger.warn('sessionRegistry', 'could not assess login risk', { error: error.message });
    }
  }

  if (riskScore >= SUSPICIOUS_THRESHOLD) suspicious = true;

  return {
    riskScore: Math.min(riskScore, 100),
    suspicious,
    suspiciousReasons,
  };
}

async function writeLoginActivity({
  userId,
  req,
  success,
  failureReason = null,
  loginMethod = 'password',
  mfaUsed = false,
  sessionId = null,
}) {
  const meta = requestMeta(req);
  const risk = await assessLoginRisk(userId, {
    success,
    failureReason,
    ipAddress: meta.ipAddress,
  });
  return LoginActivity.create({
    userId,
    success,
    failureReason: success ? null : failureReason || 'unknown',
    device: meta.device,
    browser: meta.browser,
    browserVersion: meta.browserVersion,
    os: meta.os,
    ipAddress: meta.ipAddress,
    country: meta.country,
    city: meta.city,
    sessionId,
    riskScore: risk.riskScore,
    suspicious: risk.suspicious,
    suspiciousReasons: risk.suspiciousReasons,
    userAgent: meta.userAgent,
    loginMethod,
    mfaUsed,
  });
}

/**
 * Called from signToken() for every JWT this server issues.
 *
 * `recordLogin` distinguishes a session that came from the user actually
 * signing in (login, OAuth callback) from one that merely replaced it
 * (refresh rotation) or opened the account (register). Signing a token is not
 * the same event as signing in, and the Login Activity panel should not claim
 * otherwise.
 */
async function recordIssuedSession({
  userId,
  jti,
  token,
  expiresAt,
  req,
  loginMethod = 'password',
  recordLogin = false,
  mfaUsed = false,
} = {}) {
  try {
    if (!userId || !jti || !expiresAt) {
      logger.warn('sessionRegistry', 'skipped session record: incomplete arguments', { userId, jti });
      return null;
    }
    const meta = requestMeta(req);
    const session = await Session.create({
      userId,
      jti,
      tokenHash: hashToken(token),
      device: meta.device,
      browser: meta.browser,
      browserVersion: meta.browserVersion,
      os: meta.os,
      automatedClient: meta.automated,
      ipAddress: meta.ipAddress,
      country: meta.country,
      city: meta.city,
      loginMethod,
      userAgent: meta.userAgent,
      expiresAt: new Date(expiresAt),
      lastActivityAt: new Date(),
      isActive: true,
    });

    if (recordLogin) {
      await writeLoginActivity({
        userId,
        req,
        success: true,
        loginMethod,
        mfaUsed,
        sessionId: session._id,
      });
    }

    return session;
  } catch (error) {
    logger.error('sessionRegistry', 'failed to record session', error, { userId: String(userId), jti });
    return null;
  }
}

/**
 * A rejected credential is worth logging even though no session comes from it
 * — that is the row the "Failed" filter in Login Activity is for. It used to
 * have no writer at all, so the filter could never return anything.
 *
 * Only accounts that were actually found can be recorded (userId is the
 * partition key); an attempt against an unknown email is already answered
 * with the same generic 'invalid credentials' and is not attributable here.
 */
async function recordFailedLoginAttempt({ userId, req, failureReason, loginMethod = 'password' } = {}) {
  try {
    if (!userId) return null;
    return await writeLoginActivity({ userId, req, success: false, failureReason, loginMethod });
  } catch (error) {
    logger.error('sessionRegistry', 'failed to record rejected sign-in', error, { userId: String(userId) });
    return null;
  }
}

/**
 * Revokes each row's jti for the remainder of its life and marks it inactive,
 * so an ended session stops being usable immediately rather than at expiry.
 * Returns the number of rows closed.
 */
async function closeSessions(rows) {
  const ids = [];
  for (const row of rows) {
    ids.push(row._id);
    const secondsLeft = Math.floor((new Date(row.expiresAt).getTime() - Date.now()) / 1000);
    if (row.jti && secondsLeft > 0) {
      await revokeToken(row.jti, secondsLeft);
    }
  }
  if (!ids.length) return 0;
  const result = await Session.updateMany(
    { _id: { $in: ids } },
    { $set: { isActive: false } }
  );
  return result.modifiedCount;
}

async function endSessionByJti(jti, { userId } = {}) {
  if (!jti) return 0;
  try {
    const filter = userId ? { jti, userId, isActive: true } : { jti, isActive: true };
    const rows = await Session.find(filter);
    return await closeSessions(rows);
  } catch (error) {
    logger.error('sessionRegistry', 'failed to end session', error, { jti });
    return 0;
  }
}

/**
 * Everything except the caller's own token. Returns the rows it closed so the
 * route can report a number that matches what actually happened.
 */
async function endOtherSessions({ userId, jti }) {
  try {
    const rows = await Session.find({ userId, isActive: true, jti: { $ne: jti } });
    const closed = await closeSessions(rows);
    return { closed, rows };
  } catch (error) {
    logger.error('sessionRegistry', 'failed to end other sessions', error, { userId: String(userId) });
    return { closed: 0, rows: [] };
  }
}

/**
 * "Sign out everywhere": every session this account holds, including this
 * one. authController pairs this with revokeAllUserTokens(), which is the
 * blanket denylist marker; closing the rows here is what makes the panel
 * agree with the revocation.
 */
async function endAllSessions(userId) {
  try {
    const rows = await Session.find({ userId, isActive: true });
    return await closeSessions(rows);
  } catch (error) {
    logger.error('sessionRegistry', 'failed to end all sessions', error, { userId: String(userId) });
    return 0;
  }
}

/**
 * Throttled "this session is in use" write. Called from requireAuth(); fire
 * and forget — it must add no latency and no failure mode to a request.
 */
function touch(jti) {
  if (!jti || typeof jti !== 'string') return;
  const key = jti;
  const last = lastTouchWrites.get(key) || 0;
  const now = Date.now();
  if (now - last < TOUCH_INTERVAL_MS) return;
  if (lastTouchWrites.size > TOUCH_MAP_LIMIT) lastTouchWrites.clear();
  lastTouchWrites.set(key, now);
  Session.updateOne(
    { jti: key, isActive: true },
    { $set: { lastActivityAt: new Date() } }
  ).catch(() => {});
}

module.exports = {
  recordIssuedSession,
  recordFailedLoginAttempt,
  endSessionByJti,
  endOtherSessions,
  endAllSessions,
  touch,
  hashToken,
  SUSPICIOUS_THRESHOLD,
};
