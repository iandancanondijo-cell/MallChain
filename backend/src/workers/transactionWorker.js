const { Worker } = require('bullmq')
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379)
}

const Transaction = require('../models/transaction')
const { broadcastTransaction } = require('../services/transactionService')

const worker = new Worker(
  'transactions',
  async job => {
    const { transactionId, from, to, amount, denom } = job.data

    const tx = await Transaction.findById(transactionId)

    if (!tx) {
      throw new Error('Transaction not found')
    }

    try {
      tx.status = 'broadcasting'
      await tx.save()

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

        // Poll the REST endpoint for tx inclusion
        const axios = require('axios')
        const CHAIN_REST = require('../utils/cosmosClient').CHAIN_REST
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

      console.log('Transaction result:', tx.txHash, tx.status)

      if (global.io) {
        global.io.emit('tx:update', {
          transactionId: tx._id,
          status: tx.status,
          txHash: tx.txHash,
          height: tx.blockHeight
        })
      }

      return result
    } catch (error) {
      tx.status = 'failed'
      tx.error = error.message
      tx.retryCount += 1


      await tx.save()


      console.error('Transaction failed:', error.message)


      throw error
    }
  },
  {
    connection,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
)

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`)
})


worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed`, err)
})

module.exports = worker
