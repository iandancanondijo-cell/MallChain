const { Queue } = require('bullmq')
const getRedisConnection = require('./redis')

let transactionQueue = null

function getTransactionQueue() {
  if (!transactionQueue) {
    const connection = getRedisConnection()
    transactionQueue = new Queue('transactions', {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    })
    try {
      const { registerQueueForMetrics } = require('../monitoring/prometheus')
      registerQueueForMetrics('transactions', async () => transactionQueue)
    } catch (_) { /* monitoring optional */ }
  }
  return transactionQueue
}

module.exports = { getTransactionQueue }
