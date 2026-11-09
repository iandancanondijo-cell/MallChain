/**
 * Active sessions — GET the list, end one, end all the others, check whether
 * this one is still live.
 *
 * Two properties this route did not previously have:
 *
 *  1. It matched "which session am I using?" by hashing the Authorization
 *     header. The JWT lives in an httpOnly cookie (see
 *     controllers/authController.js) and the frontend never holds the token,
 *     so that header is absent on every browser request, currentTokenHash was
 *     always null, and no row could ever match. The token's own `jti` claim —
 *     which requireAuth already puts on req.tokenPayload — is the session's
 *     identity, so that is what gets compared.
 *  2. "Terminating" a session only flipped isActive on a row that nothing
 *     else read, so the other device's JWT stayed valid until it naturally
 *     expired. Ending a session now goes through services/sessionRegistry.js,
 *     which revokes that jti in Redis for the remainder of its life — the same
 *     mechanism /api/auth/logout uses. The row and the token now agree.
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Session = require('../models/session');
const logger = require('../utils/logger');
const { browserLabel } = require('../utils/deviceInfo');
const { endSessionByJti, endOtherSessions, recordIssuedSession } = require('../services/sessionRegistry');
const { effectiveSessionTtlMinutes } = require('../utils/sessionPolicy');

router.use(requireAuth());

/**
 * Response shape used across this file: `error` carries the human-readable
 * text (services/api.ts surfaces exactly that) and details.code the stable
 * string the UI branches on.
 */
function refuse(res, status, code, message) {
  return res.status(status).json({ error: message, details: { code } });
}

function currentJti(req) {
  const jti = req.tokenPayload?.jti;
  return typeof jti === 'string' && jti ? jti : null;
}

function shape(session, jti) {
  return {
    id: String(session._id),
    device: session.device || 'unknown',
    browser: browserLabel(session.browser, session.browserVersion),
    os: session.os || null,
    automatedClient: Boolean(session.automatedClient),
    loginMethod: session.loginMethod || null,
    // Nothing here is invented: if the request did not state an address and no
    // GeoIP lookup is wired up, these stay null and the UI says so rather than
    // printing the old 'Unknown' placeholder as though it were a place.
    location: { country: session.country || null, city: session.city || null },
    ipAddress: session.ipAddress || null,
    startedAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt,
    isCurrent: Boolean(jti) && session.jti === jti,
  };
}

/**
 * A session issued before the recorder was deployed has no row. Without this,
 * the panel would omit the very session you are using, and
 * POST /logout-all-others would compare `$ne` against a missing jti. Backfill
 * it from what the token itself proves (`jti`, `exp`) plus this request's own
 * headers. loginMethod is 'unknown' because the token does not carry one.
 */
async function ensureCurrentSessionRecord(req) {
  const jti = currentJti(req);
  if (!jti) return null;
  const existing = await Session.findOne({ jti }).lean();
  if (existing) return existing;
  const expSeconds = Number(req.tokenPayload?.exp);
  if (!Number.isFinite(expSeconds)) return null;
  return recordIssuedSession({
    userId: req.user._id,
    jti,
    token: null,
    expiresAt: new Date(expSeconds * 1000),
    req,
    loginMethod: 'unknown',
    recordLogin: false,
  });
}

/**
 * GET /api/sessions
 */
router.get('/', async (req, res) => {
  try {
    const jti = currentJti(req);
    await ensureCurrentSessionRecord(req);

    const sessions = await Session.find({ userId: req.user._id, isActive: true })
      .sort('-lastActivityAt')
      .lean();

    const current = sessions.find((s) => s.jti === jti);
    // The account's own Session Timeout preference is part of this number, so
    // the panel states the same lifetime the token was actually signed with.
    const { ttlMinutes } = await effectiveSessionTtlMinutes(req.user._id);

    res.json({
      sessions: sessions.map((s) => shape(s, jti)),
      policy: {
        // The Settings copy used to promise "sessions automatically expire
        // after 24 hours of inactivity". Neither half was true: the lifetime is
        // SESSION_TTL_MIN from sign-in, and it does not move when you are
        // active. These two fields are what the panel is allowed to say.
        ttlMinutes,
        renewsOnActivity: false,
        endsAt: current ? current.expiresAt : null,
      },
      // A token without a jti predates session tracking; per-device controls
      // cannot address it, so say that instead of offering buttons that would
      // act on the wrong row.
      currentSessionTracked: Boolean(jti),
    });
  } catch (error) {
    logger.error('sessions', 'Failed to get sessions', error);
    refuse(res, 500, 'session_list_failed', 'Could not load your active sessions. Try again in a moment.');
  }
});

/**
 * POST /api/sessions/:id/logout — end one of your own sessions.
 */
router.post('/:id/logout', async (req, res) => {
  try {
    const userId = req.user._id;
    const jti = currentJti(req);

    // An id this server cannot parse is the same answer as one that isn't
    // yours — and not a 500 from a Mongoose CastError.
    if (!mongoose.isValidObjectId(req.params.id)) {
      return refuse(res, 404, 'session_not_found', 'No session with that id belongs to your account.');
    }

    const session = await Session.findOne({ _id: req.params.id, userId, isActive: true }).lean();
    if (!session) {
      return refuse(res, 404, 'session_not_found', 'No active session with that id belongs to your account.');
    }

    if (jti && session.jti === jti) {
      return refuse(
        res,
        409,
        'current_session_not_terminable',
        'That is the session you are using right now. Use Sign out to end it — ending it here would cut off the request that asked.'
      );
    }

    const closed = await endSessionByJti(session.jti, { userId });
    if (!closed) {
      return refuse(res, 500, 'session_not_terminated', 'That session could not be ended. Try again.');
    }

    logger.info('sessions', 'Session terminated', {
      userId: String(userId),
      sessionId: String(session._id),
      device: session.device,
    });

    res.json({ ok: true, terminated: true, id: String(session._id) });
  } catch (error) {
    logger.error('sessions', 'Failed to logout session', error);
    refuse(res, 500, 'session_logout_failed', 'Could not end that session. Try again in a moment.');
  }
});

/**
 * POST /api/sessions/logout-all-others
 */
router.post('/logout-all-others', async (req, res) => {
  try {
    const userId = req.user._id;
    const jti = currentJti(req);
    if (!jti) {
      return refuse(
        res,
        409,
        'current_session_untracked',
        'This session predates session tracking, so it cannot be told apart from the others. Sign out and back in to use per-device controls.'
      );
    }

    const { closed } = await endOtherSessions({ userId, jti });

    logger.info('sessions', 'Other sessions terminated', {
      userId: String(userId),
      count: closed,
    });

    res.json({ ok: true, loggedOut: closed });
  } catch (error) {
    logger.error('sessions', 'Failed to logout sessions', error);
    refuse(res, 500, 'session_logout_failed', 'Could not end your other sessions. Try again in a moment.');
  }
});

/**
 * POST /api/sessions/verify-current
 *
 * Replaces POST /:id/verify, which updated lastActivityAt on any document
 * whose id was supplied — no userId in the filter, so any signed-in user
 * could rewrite the activity timestamp of any other user's session (and got a
 * 500 instead of a 404 on a malformed id).
 *
 * Answering "is this session still live" needs no lookup to be trusted
 * either: requireAuth above has already rejected an expired or revoked token,
 * so reaching this handler IS the proof.
 */
router.post('/verify-current', async (req, res) => {
  try {
    const jti = currentJti(req);
    const expSeconds = Number(req.tokenPayload?.exp);
    const expiresAt = Number.isFinite(expSeconds) ? new Date(expSeconds * 1000) : null;

    if (!jti) {
      return res.json({
        ok: true,
        active: true,
        tracked: false,
        expiresAt,
        reason: 'This token predates session tracking, so it has no session record.',
      });
    }

    const session = await Session.findOne({ userId: req.user._id, jti }).lean();
    if (!session) {
      return res.json({ ok: true, active: true, tracked: false, expiresAt });
    }

    res.json({
      ok: true,
      active: Boolean(session.isActive),
      tracked: true,
      expiresAt: session.expiresAt || expiresAt,
    });
  } catch (error) {
    logger.error('sessions', 'Failed to verify session', error);
    refuse(res, 500, 'session_verify_failed', 'Could not check this session. Try again in a moment.');
  }
});

module.exports = router;
