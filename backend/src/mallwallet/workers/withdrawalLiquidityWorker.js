const { Worker } = require('bullmq')
const getRedisConnection = require('../queue/redis')
const { processQueuedWithdrawals } = require('../../services/withdrawalLiquidityQueueService')
const { scheduleWithdrawalLiquidityScan } = require('../queue/withdrawalLiquidityQueue')
const logger = require('../../utils/logger')

// concurrency: 1 is load-bearing, not a default. Liquidity is one shared
// resource — two overlapping scans reading the same pool reserve could
// jointly release more withdrawals than the pool actually has.
const worker = new Worker(
  'withdrawal-liquidity-scan',
  async () => processQueuedWithdrawals(),
  {
    connection: getRedisConnection(),
    concurrency: 1,
  },
)

worker.on('completed', (job, result) => {
  if (result?.released?.length) {
    logger.info('withdrawalLiquidityWorker', `released ${result.released.length} withdrawal(s)`, { released: result.released })
  }
})

worker.on('failed', (job, err) => {
  logger.warn('withdrawalLiquidityWorker', `scan job ${job?.id} failed: ${err?.message || err}`)
})

scheduleWithdrawalLiquidityScan().catch(err => {
  logger.warn('withdrawalLiquidityWorker', 'failed to schedule recurring scan', { error: err.message })
})

module.exports = worker
