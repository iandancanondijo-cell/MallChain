/**
 * Login Activity — the read side of the log that
 * services/sessionRegistry.js writes.
 *
 * It used to have its own write endpoint, POST /api/login-activity/create,
 * which no client ever called AND which took `userId` from the request body
 * behind nothing but requireAuth — any signed-in user could file a
 * "successful login from anywhere" row against any other account. Removing
 * it is both the fix and the reason the risk scoring no longer lives here:
 * rows are written by the code that actually authenticated the user, not by
 * an HTTP caller who asserts they did.
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const LoginActivity = require('../models/loginActivity');
const logger = require('../utils/logger');
const { browserLabel } = require('../utils/deviceInfo');

// Middleware: require JWT auth for all routes
router.use(requireAuth());

/**
 * Location fields are passed through as-is: null means the request did not
 * state it (or no GeoIP lookup exists — see utils/deviceInfo.js). The earlier
 * `|| 'Unknown'` here produced a row that read like an observation.
 */
function shape(activity) {
  return {
    id: String(activity._id),
    success: activity.success,
    failureReason: activity.failureReason || null,
    device: activity.device || 'unknown',
    browser: browserLabel(activity.browser, activity.browserVersion),
    os: activity.os || null,
    ipAddress: activity.ipAddress || null,
    country: activity.country || null,
    city: activity.city || null,
    timestamp: activity.timestamp,
    riskScore: activity.riskScore ?? 0,
    suspicious: Boolean(activity.suspicious),
    suspiciousReasons: activity.suspiciousReasons || [],
    loginMethod: activity.loginMethod || null,
    mfaUsed: Boolean(activity.mfaUsed),
  };
}

function readPaging(req, fallbackLimit) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || fallbackLimit, 1), 100);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  return { limit, skip };
}

/**
 * GET /api/login-activity
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit, skip } = readPaging(req, 50);
    const filter = { userId };
    if (req.query.status === 'success') filter.success = true;
    else if (req.query.status === 'failed') filter.success = false;

    const [activities, total] = await Promise.all([
      LoginActivity.find(filter).sort({ timestamp: -1 }).limit(limit).skip(skip).lean(),
      LoginActivity.countDocuments(filter),
    ]);

    res.json({
      activities: activities.map(shape),
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get login activity', error);
    res.status(500).json({ error: 'Could not load your login activity. Try again in a moment.' });
  }
});

/**
 * GET /api/login-activity/failed
 */
router.get('/failed', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit, skip } = readPaging(req, 20);
    const filter = { userId, success: false };

    const [activities, total] = await Promise.all([
      LoginActivity.find(filter).sort({ timestamp: -1 }).limit(limit).skip(skip).lean(),
      LoginActivity.countDocuments(filter),
    ]);

    res.json({ failedAttempts: activities.map(shape), total, limit, skip });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get failed login activity', error);
    res.status(500).json({ error: 'Could not load failed sign-in attempts. Try again in a moment.' });
  }
});

/**
 * GET /api/login-activity/suspicious
 */
router.get('/suspicious', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit, skip } = readPaging(req, 20);
    const filter = { userId, suspicious: true };

    const [activities, total] = await Promise.all([
      LoginActivity.find(filter).sort({ timestamp: -1 }).limit(limit).skip(skip).lean(),
      LoginActivity.countDocuments(filter),
    ]);

    res.json({ suspiciousAttempts: activities.map(shape), total, limit, skip });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get suspicious login activity', error);
    res.status(500).json({ error: 'Could not load flagged sign-ins. Try again in a moment.' });
  }
});

/**
 * GET /api/login-activity/recent-ips
 */
router.get('/recent-ips', async (req, res) => {
  try {
    const userId = req.user._id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // This aggregate used to call mongoose.Types.ObjectId from a file that
    // never imported mongoose, so the route threw a ReferenceError and 500'd
    // for every caller.
    const recentIPs = await LoginActivity.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(String(userId)),
          timestamp: { $gte: thirtyDaysAgo },
          success: true,
        },
      },
      {
        $group: {
          _id: '$ipAddress',
          country: { $first: '$country' },
          city: { $first: '$city' },
          lastSeen: { $max: '$timestamp' },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastSeen: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      recentIPs: recentIPs.map((ip) => ({
        ipAddress: ip._id || null,
        country: ip.country || null,
        city: ip.city || null,
        lastSeen: ip.lastSeen,
        loginCount: ip.count,
      })),
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get recent IPs', error);
    res.status(500).json({ error: 'Could not load recent network addresses. Try again in a moment.' });
  }
});

module.exports = router;
