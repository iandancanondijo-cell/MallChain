const { Queue } = require('bullmq')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
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
