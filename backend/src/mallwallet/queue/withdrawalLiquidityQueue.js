const { Queue } = require('bullmq')
const getRedisConnection = require('./redis')

// Liquidity clearing is an indefinite external wait (could be hours), not a
// transient failure — the existing DLQ pattern (convertLiquidityQueue.js's
// attempts:3 + exponential backoff) is for a few retries over seconds, and
// dead-lettering a withdrawal after 3 tries would be wrong here. One
// recurring scan job (not one job per withdrawal) re-checks the whole
// held queue on an interval instead.
const SCAN_INTERVAL_MS = Number(process.env.WITHDRAWAL_LIQUIDITY_SCAN_INTERVAL_MS || 60000)
const RECURRING_JOB_ID = 'withdrawal-liquidity-scan-recurring'

let withdrawalLiquidityQueue = null

function getWithdrawalLiquidityQueue() {
  if (!withdrawalLiquidityQueue) {
    const connection = getRedisConnection()
    withdrawalLiquidityQueue = new Queue('withdrawal-liquidity-scan', {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50,
      },
    })

    try {
      const { registerQueueForMetrics } = require('../monitoring/prometheus')
      registerQueueForMetrics('withdrawal_liquidity_scan', async () => withdrawalLiquidityQueue)
    } catch (_) { /* monitoring optional */ }

    withdrawalLiquidityQueue.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[withdrawalLiquidityQueue] error', err)
    })
  }
  return withdrawalLiquidityQueue
}

/**
 * Schedules the recurring scan, once. A fixed jobId means a process
 * restart re-adds the *same* repeatable job instead of creating a
 * duplicate one running alongside it.
 */
async function scheduleWithdrawalLiquidityScan() {
  const queue = getWithdrawalLiquidityQueue()
  await queue.add('scan', {}, {
    repeat: { every: SCAN_INTERVAL_MS },
    jobId: RECURRING_JOB_ID,
  })
}

module.exports = { getWithdrawalLiquidityQueue, scheduleWithdrawalLiquidityScan, SCAN_INTERVAL_MS }
