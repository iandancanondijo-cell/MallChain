import { apiFetch } from '../../lib/api'
import { fetchMlcnsPrice } from '../wallet/mallcoinApi'
import { TOKENS } from '../../config/tokens'
import { kesFromMlcns, mlcnsFromKes } from '../../config/tokens'

export async function fetchBuyPrice() {
  const data = await fetchMlcnsPrice()
  const market = data.market || {}
  const buyPriceKes = Number(market.buyPriceKes || market.midPriceKes || TOKENS.mallcoin.basePriceKes)
  return {
    buyPriceKes,
    midPriceKes: Number(market.midPriceKes || buyPriceKes),
    momentum: data.momentum,
    basePriceKes: Number(data.basePriceKes || TOKENS.mallcoin.basePriceKes),
  }
}

export function mlcnsForKes(kesAmount, buyPriceKes) {
  return mlcnsFromKes(kesAmount, buyPriceKes)
}

export function kesForMlcns(mlcnsAmount, buyPriceKes) {
  return kesFromMlcns(mlcnsAmount, buyPriceKes)
}

export async function reserveBuyQuote({ walletAddress, phone, mlcnsAmount, kesAmount, currency = 'KES' }) {
  return apiFetch('/buy/reserve', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress,
      phone,
      amount: Number(mlcnsAmount),
      fiat: String(kesAmount),
      currency,
    }),
  })
}

export async function initiateBuyMpesa({ quoteId, phone, amountKes, description }) {
  return apiFetch('/buy/mpesa', {
    method: 'POST',
    body: JSON.stringify({
      quoteId,
      phone,
      amount: Number(amountKes),
      description: description || 'Buy MLCNS',
    }),
  })
}

export async function getBuyStatus(paymentId) {
  return apiFetch(`/buy/status/${encodeURIComponent(paymentId)}`)
}

export async function creditBuyPurchase({ quoteId, walletAddress }) {
  return apiFetch('/buy/credit', {
    method: 'POST',
    body: JSON.stringify({ quoteId, walletAddress }),
  })
}

/** Legacy payment API (pending payments collection) */
export async function initiateLegacyMpesa({ phone, amountFiat, amountMallcoin }) {
  return apiFetch('/payment/mpesa/initiate', {
    method: 'POST',
    body: JSON.stringify({
      method: 'mpesa',
      phone,
      amountFiat: Number(amountFiat),
      amountMallcoin: Number(amountMallcoin || amountFiat),
    }),
  })
}

export async function getLegacyPaymentStatus(providerRef) {
  return apiFetch(`/payment/mpesa/status?providerRef=${encodeURIComponent(providerRef)}`)
}
