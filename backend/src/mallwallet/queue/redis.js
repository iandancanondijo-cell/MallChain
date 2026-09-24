const Redis = require('ioredis')
const { redisTlsOptions } = require('../../utils/redisTlsOptions')

let connection = null

function getConnection() {
  if (!connection) {
    connection = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: null,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
      ...redisTlsOptions(),
    })

    connection.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[mallwallet redis] error', err)
    })
  }
  return connection
}

module.exports = getConnection
