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
  }
  return transactionQueue
}

module.exports = { getTransactionQueue }
