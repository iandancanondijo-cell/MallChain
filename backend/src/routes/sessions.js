const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Session = require('../models/session');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Middleware: require JWT auth for all routes
router.use(requireAuth());

/**
 * Helper: Hash token for secure comparison
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Helper: Parse user agent to extract device, browser, OS (simple regex-based parsing)
 */
function parseUserAgent(userAgentString) {
  // Simple UA parsing without external dependencies
  let device = 'desktop';
  let browser = 'Unknown';
  let browserVersion = '';
  let os = 'Unknown';

  // Detect OS
  if (userAgentString.includes('Windows')) os = 'Windows';
  else if (userAgentString.includes('Mac OS X')) os = 'MacOS';
  else if (userAgentString.includes('iPhone')) os = 'iOS';
  else if (userAgentString.includes('iPad')) os = 'iOS';
  else if (userAgentString.includes('Android')) os = 'Android';
  else if (userAgentString.includes('Linux')) os = 'Linux';

  // Detect device type
  if (userAgentString.includes('Mobile') || userAgentString.includes('iPhone') || userAgentString.includes('Android')) device = 'mobile';
  else if (userAgentString.includes('iPad') || userAgentString.includes('Tablet')) device = 'tablet';

  // Detect browser
  if (userAgentString.includes('Chrome')) browser = 'Chrome';
  else if (userAgentString.includes('Safari')) browser = 'Safari';
  else if (userAgentString.includes('Firefox')) browser = 'Firefox';
  else if (userAgentString.includes('Edge')) browser = 'Edge';
  else if (userAgentString.includes('Opera')) browser = 'Opera';

  // Extract version for Chrome
  if (browser === 'Chrome') {
    const match = userAgentString.match(/Chrome\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  }
  // Extract version for Firefox
  else if (browser === 'Firefox') {
    const match = userAgentString.match(/Firefox\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  }
  // Extract version for Safari
  else if (browser === 'Safari') {
    const match = userAgentString.match(/Version\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  }

  return { device, browser, browserVersion, os };
}

/**
 * Helper: Get IP address and geolocation (basic implementation)
 * In production, integrate with MaxMind GeoIP2 or similar service
 */
function getLocationInfo(req) {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  
  // TODO: Add real geolocation service here
  // For now, return basic info
  return {
    ipAddress,
    country: req.headers['cf-ipcountry'] || 'Unknown', // Cloudflare header
    city: 'Unknown', // Would come from geolocation API
  };
}

/**
 * GET /api/sessions
 * List all active sessions for the user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const currentToken = req.headers.authorization?.split(' ')[1];
    const currentTokenHash = currentToken ? hashToken(currentToken) : null;

    const sessions = await Session.find({
      userId,
      isActive: true,
    })
      .sort('-lastActivityAt')
      .lean();

    // Mark which one is current and format response
    const sessionsWithCurrent = sessions.map((s) => ({
      _id: s._id.toString(),
      device: s.device,
      browser: `${s.browser}${s.browserVersion ? ' ' + s.browserVersion : ''}`,
      os: s.os,
      country: s.country,
      city: s.city,
      lastActivityAt: s.lastActivityAt,
      createdAt: s.createdAt,
      isCurrent: s.tokenHash === currentTokenHash,
    }));

    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    logger.error('sessions', 'Failed to get sessions', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * POST /api/sessions/{id}/logout
 * Terminate a specific session
 */
router.post('/:id/logout', async (req, res) => {
  try {
    const userId = req.user._id;
    const sessionId = req.params.id;

    const session = await Session.findOneAndUpdate(
      { _id: sessionId, userId },
      { isActive: false },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info('sessions', 'Session terminated', {
      userId: userId.toString(),
      sessionId,
      device: session.device,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('sessions', 'Failed to logout session', error);
    res.status(500).json({ error: 'Failed to logout session' });
  }
});

/**
 * POST /api/sessions/logout-all-others
 * Terminate all sessions except current
 */
router.post('/logout-all-others', async (req, res) => {
  try {
    const userId = req.user._id;
    const currentToken = req.headers.authorization?.split(' ')[1];
    const currentTokenHash = currentToken ? hashToken(currentToken) : null;

    if (!currentTokenHash) {
      return res.status(401).json({ error: 'Current session not found' });
    }

    const result = await Session.updateMany(
      {
        userId,
        isActive: true,
        tokenHash: { $ne: currentTokenHash },
      },
      { isActive: false }
    );

    logger.info('sessions', 'All other sessions terminated', {
      userId: userId.toString(),
      count: result.modifiedCount,
    });

    res.json({ success: true, loggedOut: result.modifiedCount });
  } catch (error) {
    logger.error('sessions', 'Failed to logout all sessions', error);
    res.status(500).json({ error: 'Failed to logout sessions' });
  }
});

/**
 * POST /api/sessions/{id}/verify
 * Verify session activity (update lastActivityAt)
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const sessionId = req.params.id;
    await Session.findByIdAndUpdate(sessionId, {
      lastActivityAt: new Date(),
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('sessions', 'Failed to verify session', error);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

/**
 * POST /api/sessions/create (internal use during login)
 * Create a new session record
 * Called from routes/auth.js after JWT is issued
 */
router.post('/create', async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const userAgent = req.headers['user-agent'] || '';
    const uaInfo = parseUserAgent(userAgent);
    const locationInfo = getLocationInfo(req);

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const session = new Session({
      userId,
      tokenHash: hashToken(token),
      device: uaInfo.device,
      browser: uaInfo.browser,
      browserVersion: uaInfo.browserVersion,
      os: uaInfo.os,
      ipAddress: locationInfo.ipAddress,
      country: locationInfo.country,
      city: locationInfo.city,
      userAgent,
      expiresAt,
    });

    await session.save();

    logger.info('sessions', 'Session created', {
      userId: userId.toString(),
      device: uaInfo.device,
      browser: uaInfo.browser,
      country: locationInfo.country,
    });

    res.json({ success: true, sessionId: session._id });
  } catch (error) {
    logger.error('sessions', 'Failed to create session', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

module.exports = router;
