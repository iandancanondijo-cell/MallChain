import { appConfig } from '../../config/app'
import { TOKENS } from '../../config/tokens'
import { fetchMlcnsBalance, fetchMlcnsPrice } from './mallcoinApi'
import { estimateMlcnsTransfer } from './mallcoinTx'

const API = appConfig.apiUrl
const RECENT_KEY = 'mlcns_recent_recipients'
const MAX_RECENT = 8

export function isAddressFormatValid(address) {
  const prefix = appConfig.chain.prefix
  if (!address || typeof address !== 'string') return false
  const trimmed = address.trim()
  if (!trimmed.startsWith(`${prefix}1`)) return false
  if (trimmed.length < 20 || trimmed.length > 90) return false
  return /^[a-z0-9]+$/.test(trimmed)
}

export async function validateRecipient(address) {
  if (!isAddressFormatValid(address)) {
    return {
      valid: false,
      formatValid: false,
      reason: 'invalid_format',
      message: `Use a valid ${appConfig.chain.prefix}1… address`,
    }
  }

  const res = await fetch(`${API}/send/mlcns/validate/${encodeURIComponent(address.trim())}`)
  const data = await res.json()
  if (!res.ok) {
    return { valid: false, formatValid: true, reason: 'network', message: data.error || 'Validation failed' }
  }
  return {
    valid: Boolean(data.valid),
    formatValid: true,
    exists: data.exists,
    recipientBalance: data.balance,
    message: data.message,
    reason: data.reason,
  }
}

export async function fetchGasBalance(address) {
  const res = await fetch(`${API}/send/gas-balance/${encodeURIComponent(address)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load gas balance')
  return data
}

export async function fetchSendContext(address) {
  const [balance, price, gas] = await Promise.all([
    fetchMlcnsBalance(address),
    fetchMlcnsPrice().catch(() => null),
    fetchGasBalance(address).catch(() => ({ display: 0, sufficient: false })),
  ])
  return { balance, price, gas }
}

export async function simulateTransfer({
  privateKeyHex,
  fromAddress,
  toAddress,
  amountMlcns,
  memo,
}) {
  const amount = Number(amountMlcns)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a valid amount' }
  }

  const [bal, gasBal, feeEst] = await Promise.all([
    fetchMlcnsBalance(fromAddress),
    fetchGasBalance(fromAddress).catch(() => null),
    estimateMlcnsTransfer({
      privateKeyHex,
      fromAddress,
      toAddress: toAddress.trim(),
      amountMlcns: amount,
      memo: memo || '',
    }).catch((e) => ({ error: e.message })),
  ])

  const available = Number(bal.availableDisplay || 0)
  const issues = []

  if (amount > available) {
    issues.push({
      code: 'insufficient_mlcns',
      message: `Need ${amount.toFixed(6)} MLCNS, you have ${available.toFixed(6)}`,
    })
  }

  if (feeEst.error) {
    issues.push({ code: 'fee_estimate', message: `Could not estimate gas: ${feeEst.error}` })
  } else if (gasBal && feeEst.feeDisplay > gasBal.display) {
    issues.push({
      code: 'insufficient_gas',
      message: `Need ~${feeEst.feeDisplay.toFixed(4)} ${feeEst.feeDisplayDenom} for gas, you have ${gasBal.display.toFixed(4)}`,
    })
  }

  return {
    ok: issues.length === 0,
    issues,
    availableMlcns: available,
    feeEstimate: feeEst.error ? null : feeEst,
    gasBalance: gasBal,
  }
}

export function getRecentRecipients() {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRecentRecipient(address, label) {
  if (!isAddressFormatValid(address)) return
  const trimmed = address.trim()
  const list = getRecentRecipients().filter((r) => r.address !== trimmed)
  list.unshift({
    address: trimmed,
    label: label || `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`,
    usedAt: Date.now(),
  })
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
}

/**
 * Link for a new user to create a Mallchain wallet (optionally pre-filled return to send).
 */
export function buildInviteJoinUrl(senderAddress, { amountMlcns } = {}) {
  const params = new URLSearchParams()
  if (senderAddress) params.set('inviteFrom', senderAddress.trim())
  if (amountMlcns && Number(amountMlcns) > 0) {
    params.set('amount', String(amountMlcns))
  }
  params.set('returnTo', 'send')
  const qs = params.toString()
  return `${window.location.origin}/wallet/create${qs ? `?${qs}` : ''}`
}

export function buildInviteReceiveUrl(senderAddress, { amountMlcns } = {}) {
  const params = new URLSearchParams()
  if (amountMlcns && Number(amountMlcns) > 0) {
    params.set('amount', String(amountMlcns))
  }
  if (senderAddress) params.set('inviteFrom', senderAddress.trim())
  const qs = params.toString()
  return `${window.location.origin}/wallet/receive${qs ? `?${qs}` : ''}`
}

export function buildPriceInsight(priceRes) {
  const market = priceRes?.market || {}
  const base = Number(priceRes?.basePriceKes || TOKENS.mallcoin.basePriceKes)
  const mid = Number(market.midPriceKes || market.mid || base)
  const buy = Number(market.buyPriceKes || mid)
  const sell = Number(market.sellPriceKes || mid)
  const momentumPct = base > 0 ? ((mid - base) / base) * 100 : 0
  const spreadPct = mid > 0 ? ((buy - sell) / mid) * 100 : 0

  return {
    basePriceKes: base,
    midPriceKes: mid,
    buyPriceKes: buy,
    sellPriceKes: sell,
    momentumPct,
    spreadPct,
    isLive: !market.fallback,
    momentum: priceRes?.momentum,
  }
}
