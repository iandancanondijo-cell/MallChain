const { Worker } = require('bullmq')
const getRedisConnection = require('../queue/redis')
const logger = require('../../utils/logger')
const { processMpesaCallback } = require('../../services/mpesaCallbackService')

// Consumes the DLQ populated by routes/buy.js when a callback fails to
// process inline. Reuses the exact same processMpesaCallback/
// handlePayoutCallback functions the live webhook route calls — both are
// idempotent (see their "already processed" guards), so replaying a job
// here after the live route already succeeded via Safaricom's own retry is
// safe and simply a no-op.
const worker = new Worker(
  'payment-callbacks',
  async job => {
    if (job.name === 'mpesa') {
      return processMpesaCallback(job.data)
    }
    if (job.name === 'payout') {
      const { handlePayoutCallback } = require('../../services/b2cPayoutService')
      return handlePayoutCallback(job.data)
    }
    throw new Error(`unknown payment-callback job type: ${job.name}`)
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
)

worker.on('completed', job => {
  logger.info('paymentCallbackWorker', 'replayed callback succeeded', { jobId: job.id, kind: job.name })
})

worker.on('failed', (job, err) => {
  logger.error('paymentCallbackWorker', 'replayed callback failed', err, {
    jobId: job?.id,
    kind: job?.name,
    attemptsMade: job?.attemptsMade,
  })
})

module.exports = worker
