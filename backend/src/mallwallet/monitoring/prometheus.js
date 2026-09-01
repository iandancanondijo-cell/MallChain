const client = require('prom-client')
const { register } = require('../../utils/metrics')

const txJobCounter = new client.Counter({
  name: 'marketplace_tx_job_status_total',
  help: 'Transaction queue job count by final status',
  labelNames: ['status'],
  registers: [register],
})

const queueDepthGauge = new client.Gauge({
  name: 'marketplace_queue_depth',
  help: 'BullMQ queue depth by queue name and state (active/wait/delayed/failed/completed)',
  labelNames: ['queue', 'state'],
  registers: [register],
  async collect() {
    const queues = global.__queueGauges || []
    for (const { name, getQueue } of queues) {
      try {
        const q = await getQueue()
        if (!q) continue
        const counts = await q.getJobCounts(
          'active',
          'wait',
          'delayed',
          'failed',
          'completed',
          'paused',
        )
        for (const [state, v] of Object.entries(counts || {})) {
          queueDepthGauge.set({ queue: name, state }, Number(v) || 0)
        }
      } catch (_) {
        /* unavailable for this scrape; values will simply remain from last successful */
      }
    }
  },
})

function registerQueueForMetrics(name, getQueue) {
  global.__queueGauges = global.__queueGauges || []
  global.__queueGauges.push({ name, getQueue })
}

register.txJobCounter = txJobCounter
register.queueDepthGauge = queueDepthGauge
register.registerQueueForMetrics = registerQueueForMetrics

module.exports = register
