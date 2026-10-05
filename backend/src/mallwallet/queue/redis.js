const Redis = require('ioredis')
const { redisTlsOptions } = require('../../utils/redisTlsOptions')

let connection = null
let bullmqConnection = null

function getConnection() {
  if (!connection) {
    connection = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
      ...redisTlsOptions(),
    })

    connection.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[mallwallet redis] error', err)
    })

    // Keep the connection alive so overnight idle periods don't cause
    // a cold-start failure on the first user request.
    const keepalive = setInterval(() => {
      if (connection.status === 'ready') {
        connection.ping().catch(() => {})
      }
    }, 60_000)
    keepalive.unref()
  }
  return connection
}

// BullMQ rejects connections with maxRetriesPerRequest set to anything but
// null, and its blocking workers need the offline queue and auto-reconnect
// that getConnection() deliberately disables for the fail-fast auth path.
function getBullMQConnection() {
  if (!bullmqConnection) {
    bullmqConnection = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
      ...redisTlsOptions(),
    })

    bullmqConnection.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[mallwallet redis] error', err)
    })

    const keepalive = setInterval(() => {
      if (bullmqConnection.status === 'ready') {
        bullmqConnection.ping().catch(() => {})
      }
    }, 60_000)
    keepalive.unref()
  }
  return bullmqConnection
}

module.exports = getConnection
module.exports.getBullMQConnection = getBullMQConnection
