require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const http = require('http')
const { Server } = require('socket.io')

// Declare app and dependencies before use
const app = express()
const rateLimiter = require('./middleware/rateLimiter')
const treasuryRoutes = require('./routes/treasury')
const explorerRoutes = require('./routes/explorer')
const transactionQueue = require('./queue/transactionQueue')

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317'
const PORT = Number(process.env.MALLWALLET_PORT || process.env.PORT || 4002)

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json())
app.use(rateLimiter)

app.use('/explorer', explorerRoutes)
app.use('/api/treasury', treasuryRoutes)

app.get('/health', (_req, res) => res.json({ ok: true }))

// Queue a transaction for processing
app.post('/send', async (req, res) => {
  try {
    const { from, to, amount } = req.body
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'from, to, and amount are required' })
    }
    await transactionQueue.add('sendTx', { from, to, amount })
    res.json({ queued: true, message: 'Transaction queued successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Query Cosmos bank balances — returns first MLC/mlc denom amount or 0
app.get('/balance/:address', async (req, res) => {
  try {
    const url = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${req.params.address}`
    const r = await axios.get(url, { timeout: 5000 })
    const balances = r.data?.balances || []
    if (balances.length) {
      const found = balances.find(b => /mlc/i.test(b.denom)) || balances[0]
      return res.json({ balance: found?.amount || '0' })
    }
    return res.json({ balance: '0' })
  } catch (e) {
    /* chain unavailable — return zero balance */
    return res.json({ balance: '0' })
  }
})

// Create HTTP server and Socket.IO for real-time balance updates
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
})

io.on('connection', socket => {
  socket.on('subscribe:wallet', address => {
    socket.join(`wallet:${address}`)
  })
  socket.on('unsubscribe:wallet', address => {
    socket.leave(`wallet:${address}`)
  })
})

// Expose io for workers to emit balance updates
module.exports.io = io

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mallwallet service running on http://127.0.0.1:${PORT}`)
})
