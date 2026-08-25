/**
 * Cheap "was this user active today" tracking for the badge streak system.
 * Backed by Redis (not a Mongo write per authenticated request) — same
 * reasoning as faucetService.js's cooldown tracking. Degrades to "streak
 * never satisfied" rather than crashing if Redis is unavailable; badge
 * eligibility is a nice-to-have, not something that should take down
 * request handling.
 */
const { config } = require('../config');
const Redis = require('ioredis');
const logger = require('./logger');

const redis = new Redis({
  host: config.redis.host || '127.0.0.1',
  port: config.redis.port || 6379,
  lazyConnect: true,
  retryStrategy: () => null, // don't retry forever — a badge-streak ping must never block the request it rides on
});

let redisConnected = false;
let warnedOnce = false;

redis.on('error', () => {
  redisConnected = false;
});

redis.connect()
  .then(() => { redisConnected = true; })
  .catch(() => {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('activityTracker', 'Redis unavailable — daily-activity streak tracking disabled (development mode)');
    }
  });

const ACTIVE_DAY_TTL_SECONDS = 40 * 24 * 60 * 60; // outlives the longest streak window this needs to check

function dayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

/** Marks `userId` as active for today (UTC). Fire-and-forget — never throws. */
async function markActiveToday(userId) {
  if (!userId || !redisConnected) return;
  try {
    await redis.set(`activity:${userId}:${dayKey(new Date())}`, '1', 'EX', ACTIVE_DAY_TTL_SECONDS);
  } catch (err) {
    logger.warn('activityTracker', 'failed to mark active day', { error: err.message });
  }
}

/**
 * Returns whether `userId` was active every single one of the
 * `requiredDays` days immediately before `asOfDate` (asOfDate itself not
 * included — the snapshot runs the day before the window opens, checking
 * the days that led up to it). Returns false (not throws) if Redis is
 * unavailable — a broken streak-check must fail toward "no badge", not
 * silently grant one.
 */
async function getConsecutiveActiveDays(userId, asOfDate, requiredDays) {
  if (!userId || requiredDays <= 0) return false;
  if (!redisConnected) return false;

  try {
    const keys = [];
    for (let i = 1; i <= requiredDays; i++) {
      const d = new Date(asOfDate);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(`activity:${userId}:${dayKey(d)}`);
    }
    const results = await redis.mget(...keys);
    return results.every((v) => v !== null);
  } catch (err) {
    logger.warn('activityTracker', 'failed to read streak', { error: err.message });
    return false;
  }
}

module.exports = { markActiveToday, getConsecutiveActiveDays, dayKey };
