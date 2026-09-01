const { Worker } = require('bullmq')
const getRedisConnection = require('../queue/redis')
const axios = require('axios')
const Tx = require('../../models/transaction')
const register = require('../monitoring/prometheus')
const logger = require('../../utils/logger')

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317'
const txJobCounter = register.txJobCounter

const worker = new Worker(
  'transactions',
  async job => {
    const { txId, signedTx, from, to, amount, type, metadata } = job.data
    const tx = await Tx.findById(txId)
    if (!tx) {
      throw new Error(`Transaction record ${txId} not found`)
    }

    tx.status = 'processing'
    tx.updatedAt = Date.now()
    await tx.save()
    txJobCounter.inc({ status: 'processing' })

    const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/transfer`
    const response = await axios.post(url, signedTx, { timeout: 20000 })
    const txHash = response.data?.txhash || response.data?.txHash || response.data?.hash || response.data?.tx_response?.txhash

    tx.status = 'completed'
    tx.txHash = txHash || null
    tx.updatedAt = Date.now()
    await tx.save()

    txJobCounter.inc({ status: 'completed' })
    return { txHash }
  },
  {
    connection: getRedisConnection(),
    concurrency: 4
  }
)

worker.on('completed', job => {
  logger.info('transactionWorker', `Job ${job.id} completed`)
})

worker.on('failed', async (job, err) => {
  txJobCounter.inc({ status: 'failed' })
  if (!job) return
  const attemptsMade = Number(job.attemptsMade || 0)
  const maxAttempts = Number(job.opts?.attempts || 3)
  const finalFailure = attemptsMade + 1 >= maxAttempts
  try {
    if (job.data && job.data.txId) {
      const tx = await Tx.findById(job.data.txId)
      if (tx) {
        tx.status = finalFailure ? 'failed' : 'retrying'
        tx.error = err?.message || 'unknown error'
        tx.updatedAt = Date.now()
        await tx.save()
      }
    }
  } catch (saveError) {
    logger.error(
      'transactionWorker',
      `Error saving failed transaction status after job ${job.id} failure`,
      saveError,
      { txId: job.data?.txId },
    )
  }
  if (finalFailure) {
    logger.error(
      'transactionWorker',
      `Job ${job.id} (tx ${job.data?.txId || 'unknown'}) exhausted all retries — tx moved to failed`,
      err,
      { jobId: job.id, txId: job.data?.txId, attemptsMade: attemptsMade + 1, maxAttempts },
    )
  } else {
    logger.warn(
      'transactionWorker',
      `Job ${job.id} (tx ${job.data?.txId || 'unknown'}) attempt ${attemptsMade + 1}/${maxAttempts} failed — will retry`,
      { jobId: job.id, txId: job.data?.txId, attemptsMade: attemptsMade + 1, maxAttempts },
    )
  }
})

module.exports = worker
