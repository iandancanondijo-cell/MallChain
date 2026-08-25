/**
 * Short-lived cache for the user document `auth`/`adminAuth` attach to
 * req.user, so a burst of requests from the same session doesn't each pay
 * a MongoDB round-trip just to re-fetch a document that hasn't changed in
 * the last couple minutes. Redis-backed (shared across backend instances);
 * degrades to "always miss" if Redis is unreachable — auth must never hard
 * fail just because the cache is down.
 *
 * Disabled outright under NODE_ENV=test: the test suite mocks
 * User.findById directly and reuses the same fake ids across many cases,
 * so a real Redis instance caching across those runs would serve a stale
 * user from one test into the next.
 */
const IORedis = require('ioredis')
const logger = require('./../utils/logger')

const TTL_SECONDS = 120
const TEST_MODE = process.env.NODE_ENV === 'test'

let redis = null
function getClient() {
  if (TEST_MODE) return null
  if (!redis) {
    redis = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
    })
    redis.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      logger.warn('authCache', 'redis error', { error: err.message })
    })
  }
  return redis
}

const key = userId => `authcache:user:${userId}`

async function getCachedUser(userId) {
  const client = getClient()
  if (!client) return null
  try {
    const raw = await client.get(key(userId))
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    return null
  }
}

async function setCachedUser(userId, user) {
  const client = getClient()
  if (!client) return
  try {
    await client.set(key(userId), JSON.stringify(user), 'EX', TTL_SECONDS)
  } catch (err) {
    // best-effort only
  }
}

async function invalidateCachedUser(userId) {
  const client = getClient()
  if (!client) return
  try {
    await client.del(key(userId))
  } catch (err) {
    // best-effort only
  }
}

module.exports = { getCachedUser, setCachedUser, invalidateCachedUser }
