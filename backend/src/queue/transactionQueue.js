const { Queue } = require('bullmq')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  // BullMQ takes a raw options object here rather than an ioredis instance,
  // so redisAuthOptions() can't be spread — the two fields it would return
  // are spelled out instead.
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  enableReadyCheck: false
}

let transactionQueue = null

function getTransactionQueue() {
  if (!transactionQueue) {
    transactionQueue = new Queue('transactions', { connection })
  }
  return transactionQueue
}

module.exports = { getTransactionQueue }
