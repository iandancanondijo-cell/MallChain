#!/usr/bin/env node
// Simple operator HTTP server that uses the local `marketplaced` CLI to send mlc.
// Only accepts connections from localhost. Input is validated before being passed
// to child_process.spawn (no shell injection possible — args are an array, not a string).
// Usage: set OPERATOR_KEY, MARKETPLACED_PATH, then: node operator_server.js

const http   = require('http')
const { spawn } = require('child_process')
const crypto = require('crypto')

const PORT         = Number(process.env.OPERATOR_PORT     || 8081)
const MARKETPLACED = process.env.MARKETPLACED_PATH        || './build/marketplaced'
const OPERATOR_KEY = process.env.OPERATOR_KEY             || 'operator'
const HOME         = process.env.MARKETPLACE_HOME         || 'marketplace/build/node1'
const CHAIN_ID     = process.env.OPERATOR_CHAIN_ID        || 'mallchain-1'

// Address: bech32 mall1... — alphanumeric only after prefix
const ADDR_RE   = /^mall1[a-z0-9]{38,58}$/
// Amount: digits followed by a known denom token
const AMOUNT_RE = /^\d{1,20}(mlc|stake|umlc|umal)$/

function validateAddress(addr) {
  if (typeof addr !== 'string') return false
  return ADDR_RE.test(addr.trim())
}

function validateAmount(amount) {
  if (typeof amount !== 'string') return false
  return AMOUNT_RE.test(amount.trim())
}

function runSend(recipient, amount, cb) {
  // Args are passed as an array — never concatenated into a shell string
  const args = [
    'tx', 'bank', 'send',
    OPERATOR_KEY, recipient, amount,
    '--chain-id', CHAIN_ID,
    '--home', HOME,
    '--keyring-backend', 'test',
    '-y',
  ]
  const p = spawn(MARKETPLACED, args, { shell: false })
  let out = ''
  let err = ''
  p.stdout.on('data', d => { out += d.toString() })
  p.stderr.on('data', d => { err += d.toString() })
  p.on('close', code => cb(code, out, err))
}

const server = http.createServer((req, res) => {
  // Only bind to loopback — reject any request not from 127.0.0.1
  const remoteAddr = req.socket.remoteAddress
  if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
    res.writeHead(403)
    res.end('forbidden')
    return
  }

  if (req.method === 'POST' && req.url === '/fund') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const j = JSON.parse(body)
        const recipient = String(j.address || '').trim()
        const amount    = String(j.amount  || '1000mlc').trim()

        if (!validateAddress(recipient)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'invalid address format' }))
          return
        }

        if (!validateAmount(amount)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'invalid amount format (e.g. 1000mlc)' }))
          return
        }

        runSend(recipient, amount, (code, out, err) => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, out }))
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, code, out, err }))
          }
        })
      } catch (e) {
        res.writeHead(400)
        res.end('invalid json')
      }
    })
    return
  }

  res.writeHead(404)
  res.end('not found')
})

// Bind to loopback only — never 0.0.0.0
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Operator server listening on http://127.0.0.1:${PORT}`)
})
