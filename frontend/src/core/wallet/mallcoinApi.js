import { appConfig } from '../../config/app'
import { mlcnsFromBaseUnits } from '../../config/tokens'

const API = appConfig.apiUrl

export async function fetchMlcnsBalance(address) {
  const res = await fetch(`${API}/send/mlcns/balance/${encodeURIComponent(address)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load MLCNS balance')
  return data
}

export async function fetchMlcnsPrice() {
  const res = await fetch(`${API}/send/mlcns/price`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load price')
  return data
}

export async function fetchMallpointsBalance(address) {
  const res = await fetch(`${API}/mallpoints/${encodeURIComponent(address)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load Mallpoints')
  return {
    balance: Number(data.balance || 0),
    chainPoints: Number(data.chainPoints ?? data.sources?.chain ?? 0),
    dbPoints: Number(data.dbPoints ?? data.sources?.database ?? 0),
    pointPriceKes: Number(data.pointPrice || 2),
    lastConversionAt: data.lastConversionAt,
    conversionWindow: data.conversionWindow,
    badge: data.badge || { exists: false },
    conversionStatus: data.conversionStatus || null,
    convertiblePoints: Number(data.convertiblePoints || 0),
  }
}

export async function syncMallpointsProfile(address) {
  const res = await fetch(`${API}/mallpoints/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to sync Mallpoints profile')
  return {
    balance: Number(data.balance || 0),
    chainPoints: Number(data.chainPoints || 0),
    dbPoints: Number(data.dbPoints || 0),
    pointPriceKes: Number(data.pointPrice || 2),
    lastConversionAt: data.lastConversionAt,
    conversionWindow: data.conversionWindow,
    badge: data.badge || { exists: false },
    conversionStatus: data.conversionStatus || null,
    convertiblePoints: Number(data.convertiblePoints || 0),
  }
}

export async function fetchFaucetStatus() {
  const res = await fetch(`${API}/faucet/status`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Faucet unavailable')
  return data
}

export async function requestFaucetMlcns(address, amountMlcns) {
  const res = await fetch(`${API}/faucet/mlcns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amountMlcns }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.detail || 'Faucet request failed')
  return data
}

export async function convertMallpointsToMlcns(address) {
  const res = await fetch(`${API}/mallpoints/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Conversion failed')
  return data
}

export function formatMlcnsDisplay(walletBalancePayload) {
  const available =
    walletBalancePayload?.availableDisplay ??
    mlcnsFromBaseUnits(walletBalancePayload?.available || 0)
  return Number(available) || 0
}
