const {
  SigningStargateClient,
  GasPrice
} = require('@cosmjs/stargate')


const {
  DirectSecp256k1HdWallet
} = require('@cosmjs/proto-signing')


let client = null
let wallet = null


const { config } = require('../config')
const RPC_URL = config.chain.rpc
const PREFIX = config.chain.prefix
const CHAIN_ID = config.chain.id
const CHAIN_REST = config.chain.rest


async function initializeBlockchain() {
  if (client) {
    return client
  }


  const mnemonic = process.env.OPERATOR_MNEMONIC

  if (!mnemonic) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing OPERATOR_MNEMONIC')
    }
    if (process.env.ALLOW_OPERATOR_MNEMONIC !== 'true') {
      throw new Error('Missing OPERATOR_MNEMONIC. In development, set ALLOW_OPERATOR_MNEMONIC=true to opt into operator signing (not recommended).');
    }
    console.warn('ALLOW_OPERATOR_MNEMONIC=true: initializing blockchain client with OPERATOR_MNEMONIC from env (dev only)');
  }


  wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    mnemonic,
    {
      prefix: PREFIX
    }
  )


  client = await SigningStargateClient.connectWithSigner(
    RPC_URL,
    wallet,
    {
      gasPrice: GasPrice.fromString(config.chain.gasPrice),
      broadcastPollIntervalMs: Number(process.env.BROADCAST_POLL_INTERVAL_MS || 500),
      broadcastTimeoutMs: Number(process.env.BROADCAST_TIMEOUT_MS || 60000)
    }
  )


  console.log('Blockchain client initialized')


  return client
}


async function getClient() {
  if (!client) {
    await initializeBlockchain()
  }


  return client
}


async function getWalletAddress() {
  const accounts = await wallet.getAccounts()
  return accounts[0].address
}


module.exports = {
  initializeBlockchain,
  getClient,
  getWalletAddress
}


// Simulate a set of messages to estimate gas
async function simulate(msgs, memo = '') {
  const c = await getClient()
  return c.simulate(await getWalletAddress(), msgs, memo)
}

// Sign and broadcast server-side using operator wallet
async function signAndBroadcast(msgs, fee, memo = '') {
  const c = await getClient()
  const from = await getWalletAddress()
  const resp = await c.signAndBroadcast(from, msgs, fee, memo)
  return resp
}

// Broadcast a pre-signed base64 tx via REST endpoint
const axios = require('axios')
async function broadcastRawTxBase64(txBytesBase64, mode = 'BROADCAST_MODE_SYNC') {
  const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`
  const payload = { tx_bytes: txBytesBase64, mode }
  const r = await axios.post(url, payload, { timeout: 10000 })
  return r.data
}

module.exports = Object.assign(module.exports, {
  simulate,
  signAndBroadcast,
  broadcastRawTxBase64,
  CHAIN_REST,
})
