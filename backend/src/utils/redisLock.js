const IORedis = require('ioredis')
const crypto = require('crypto')

let redis = null
function getRedisClient() {
  if (!redis) {
    redis = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000)
    })

    redis.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[redisLock] error', err)
    })
  }
  return redis
}

async function acquireLock(key, ttlMs = 5000, timeoutMs = 10000) {
  const value = crypto.randomBytes(16).toString('hex')
  const start = Date.now()
  const redisClient = getRedisClient()
  while (Date.now() - start < timeoutMs) {
    const ok = await redisClient.set(key, value, 'PX', ttlMs, 'NX')
    if (ok) return { key, value }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('failed_to_acquire_lock')
}

async function releaseLock(lock) {
  if (!lock) return
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  try {
    const redisClient = getRedisClient()
    await redisClient.eval(script, 1, lock.key, lock.value)
  } catch (e) {
    // ignore
  }
}

module.exports = { acquireLock, releaseLock }
