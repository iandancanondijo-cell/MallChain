const { Worker } = require('bullmq')
const getRedisConnection = require('../queue/redis')
const axios = require('axios')
const Tx = require('../../models/transaction')
const register = require('../monitoring/prometheus')

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
  console.log(`Job ${job.id} completed`)
})

worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed`, err)
  if (job.data && job.data.txId) {
    try {
      const tx = await Tx.findById(job.data.txId)
      if (tx) {
        tx.status = 'failed'
        tx.error = err?.message || 'unknown error'
        tx.updatedAt = Date.now()
        await tx.save()
      }
    } catch (saveError) {
      console.error('Error saving failed transaction status', saveError)
    }
  }
  txJobCounter.inc({ status: 'failed' })
})

module.exports = worker
