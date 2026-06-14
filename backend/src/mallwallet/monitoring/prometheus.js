const client = require('prom-client')

const register = new client.Registry()
client.collectDefaultMetrics({ register })

const txJobCounter = new client.Counter({
  name: 'marketplace_tx_job_status_total',
  help: 'Transaction queue job count by final status',
  labelNames: ['status'],
  registers: [register]
})

register.txJobCounter = txJobCounter

module.exports = register
