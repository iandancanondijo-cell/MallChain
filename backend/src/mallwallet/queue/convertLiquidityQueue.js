const { Queue } = require('bullmq')
const getRedisConnection = require('./redis')

let convertLiquidityQueue = null

function getConvertLiquidityQueue() {
  if (!convertLiquidityQueue) {
    const connection = getRedisConnection()
    convertLiquidityQueue = new Queue('convert-liquidity-dlq', {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    })

    try {
      const { registerQueueForMetrics } = require('../monitoring/prometheus')
      registerQueueForMetrics('convert_liquidity_dlq', async () => convertLiquidityQueue)
    } catch (_) { /* monitoring optional */ }

    convertLiquidityQueue.on('error', err => {
      if (err && err.code === 'ECONNREFUSED') return
      console.error('[convertLiquidityQueue] error', err)
    })
  }
  return convertLiquidityQueue
}

async function enqueueConvertLiquidityFailure(payload) {
  try {
    const queue = getConvertLiquidityQueue()
    await queue.add('retry-liquidity-add', {
      ...payload,
      firstFailedAt: payload.firstFailedAt || new Date().toISOString(),
      previousAttempts: Number(payload.previousAttempts || 0),
    })
  } catch (enqueueErr) {
    console.error(
      '[convertLiquidityQueue] failed to enqueue failed convert liquidity',
      enqueueErr?.message || enqueueErr,
    )
  }
}

module.exports = {
  getConvertLiquidityQueue,
  enqueueConvertLiquidityFailure,
}
