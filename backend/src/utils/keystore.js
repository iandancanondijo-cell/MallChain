const axios = require('axios')

async function getTreasuryMnemonic(){
  // Prefer environment variable
  if (process.env.TREASURY_MNEMONIC) return process.env.TREASURY_MNEMONIC

  // Try HashiCorp Vault KV v2 if configured
  const VAULT_ADDR = process.env.VAULT_ADDR
  const VAULT_TOKEN = process.env.VAULT_TOKEN
  const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/marketplace/treasury'
  if (VAULT_ADDR && VAULT_TOKEN) {
    try {
      const url = `${VAULT_ADDR.replace(/\/$/, '')}/v1/${VAULT_SECRET_PATH}`
      const r = await axios.get(url, { headers: { 'X-Vault-Token': VAULT_TOKEN } })
      const secret = r.data && r.data.data && (r.data.data.data || r.data.data)
      if (secret && secret.TREASURY_MNEMONIC) return secret.TREASURY_MNEMONIC
    } catch (e) {
      console.error('vault fetch failed', e && e.message ? e.message : e)
    }
  }

  // Other secret managers (AWS SSM/Secrets Manager) can be added here.

  return null
}

module.exports = { getTreasuryMnemonic }
