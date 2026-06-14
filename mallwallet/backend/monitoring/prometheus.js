const client = require('prom-client')

const register = new client.Registry()

client.collectDefaultMetrics({ register })

module.exports = register
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})