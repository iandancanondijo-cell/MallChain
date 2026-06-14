#!/usr/bin/env node
// Headless integration script: sign & broadcast MsgTransferMallcoin
// Usage: TEST_MNEMONIC="..." TO="mall1..." AMOUNT=100 node scripts/send_mlcoin_msg.js

const { DirectSecp256k1HdWallet, Registry } = require('@cosmjs/proto-signing')
const { SigningStargateClient } = require('@cosmjs/stargate')
const protobuf = require('protobufjs')

async function main(){
  const mnemonic = process.env.TEST_MNEMONIC
    if (!mnemonic) {
      console.error('ERROR: TEST_MNEMONIC environment variable is required for this script.');
      console.error('Set TEST_MNEMONIC in your shell or CI secrets. Do NOT hardcode mnemonics in source.');
      process.exit(1);
  }
  const to = process.env.TO
  const amount = process.env.AMOUNT || '1'
  const RPC = process.env.RPC || 'http://127.0.0.1:26657'
  const PREFIX = process.env.PREFIX || 'mall'
  const CHAIN_ID = process.env.CHAIN_ID || 'testing-1'

  console.log('Loading proto...')
  const root = await protobuf.load('proto/marketplace/mlcoin/v1/tx.proto')
  const MsgType = root.lookupType('marketplace.mlcoin.v1.MsgTransferMallcoin')

  const typeUrl = '/marketplace.mlcoin.v1.MsgTransferMallcoin'

  // Registry wrapper for protobufjs Type
  const registry = new Registry()
  registry.register(typeUrl, {
    encode: (msg) => {
      // Ensure uint64 fields are numbers or strings; protobufjs will encode correctly
      const err = MsgType.verify(msg)
      if(err) throw new Error('invalid msg: ' + err)
      const message = MsgType.create(msg)
      return MsgType.encode(message).finish()
    }
  })

  console.log('Creating wallet...')
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: PREFIX })
  const [account] = await wallet.getAccounts()
  console.log('Using account', account.address)

  console.log('Connecting to RPC', RPC)
  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, { registry })

  const msg = {
    creator: account.address,
    amount: String(amount),
    to: to || account.address
  }

  const fee = { amount: [{ denom: 'mlc', amount: '0' }], gas: '200000' }

  console.log('Broadcasting MsgTransferMallcoin', msg)
  const res = await client.signAndBroadcast(account.address, [ { typeUrl, value: msg } ], fee)
  console.log('Result:', res)
  process.exit(0)
}

main().catch(e=>{console.error(e); process.exit(1)})
