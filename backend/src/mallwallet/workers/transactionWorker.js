const { Worker } = require('bullmq')
const { getBullMQConnection } = require('../queue/redis')
const axios = require('axios')
const Tx = require('../../models/transaction')
const register = require('../monitoring/prometheus')
const logger = require('../../utils/logger')
const { broadcastTransaction } = require('../../services/transactionService')

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317'
const txJobCounter = register.txJobCounter

// 'tx-relay' jobs: client-signed tx JSON posted to the MLcoin module REST endpoint
async function handleRelay(job) {
  const { txId, signedTx } = job.data
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
}

// 'broadcast' jobs: SDK-level broadcast (client signedTxBase64 or server-side
// operator signing) with REST inclusion polling and 'tx:update' socket events
async function handleBroadcast(job) {
  const { from, to, amount, denom } = job.data
  const txRef = job.data.txId || job.data.transactionId
  const tx = await Tx.findById(txRef)
  if (!tx) {
    throw new Error(`Transaction record ${txRef} not found`)
  }

  try {
    tx.status = 'broadcasting'
    await tx.save()
    txJobCounter.inc({ status: 'processing' })

    // Prefer server-side signing if operator mnemonic exists
    const serverSign = Boolean(process.env.OPERATOR_MNEMONIC)
    const signedTx = job.data.signedTx || null

    const result = await broadcastTransaction({
      from,
      to,
      amount,
      denom,
      signedTxBase64: signedTx,
      serverSign
    })

    // Normalize tx hash and height
    const txHash =
      result.transactionHash ||
      result.tx_response?.txhash ||
      result.txhash ||
      result.transaction?.hash ||
      result.hash ||
      null
    const height = Number(result.height || result.tx_response?.height || 0)

    tx.txHash = txHash || tx.txHash
    tx.blockHeight = height || tx.blockHeight

    // If we have a hash but no height, switch to pending and poll for inclusion
    if (tx.txHash && (!tx.blockHeight || tx.blockHeight === 0)) {
      tx.status = 'pending'
      await tx.save()

      const timeoutMs = Number(process.env.TX_CONFIRM_TIMEOUT_MS || 120000)
      const pollInterval = Number(process.env.TX_POLL_INTERVAL_MS || 2000)
      const start = Date.now()
      let found = false

      while (Date.now() - start < timeoutMs) {
        try {
          const r = await axios.get(`${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs/${tx.txHash}`)
          const txResp = r.data.tx_response || r.data
          if (txResp && txResp.code !== undefined) {
            tx.blockHeight = Number(txResp.height || tx.blockHeight || 0)
            tx.status = txResp.code === 0 ? 'confirmed' : 'failed'
            if (txResp.raw_log) tx.error = txResp.raw_log
            await tx.save()
            found = true
            break
          }
        } catch (e) {
          // not found yet
        }
        await new Promise(r => setTimeout(r, pollInterval))
      }

      if (!found) {
        // leave as pending for manual inspection or further retries
        tx.status = 'pending'
        await tx.save()
      }
    } else {
      tx.status = 'confirmed'
      await tx.save()
    }

    if (global.io) {
      global.io.emit('tx:update', {
        transactionId: tx._id,
        status: tx.status,
        txHash: tx.txHash,
        height: tx.blockHeight
      })
    }

    txJobCounter.inc({ status: 'completed' })
    return result
  } catch (error) {
    tx.status = 'failed'
    tx.error = error.message
    tx.retryCount += 1
    await tx.save()
    throw error
  }
}

const worker = new Worker(
  'transactions',
  async job => {
    if (job.name === 'broadcast') {
      return handleBroadcast(job)
    }
    return handleRelay(job)
  },
  {
    connection: getBullMQConnection(),
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
    const txId = job.data?.txId || job.data?.transactionId
    if (txId) {
      const tx = await Tx.findById(txId)
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
      { txId: job.data?.txId || job.data?.transactionId },
    )
  }
  if (finalFailure) {
    logger.error(
      'transactionWorker',
      `Job ${job.id} (tx ${job.data?.txId || job.data?.transactionId || 'unknown'}) exhausted all retries — tx moved to failed`,
      err,
      { jobId: job.id, txId: job.data?.txId || job.data?.transactionId, attemptsMade: attemptsMade + 1, maxAttempts },
    )
  } else {
    logger.warn(
      'transactionWorker',
      `Job ${job.id} (tx ${job.data?.txId || job.data?.transactionId || 'unknown'}) attempt ${attemptsMade + 1}/${maxAttempts} failed — will retry`,
      { jobId: job.id, txId: job.data?.txId || job.data?.transactionId, attemptsMade: attemptsMade + 1, maxAttempts },
    )
  }
})

module.exports = worker
