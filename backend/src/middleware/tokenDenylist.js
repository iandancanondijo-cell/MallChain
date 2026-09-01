/**
 * JWT revocation. Without this, "log out" only ever cleared the token
 * client-side — the JWT itself stayed valid server-side until it naturally
 * expired, and the SecuritySettings "Sign Out Everywhere" button did
 * exactly the same single-device local clear despite its name, actually
 * revoking nothing on any other device holding a token for that account.
 *
 * Two independent denylist checks:
 *  - per-token (jti): set on a normal logout, so that exact token stops
 *    working immediately instead of drifting until expiry.
 *  - per-user (invalidated-before timestamp): set on "sign out everywhere",
 *    so every token issued before that moment is rejected regardless of its
 *    own jti — without needing to enumerate or track every token a user
 *    was ever issued.
 *
 * Redis-backed, and disabled under NODE_ENV=test for the same reason
 * authCache.js is: tests mock JWT verification directly and reuse fixed
 * user ids across cases, so a real Redis instance would leak state between
 * them. Fails open (allows the request) if Redis is unreachable — the same
 * degrade-gracefully choice this codebase already makes for activityTracker
 * and the auth cache, rather than turning a Redis blip into a full outage.
 */
const IORedis = require('ioredis');
const logger = require('../utils/logger');
const { redisTlsOptions } = require('../utils/redisTlsOptions');

const TEST_MODE = process.env.NODE_ENV === 'test';
// Comfortably longer than the longest realistic SESSION_TTL_MIN, so a
// "sign out everywhere" marker outlives every token it needs to catch,
// without living forever.
const USER_DENYLIST_TTL_SECONDS = 30 * 24 * 60 * 60;

let redis = null;
function getClient() {
  if (TEST_MODE) return null;
  if (!redis) {
    redis = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
      ...redisTlsOptions(),
    });
    redis.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return;
      logger.warn('tokenDenylist', 'redis error', { error: err.message });
    });
  }
  return redis;
}

const jtiKey = jti => `denylist:jti:${jti}`;
const userKey = userId => `denylist:user:${userId}`;

/** Revokes a single token by jti, for the remainder of its natural life. */
async function revokeToken(jti, ttlSeconds) {
  const client = getClient();
  if (!client || !jti || !ttlSeconds || ttlSeconds <= 0) return;
  try {
    await client.set(jtiKey(jti), '1', 'EX', Math.ceil(ttlSeconds));
  } catch (err) {
    logger.warn('tokenDenylist', 'failed to revoke token', { error: err.message });
  }
}

/** Revokes every token issued to this user up to now ("sign out everywhere"). */
async function revokeAllUserTokens(userId) {
  const client = getClient();
  if (!client || !userId) return;
  try {
    await client.set(userKey(userId), String(Date.now()), 'EX', USER_DENYLIST_TTL_SECONDS);
  } catch (err) {
    logger.warn('tokenDenylist', 'failed to revoke all user tokens', { error: err.message });
  }
}

/**
 * Returns true if `decoded` (a verified JWT payload with jti/iat/userId)
 * has been revoked. Fails open (not revoked) if Redis is unreachable.
 */
async function isRevoked(decoded) {
  const client = getClient();
  if (!client) return false;
  try {
    if (decoded.jti) {
      const jtiRevoked = await client.get(jtiKey(decoded.jti));
      if (jtiRevoked) return true;
    }
    const userId = decoded.userId || decoded.id;
    if (userId && decoded.iat) {
      const invalidatedBefore = await client.get(userKey(userId));
      if (invalidatedBefore && decoded.iat * 1000 < Number(invalidatedBefore)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}

module.exports = { revokeToken, revokeAllUserTokens, isRevoked };
