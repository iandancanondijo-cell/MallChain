const { Worker } = require('bullmq')
const getRedisConnection = require('../queue/redis')
const mongoose = require('mongoose')
const { addLiquidityToPool } = require('../../controllers/liquidityController')
const { recordLiquidityActivity } = require('../../services/liquidityActivityService')
const logger = require('../../utils/logger')

const DLQ_COLLECTION = 'convert_dead_letters'

const worker = new Worker(
  'convert-liquidity-dlq',
  async job => {
    const { address, mlcoins, kesValue, poolId, firstFailedAt } = job.data
    const attemptNumber = job.attemptsMade + 1  // use BullMQ's internal counter, not stale job data

    let liquidityResult = null
    try {
      liquidityResult = await addLiquidityToPool({
        poolId: poolId || 2,
        amount0: mlcoins,
        amount1: kesValue,
        userAddress: address,
      })
      await recordLiquidityActivity({
        flow: 'mallpoints_convert',
        stage: 'liquidity_added_via_dlq',
        status: 'success',
        poolId: poolId || 2,
        walletAddress: address,
        amountMlcns: mlcoins,
        fiatAmount: kesValue,
        lpTokens: liquidityResult?.lpTokens,
        attempt: attemptNumber,
        note: 'Liquidity added via BullMQ DLQ after a prior convert-flow failure.',
      })
      return { ok: true, attempt: attemptNumber, lpTokens: liquidityResult?.lpTokens }
    } catch (err) {
      await recordLiquidityActivity({
        flow: 'mallpoints_convert',
        stage: 'liquidity_add_dlq_retry_failed',
        status: 'failed',
        poolId: poolId || 2,
        walletAddress: address,
        amountMlcns: mlcoins,
        fiatAmount: kesValue,
        attempt: attemptNumber,
        reason: err?.message || 'unknown',
      }).catch(() => {})
      throw err
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
    settings: {
      lockDuration: 120000,     // 2 min — long enough for signAndBroadcast to complete
      stalledInterval: 30000,
      maxStalledCount: 0,       // stalled jobs fail immediately instead of re-queuing
    },
  },
)

worker.on('completed', job => {
  logger.info(
    'convertLiquidityWorker',
    `job ${job.id} completed on attempt ${job.attemptsMade + 1}`,
  )
})

worker.on('failed', async (job, err) => {
  if (!job) return
  const attemptsMade = Number(job.attemptsMade || 0)
  const maxAttempts = Number(job.opts?.attempts || 3)

  logger.warn(
    'convertLiquidityWorker',
    `job ${job.id} attempt ${attemptsMade + 1}/${maxAttempts} failed: ${err?.message || err}`,
  )

  if (attemptsMade + 1 >= maxAttempts) {
    logger.error(
      'convertLiquidityWorker',
      `job ${job.id} exhausted all retries — writing to Mongo ${DLQ_COLLECTION} for operator remediation`,
    )
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error(
          'convertLiquidityWorker',
          'Mongo not connected; dead letter lost until operator re-runs manually — please check DB connectivity and re-run the convert DLQ.',
          { jobData: job.data },
        )
      } else {
        const collection = mongoose.connection.collection(DLQ_COLLECTION)
        await collection.insertOne({
          _kind: 'convert_liquidity_dead_letter',
          createdAt: new Date(),
          firstFailedAt: job.data.firstFailedAt || null,
          lastFailedAt: new Date(),
          attempts: attemptsMade + 1,
          jobId: job.id,
          jobName: job.name,
          payload: job.data || {},
          lastError: String(err?.message || err || 'unknown'),
          lastErrorStack: String(err?.stack || ''),
          status: 'dead_letter',
          remediated: false,
          remediation: null,
        })
      }
    } catch (writeErr) {
      logger.error(
        'convertLiquidityWorker',
        `CRITICAL: failed to persist convert DLQ dead letter to Mongo collection ${DLQ_COLLECTION}`,
        { error: writeErr?.message || writeErr, jobData: job.data },
      )
    }
  }
})

module.exports = worker
