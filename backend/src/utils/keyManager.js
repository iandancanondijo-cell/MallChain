const axios = require('axios')

// Production-readiness T3: this file previously made a single-shot Vault
// call with no retry on a transient 429/5xx, and only supported a static
// long-lived VAULT_TOKEN with no periodic-renewal auth method. A Vault blip
// (or restart, or rate limit) failed treasury/operator/faucet signing
// outright with no chance to recover.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * Retries a Vault HTTP call on 429/5xx with exponential backoff.
 * Non-retryable errors (4xx auth/permission failures, network errors with
 * no response) fail immediately. Reads VAULT_MAX_RETRIES/
 * VAULT_RETRY_BASE_DELAY_MS on every call (not cached at module load) so
 * they can be tuned — or overridden in tests — without a process restart.
 */
async function withVaultRetry(fn) {
  const maxRetries = Number(process.env.VAULT_MAX_RETRIES || 3)
  const baseDelayMs = Number(process.env.VAULT_RETRY_BASE_DELAY_MS || 200)
  let lastErr
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const status = e.response && e.response.status
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt || !isRetryableStatus(status)) throw e
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
  throw lastErr
}

// AppRole auth: exchanges VAULT_ROLE_ID/VAULT_SECRET_ID for a short-lived
// client token instead of a single static long-lived VAULT_TOKEN — a leaked
// AppRole secret_id is scoped to a role and its lease naturally expires;
// a leaked static token has no such blast-radius limit. Cached in-memory
// until shortly before its lease expires (80% of the lease duration) so
// every secret fetch doesn't re-authenticate.
let cachedAppRoleToken = null
let cachedAppRoleTokenExpiresAt = 0

function usesAppRole() {
  return Boolean(process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID)
}

async function getVaultToken(VAULT_ADDR) {
  if (!usesAppRole()) {
    return process.env.VAULT_TOKEN || null
  }

  const now = Date.now()
  if (cachedAppRoleToken && now < cachedAppRoleTokenExpiresAt) {
    return cachedAppRoleToken
  }

  const loginUrl = `${VAULT_ADDR}/v1/auth/approle/login`
  const res = await withVaultRetry(() =>
    axios.post(loginUrl, { role_id: process.env.VAULT_ROLE_ID, secret_id: process.env.VAULT_SECRET_ID }, { timeout: 5000 })
  )
  const auth = res.data && res.data.auth
  if (!auth || !auth.client_token) throw new Error('Vault AppRole login did not return a client token')

  cachedAppRoleToken = auth.client_token
  const leaseSeconds = Number(auth.lease_duration) || 3600
  cachedAppRoleTokenExpiresAt = now + leaseSeconds * 1000 * 0.8
  return cachedAppRoleToken
}

async function _fromVaultOrThrow(secretKeyFallbackName, envFallbackName, vaultFieldName = 'mnemonic') {
  const VAULT_ADDR = process.env.VAULT_ADDR
  const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/marketplace/treasury'

  if (!VAULT_ADDR) return null

  let token
  try {
    token = await getVaultToken(VAULT_ADDR)
  } catch (e) {
    console.error('Vault AppRole login failed', e && e.message ? e.message : e)
    throw new Error(`Failed to authenticate to Vault for ${vaultFieldName}`)
  }
  if (!token) return null

  try {
    const url = `${VAULT_ADDR}/v1/${VAULT_SECRET_PATH}`
    const r = await withVaultRetry(() => axios.get(url, { headers: { 'X-Vault-Token': token }, timeout: 5000 }))
    // KV v2 nests the actual fields two levels deep — { data: { data: {...}, metadata: {...} } }
    // — one level further than KV v1's flat { data: {...} }. VAULT_SECRET_PATH's default
    // ("secret/data/marketplace/treasury") is itself the KV-v2 URL convention, so prefer the
    // double-unwrap and only fall back to the single-unwrap for a KV v1 mount.
    const outer = (r.data && r.data.data) || r.data || {}
    const data = (outer.data && typeof outer.data === 'object') ? outer.data : outer
    const val = data[vaultFieldName] || data[secretKeyFallbackName] || data.mnemonic || data.value
    if (val) return val
    throw new Error(`vault response missing ${vaultFieldName}`)
  } catch (e) {
    console.error(`Vault fetch failed (${vaultFieldName})`, e && e.message ? e.message : e)
    throw new Error(`Failed to retrieve mnemonic from Vault (${secretKeyFallbackName} / ${vaultFieldName})`)
  }
}

async function getTreasuryMnemonic(){
  const fromVault = await _fromVaultOrThrow('treasuryMnemonic', 'TREASURY_MNEMONIC', 'treasury_mnemonic')
  if (fromVault) return fromVault

  // TEST_MODE: allow environment fallback for local test runs only
  if (process.env.TEST_MODE === 'true') {
    if (process.env.TREASURY_MNEMONIC) return process.env.TREASURY_MNEMONIC
    throw new Error('TEST_MODE enabled but TREASURY_MNEMONIC not provided')
  }

  throw new Error('Treasury mnemonic not configured; configure Vault (VAULT_ADDR/VAULT_TOKEN or VAULT_ADDR/VAULT_ROLE_ID/VAULT_SECRET_ID) or enable TEST_MODE with TREASURY_MNEMONIC for local testing')
}

async function getOperatorMnemonic() {
  const fromVault = await _fromVaultOrThrow('operatorMnemonic', 'OPERATOR_MNEMONIC', 'operator_mnemonic')
  if (fromVault) return fromVault

  if (process.env.ALLOW_OPERATOR_MNEMONIC === 'true' || process.env.TEST_MODE === 'true') {
    if (process.env.OPERATOR_MNEMONIC) return process.env.OPERATOR_MNEMONIC
    throw new Error('OPERATOR_MNEMONIC not provided')
  }
  throw new Error('Operator mnemonic not configured; configure Vault (VAULT_ADDR/VAULT_TOKEN or VAULT_ADDR/VAULT_ROLE_ID/VAULT_SECRET_ID) or set ALLOW_OPERATOR_MNEMONIC=true for local dev')
}

async function getFaucetMnemonic() {
  const fromVault = await _fromVaultOrThrow('faucetMnemonic', 'FAUCET_MNEMONIC', 'faucet_mnemonic')
  if (fromVault) return fromVault

  // TEST_MODE + local dev: allow plaintext env var. Production MUST use Vault.
  if (process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production') {
    if (process.env.FAUCET_MNEMONIC) return process.env.FAUCET_MNEMONIC
    throw new Error('FAUCET_MNEMONIC not provided (and Vault unreachable)')
  }
  throw new Error('Faucet mnemonic not configured; in production this MUST come from Vault (VAULT_ADDR/VAULT_TOKEN or VAULT_ADDR/VAULT_ROLE_ID/VAULT_SECRET_ID) with faucet_mnemonic key')
}

module.exports = {
  getTreasuryMnemonic,
  getOperatorMnemonic,
  getFaucetMnemonic,
  // exported for tests only — resets the AppRole token cache between cases
  _resetAppRoleTokenCache: () => { cachedAppRoleToken = null; cachedAppRoleTokenExpiresAt = 0 },
}
