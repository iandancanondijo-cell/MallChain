const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const LoginActivity = require('../models/loginActivity');
const logger = require('../utils/logger');

// Middleware: require JWT auth for all routes
router.use(requireAuth());

/**
 * GET /api/login-activity
 * Get login attempt history for the current user
 * Supports filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 50, skip = 0, status = 'all' } = req.query;
    
    // Build filter
    const filter = { userId };
    if (status === 'success') filter.success = true;
    else if (status === 'failed') filter.success = false;
    
    // Query with pagination
    const [activities, total] = await Promise.all([
      LoginActivity.find(filter)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .lean(),
      LoginActivity.countDocuments(filter),
    ]);
    
    // Format response
    const formattedActivities = activities.map((a) => ({
      _id: a._id.toString(),
      success: a.success,
      failureReason: a.failureReason || null,
      device: a.device,
      browser: `${a.browser}${a.browserVersion ? ' ' + a.browserVersion : ''}`,
      os: a.os,
      ipAddress: a.ipAddress,
      country: a.country || 'Unknown',
      city: a.city || 'Unknown',
      timestamp: a.timestamp,
      riskScore: a.riskScore,
      suspicious: a.suspicious,
      suspiciousReasons: a.suspiciousReasons || [],
      loginMethod: a.loginMethod,
      mfaUsed: a.mfaUsed,
    }));
    
    res.json({
      activities: formattedActivities,
      total,
      limit: Number(limit),
      skip: Number(skip),
      hasMore: Number(skip) + Number(limit) < total,
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get login activity', error);
    res.status(500).json({ error: 'Failed to get login activity' });
  }
});

/**
 * GET /api/login-activity/failed
 * Get only failed login attempts
 */
router.get('/failed', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;
    
    const [activities, total] = await Promise.all([
      LoginActivity.find({ userId, success: false })
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .lean(),
      LoginActivity.countDocuments({ userId, success: false }),
    ]);
    
    const formattedActivities = activities.map((a) => ({
      _id: a._id.toString(),
      failureReason: a.failureReason || 'Unknown',
      ipAddress: a.ipAddress,
      country: a.country || 'Unknown',
      timestamp: a.timestamp,
      browser: `${a.browser}${a.browserVersion ? ' ' + a.browserVersion : ''}`,
      os: a.os,
    }));
    
    res.json({
      failedAttempts: formattedActivities,
      total,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get failed login activity', error);
    res.status(500).json({ error: 'Failed to get failed login activity' });
  }
});

/**
 * GET /api/login-activity/suspicious
 * Get suspicious login attempts
 */
router.get('/suspicious', async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;
    
    const [activities, total] = await Promise.all([
      LoginActivity.find({ userId, suspicious: true })
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .lean(),
      LoginActivity.countDocuments({ userId, suspicious: true }),
    ]);
    
    const formattedActivities = activities.map((a) => ({
      _id: a._id.toString(),
      riskScore: a.riskScore,
      reasons: a.suspiciousReasons || [],
      ipAddress: a.ipAddress,
      country: a.country || 'Unknown',
      timestamp: a.timestamp,
      success: a.success,
    }));
    
    res.json({
      suspiciousAttempts: formattedActivities,
      total,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get suspicious login activity', error);
    res.status(500).json({ error: 'Failed to get suspicious login activity' });
  }
});

/**
 * GET /api/login-activity/recent-ips
 * Get recently used IP addresses
 */
router.get('/recent-ips', async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get recent unique IPs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentIPs = await LoginActivity.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
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
        ipAddress: ip._id,
        country: ip.country || 'Unknown',
        city: ip.city || 'Unknown',
        lastSeen: ip.lastSeen,
        loginCount: ip.count,
      })),
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to get recent IPs', error);
    res.status(500).json({ error: 'Failed to get recent IPs' });
  }
});

/**
 * POST /api/login-activity/create (internal use during login)
 * Create a login activity record
 * Called from routes/auth.js after authentication attempt
 */
router.post('/create', async (req, res) => {
  try {
    const {
      userId,
      success,
      failureReason,
      sessionId,
      loginMethod = 'password',
      mfaUsed = false,
    } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    
    const userAgent = req.headers['user-agent'] || '';
    const uaInfo = parseUserAgent(userAgent);
    const locationInfo = getLocationInfo(req);
    
    // Calculate risk score for this login
    const riskScore = calculateRiskScore({
      success,
      failureReason,
      mfaUsed,
      ipAddress: locationInfo.ipAddress,
      loginMethod,
    });
    
    const activity = new LoginActivity({
      userId,
      success,
      failureReason: failureReason || null,
      device: uaInfo.device,
      browser: uaInfo.browser,
      browserVersion: uaInfo.browserVersion,
      os: uaInfo.os,
      ipAddress: locationInfo.ipAddress,
      country: locationInfo.country,
      city: locationInfo.city,
      sessionId: sessionId || null,
      riskScore,
      suspicious: riskScore > 30, // Flag as suspicious if risk > 30
      suspiciousReasons: getRiskReasons(riskScore),
      userAgent,
      loginMethod,
      mfaUsed,
    });
    
    await activity.save();
    
    logger.info('loginActivity', 'Login activity recorded', {
      userId: userId.toString(),
      success,
      riskScore,
      country: locationInfo.country,
    });
    
    res.json({
      success: true,
      activityId: activity._id,
      suspicious: activity.suspicious,
      riskScore: activity.riskScore,
    });
  } catch (error) {
    logger.error('loginActivity', 'Failed to create login activity', error);
    res.status(500).json({ error: 'Failed to record login activity' });
  }
});

/**
 * Helper: Parse user agent to extract device, browser, OS
 */
function parseUserAgent(userAgentString) {
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
 * Helper: Get geolocation from request
 */
function getLocationInfo(req) {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  
  return {
    ipAddress,
    country: req.headers['cf-ipcountry'] || 'Unknown',
    city: 'Unknown', // Would come from geolocation API
  };
}

/**
 * Helper: Calculate risk score for a login attempt (0-100)
 */
function calculateRiskScore(loginData) {
  let score = 0;
  
  // Failed login attempts
  if (!loginData.success) {
    score += 20;
    if (loginData.failureReason === 'invalid_credentials') score += 5;
    if (loginData.failureReason === 'account_locked') score += 15;
    if (loginData.failureReason === 'mfa_failed') score += 10;
  }
  
  // No MFA used (if user typically uses it)
  if (!loginData.mfaUsed && loginData.success) {
    score += 5; // Small risk increase
  }
  
  // Unusual login methods
  if (loginData.loginMethod === 'password' && !loginData.mfaUsed && loginData.success) {
    score += 3; // Slightly unusual if user usually has MFA
  }
  
  return Math.min(score, 100); // Cap at 100
}

/**
 * Helper: Get reasons why a login was flagged as suspicious
 */
function getRiskReasons(riskScore) {
  const reasons = [];
  
  if (riskScore >= 20) reasons.push('High risk score');
  if (riskScore >= 15) reasons.push('Failed login attempt');
  if (riskScore >= 10) reasons.push('MFA failure');
  if (riskScore >= 5) reasons.push('Unusual activity pattern');
  
  return reasons;
}

module.exports = router;
