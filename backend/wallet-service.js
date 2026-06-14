/**
 * Standalone Public-Key-Only Wallet Service for Mallchain
 * Derives addresses from public keys only. NO private keys are handled.
 * All signing MUST happen client-side in browser/mobile.
 */

const express = require('express')
const cors = require('cors')
const { toWords, encode } = require('bech32')
const crypto = require('crypto')

const app = express()
const PORT = Number(process.env.WALLET_SERVICE_PORT || 4001)
const HOST = process.env.WALLET_SERVICE_HOST || '127.0.0.1'
const HRP = process.env.CHAIN_PREFIX || process.env.HRP || 'mall'

app.use(cors())
app.use(express.json({ limit: '100kb' }))

/**
 * Generate bech32 address from secp256k1 public key (hex).
 */
function generateAddressFromPublicKey(publicKeyHex) {
  const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
  const sha256Hash = crypto.createHash('sha256').update(publicKeyBytes).digest()
  const words = toWords(Buffer.from(sha256Hash))
  return encode(HRP, words)
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wallet-service', version: '2.0.0-public-only' })
})

// GET /address/:publicKey - Generate address from a hex-encoded public key
app.get('/address/:publicKey', (req, res) => {
  try {
    const { publicKey } = req.params
    const address = generateAddressFromPublicKey(publicKey)
    res.json({ success: true, address })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// POST /address - Generate address from a public key in request body
app.post('/address', (req, res) => {
  try {
    const { publicKey } = req.body
    if (!publicKey) {
      return res.status(400).json({ success: false, error: 'publicKey is required' })
    }
    const address = generateAddressFromPublicKey(publicKey)
    res.json({ success: true, address })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

/* 
 * SECURITY NOTICE:
 * 
 * Private keys, mnemonics, and transaction signing are intentionally NOT
 * handled by this service. These operations MUST be performed client-side 
 * using the user's own wallet software (e.g., Keplr, Cosmostation, or 
 * a custom in-browser signer using @cosmjs/amino or @cosmjs/proto-signing).
 *
 * Sending a private key over the network — even to localhost — is a 
 * critical security vulnerability. This service follows a PUBLIC-KEY-ONLY 
 * architecture.
 */

// Start server (localhost only — safe for public-key operations)
app.listen(PORT, HOST, () => {
  console.log(`🚀 Public-Key-Only Wallet Service running on http://${HOST}:${PORT}`)
  console.log(`📍 Health check: http://${HOST}:${PORT}/health`)
  console.log(`📍 Derive address: GET http://localhost:${PORT}/address/{publicKey}`)
})
