/**
 * Session-expiry cooldown (platform security policy).
 *
 * Policy: a session lasts SESSION_TTL_MIN minutes of use (30). On expiry the
 * account enters a LOGIN_COOLDOWN_MINUTES (15) sign-in cooldown; any login
 * attempt during the cooldown is rejected with the REMAINING time.
 *
 * Redis key scheme (same fail-open ioredis client pattern as
 * middleware/tokenDenylist.js / controllers/authController.js's failed-login
 * lock, via mallwallet/queue/redis's getConnection):
 *  - session:current:{userId}   = token `exp` (epoch seconds), TTL 45min.
 *    Stamped on every signToken() (login/register/refresh/OAuth). Used to
 *    distinguish "the CURRENT session just expired" from a stale tab posting
 *    an OLD expired token: the cooldown is only armed when the offending
 *    token's exp >= the stamp, so re-logging in (which re-stamps with a
 *    newer exp) makes late 401s from abandoned tabs unable to re-lock the
 *    account.
 *  - login_cooldown:user:{userId} = lockout-until (epoch seconds),
 *    TTL = cooldown minutes. Checked by the login paths BEFORE verifying
 *    credentials, keyed by userId because email is encrypted at rest — the
 *    only pre-auth resolution path is the email_blind lookup, so the check
 *    necessarily runs after the user is found and before bcrypt.compare.
 *
 * Failure posture mirrors the existing patterns:
 *  - the login-time CHECK fails CLOSED (Redis down ⇒ deny the login, 503
 *    shape, like checkAccountLock's 'lockout_check_unavailable');
 *  - the expiry-time STAMPING/ARMING fails OPEN (best-effort — a Redis blip
 *    must not turn every expired-token 401 into a hang; the client still
 *    gets the session_expired shape and the login-time check still guards).
 * Commands are wrapped in a short timeout because ioredis's offline queue
 * (enableOfflineQueue in mallwallet/queue/redis.js) would otherwise leave
 * them pending across a reconnect, and requireAuth runs on every request.
 */
const jwt = require('jsonwebtoken');
const getRedis = require('../mallwallet/queue/redis');
const logger = require('../utils/logger');

const REDIS_OP_TIMEOUT_MS = 1500;
// Comfortably longer than SESSION_TTL_MIN (30) so the stamp outlives its own
// session and covers the window where a late request with the expired token
// arrives; older-than-that tokens are just old, not "the current session".
const SESSION_STAMP_TTL_SECONDS = 45 * 60;

function cooldownMinutes() {
  const n = parseInt(process.env.LOGIN_COOLDOWN_MINUTES || '15', 10);
  if (!Number.isFinite(n) || n < 1) return 15;
  return Math.min(480, n);
}

const stampKey = userId => `session:current:${userId}`;
const cooldownKey = userId => `login_cooldown:user:${userId}`;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`redis operation timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Best-effort (fail OPEN): record the exp of the token we just issued as this
 * user's current session. Called from signToken() on every login/register/
 * refresh/OAuth issue. Never blocks or breaks token issuance.
 */
async function stampCurrentSession(userId, expSeconds) {
  if (!userId || !expSeconds) return;
  const redis = getRedis();
  try {
    await withTimeout(redis.set(stampKey(userId), String(expSeconds), 'EX', SESSION_STAMP_TTL_SECONDS), REDIS_OP_TIMEOUT_MS);
  } catch (err) {
    logger.warn('sessionCooldown', 'failed to stamp current session (failing open)', { error: err.message || String(err) });
  } finally {
    redis.quit().catch(() => {});
  }
}

/**
 * Arm the sign-in cooldown for a session that just expired. Only writes the
 * cooldown key when `exp` is at least the user's stamped current-session exp
 * (or no stamp exists), so a stale background tab with an older expired
 * token cannot re-lock an account whose user already signed in again — and
 * via SET NX so repeated 401s from the SAME expired token (a polling tab
 * noticing its session died) arm the lock exactly once instead of sliding
 * the deadline forward on every request.
 * Fail OPEN: Redis errors are logged, and the caller still responds with the
 * session_expired shape (client-side UX), the authoritative gate being the
 * fail-closed check at login time.
 */
async function armCooldownForExpiredSession(userId, expSeconds) {
  const mins = cooldownMinutes();
  if (!userId || !expSeconds) return mins;
  const redis = getRedis();
  try {
    const current = await withTimeout(redis.get(stampKey(userId)), REDIS_OP_TIMEOUT_MS);
    if (current === null || expSeconds >= Number(current)) {
      const until = Math.floor(Date.now() / 1000) + mins * 60;
      await withTimeout(redis.set(cooldownKey(userId), String(until), 'EX', mins * 60, 'NX'), REDIS_OP_TIMEOUT_MS);
    }
  } catch (err) {
    logger.warn('sessionCooldown', 'failed to arm login cooldown (failing open)', { error: err.message || String(err) });
  } finally {
    redis.quit().catch(() => {});
  }
  return mins;
}

/**
 * Login-path gate. Returns { locked: false } normally;
 * { locked: true, retryAfterSeconds, reason? } when the account is in its
 * post-session-expiry cooldown (or we cannot tell — fail CLOSED, same
 * posture as authController.js's checkAccountLock).
 */
async function checkLoginCooldown(userId) {
  if (!userId) return { locked: false };
  const redis = getRedis();
  try {
    const raw = await withTimeout(redis.get(cooldownKey(userId)), REDIS_OP_TIMEOUT_MS);
    if (raw === null) return { locked: false };
    const until = Number(raw);
    const remaining = until - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return { locked: false };
    return { locked: true, retryAfterSeconds: remaining };
  } catch (err) {
    logger.error('sessionCooldown', `Cooldown check failed (failing closed for ${userId}): ${err.message || err}`);
    return { locked: true, retryAfterSeconds: cooldownMinutes() * 60, reason: 'lockout_check_unavailable' };
  } finally {
    redis.quit().catch(() => {});
  }
}

/**
 * requireAuth.js hook: turns a signature-valid-but-expired token into the
 * 401 session_expired response (and arms the cooldown). Re-verifies with
 * ignoreExpiration so a FORGED token (bad signature, attacker-chosen userId)
 * can never arm a cooldown on someone else's account or even reach the
 * Redis write — such tokens fall through to the plain 'invalid token' 401.
 * Returns true if it sent a response, false if the caller should continue
 * with its generic invalid-token handling.
 */
async function handleExpiredToken(req, res, token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  let payload = null;
  try {
    payload = jwt.verify(token, secret, { ignoreExpiration: true });
  } catch {
    return false;
  }
  if (!payload || !(payload.userId || payload.id)) return false;
  const userId = String(payload.userId || payload.id);
  const mins = await armCooldownForExpiredSession(userId, payload.exp);
  res.status(401).json({ error: 'session_expired', cooldownMinutes: mins });
  return true;
}

module.exports = {
  cooldownMinutes,
  stampCurrentSession,
  armCooldownForExpiredSession,
  checkLoginCooldown,
  handleExpiredToken,
  _keys: { stampKey, cooldownKey },
};
