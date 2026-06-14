const Redis = require('ioredis')

let connection = null

function getConnection() {
  if (!connection) {
    connection = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000)
    })

    connection.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[mallwallet redis] error', err)
    })
  }
  return connection
}

module.exports = getConnection
