import { appConfig } from '../../config/app'

const API = appConfig.apiUrl

export async function fetchEconomyState() {
  const res = await fetch(`${API}/economy/state`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load economy state')
  return data
}

export async function fetchEconomyUser(address) {
  const res = await fetch(`${API}/economy/user/${encodeURIComponent(address)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load user economy')
  return data
}

export async function fetchEconomyWallets() {
  const res = await fetch(`${API}/economy/wallets`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load wallet allocations')
  return data.wallets
}