const axios = require('axios')

async function getTreasuryMnemonic(){
  // Prefer Vault: require VAULT_ADDR + VAULT_TOKEN to be set in production.
  // For local testing, set TEST_MODE=true and provide TREASURY_MNEMONIC env var.
  const VAULT_ADDR = process.env.VAULT_ADDR
  const VAULT_TOKEN = process.env.VAULT_TOKEN
  const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/marketplace/treasury'

  if (VAULT_ADDR && VAULT_TOKEN) {
    try {
      const url = `${VAULT_ADDR}/v1/${VAULT_SECRET_PATH}`
      const r = await axios.get(url, { headers: { 'X-Vault-Token': VAULT_TOKEN }, timeout: 5000 })
      // Expect Vault KV v2 shape: { data: { data: { mnemonic: '...' }}}
      const mn = (r.data && r.data.data && (r.data.data.mnemonic || r.data.data.value)) || (r.data && r.data.data && r.data.data.mnemonic)
      if (mn) return mn
      throw new Error('vault response missing mnemonic')
    } catch (e) {
      console.error('Vault fetch failed', e && e.message ? e.message : e)
      throw new Error('Failed to retrieve mnemonic from Vault')
    }
  }

  // TEST_MODE: allow environment fallback for local test runs only
  if (process.env.TEST_MODE === 'true') {
    if (process.env.TREASURY_MNEMONIC) return process.env.TREASURY_MNEMONIC
    throw new Error('TEST_MODE enabled but TREASURY_MNEMONIC not provided')
  }

  throw new Error('Treasury mnemonic not configured; configure Vault (VAULT_ADDR/VAULT_TOKEN) or enable TEST_MODE with TREASURY_MNEMONIC for local testing')
}

module.exports = { getTreasuryMnemonic }
