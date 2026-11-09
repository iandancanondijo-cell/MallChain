/**
 * Session-length policy in one place.
 *
 * Two things need to agree on how long a session lasts: authController's
 * signToken(), which stamps `exp` into the JWT, and GET /api/sessions, which
 * tells the Settings UI what to claim. Previously the UI hardcoded "24 hours
 * of inactivity" while the token actually expired at SESSION_TTL_MIN from
 * issuance (30 minutes in production) — a fixed wall-clock end, unrelated to
 * activity. Keeping the clamp in this single function is what stops those two
 * drifting apart again.
 */

const TTL_FLOOR_MIN = 30;
const TTL_CEILING_MIN = 480;
// A preference this short is not a session timeout, it is a misconfiguration
// (or a value written straight into the database), so it is ignored rather
// than honoured. The Settings UI's smallest choice is 5 minutes.
const USER_TTL_FLOOR_MIN = 1;

const UserSettings = require('../models/UserSettings');
const logger = require('../utils/logger');

/**
 * The TTL, in minutes, that the NEXT issued token will get.
 *
 * Reads process.env at call time (not module load) so a test or a bootstrap
 * step that sets SESSION_TTL_MIN after this file is required still takes
 * effect — matching how signToken() behaved before.
 */
function resolveSessionTtlMinutes() {
  const requested = parseInt(process.env.SESSION_TTL_MIN || '', 10);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ttlMinutes: 120, requested: null, clamped: false };
  }
  const ttlMinutes = Math.max(TTL_FLOOR_MIN, Math.min(TTL_CEILING_MIN, requested));
  return { ttlMinutes, requested, clamped: ttlMinutes !== requested };
}

/**
 * Security > Session Timeout in the Settings UI. It can only ever SIGN A USER
 * OUT EARLIER, never keep them signed in past the operator's SESSION_TTL_MIN:
 * the env value is the ceiling, so a value written into the database by
 * anything other than that control cannot extend a session.
 *
 * Pure, so both sides of the rule are testable without a database.
 */
function withUserPreference(envTtlMinutes, userMinutes) {
  const requested = Number(userMinutes);
  if (!Number.isFinite(requested) || requested < USER_TTL_FLOOR_MIN) {
    return { ttlMinutes: envTtlMinutes, fromUserSetting: false };
  }
  return {
    ttlMinutes: Math.min(envTtlMinutes, Math.floor(requested)),
    fromUserSetting: true,
  };
}

/**
 * What the next token for THIS account will actually live for — the env policy
 * narrowed by the account's own preference, if it set one.
 *
 * Fail-open by the same reasoning as the rest of auth: a settings read that
 * throws must not turn a valid password into a 500, and the safe fallback is
 * the env policy, which is the shorter-or-equal of the two unknowns.
 */
async function effectiveSessionTtlMinutes(userId) {
  const env = resolveSessionTtlMinutes();
  if (!userId) return { ...env, fromUserSetting: false };

  let userMinutes;
  try {
    const settings = await UserSettings.findOne({ userId: String(userId) }).select('security').lean();
    userMinutes = settings?.security?.sessionTimeout;
  } catch (error) {
    logger.warn('sessionPolicy', 'could not read the account session timeout, using the server default', { error: error.message });
    return { ...env, fromUserSetting: false };
  }

  const { ttlMinutes, fromUserSetting } = withUserPreference(env.ttlMinutes, userMinutes);
  return { ttlMinutes, requested: env.requested, clamped: env.clamped, fromUserSetting };
}

module.exports = {
  resolveSessionTtlMinutes,
  effectiveSessionTtlMinutes,
  withUserPreference,
  TTL_FLOOR_MIN,
  TTL_CEILING_MIN,
  USER_TTL_FLOOR_MIN,
};
