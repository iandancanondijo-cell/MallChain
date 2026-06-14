const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing')
const fs = require('fs')

(async ()=>{
  const m = process.env.MNEMONIC
  if (!m) {
    console.error('ERROR: MNEMONIC environment variable is required. Do NOT store mnemonics on disk.');
    process.exit(1);
  }
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(m, { prefix: 'mall' })
  const accounts = await wallet.getAccounts()
  console.log(accounts[0].address)
})().catch(e=>{ console.error(e); process.exit(1) })
