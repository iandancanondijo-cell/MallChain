const { Queue } = require('bullmq')
const getRedisConnection = require('./redis')

// Dead-letter queue for M-Pesa/B2C callbacks that failed to process
// synchronously (see routes/buy.js, services/b2cPayoutService.js). Safaricom
// already retries a non-200/non-zero ResultCode response on its own, but
// that retry window is short and outside our control — this queue is the
// durable fallback so a genuine failure (a DB blip, a bug) is retried a few
// more times on our own schedule and, if still unresolved, sits visible in
// BullMQ's failed set (removeOnFail: false) for manual replay instead of
// vanishing once Safaricom gives up.
let queue = null

function getPaymentCallbackQueue() {
  if (!queue) {
    const connection = getRedisConnection()
    queue = new Queue('payment-callbacks', {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    })
    try {
      const { registerQueueForMetrics } = require('../monitoring/prometheus')
      registerQueueForMetrics('payment_callbacks', async () => queue)
    } catch (_) { /* monitoring optional */ }
  }
  return queue
}

/** Best-effort enqueue — a Redis outage here must not throw back into the webhook handler. */
async function enqueueFailedCallback(kind, payload) {
  try {
    await getPaymentCallbackQueue().add(kind, payload)
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[paymentCallbackQueue] failed to enqueue for retry', err?.message || err)
    return false
  }
}

module.exports = { getPaymentCallbackQueue, enqueueFailedCallback }
