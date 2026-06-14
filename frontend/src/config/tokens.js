/**
 * Mallchain token definitions — only two utilities: Mallcoins (MLCNS) and Mallpoints.
 */

export const TOKENS = {
  mallcoin: {
    id: 'mlcns',
    symbol: 'MLCNS',
    name: 'Mallcoins',
    decimals: 6,
    /** Base price in KES (1 MLCNS). Chain stores prices scaled ×100. */
    basePriceKes: Number(import.meta.env.VITE_MLCNS_BASE_PRICE_KES || 0.6),
    description:
      'Electronic cash that gains momentum as more people use it daily on the marketplace.',
  },
  mallpoints: {
    id: 'mallpoints',
    symbol: 'Mallpoints',
    name: 'Mallpoints',
    decimals: 6,
    /** Reference value per point in KES (off-chain / conversion math). */
    basePriceKes: Number(import.meta.env.VITE_MALLPOINT_PRICE_KES || 2),
    description:
      'Rewards for marketplace activity; convertible to Mallcoins for purchases where accepted.',
  },
}

/** Local currency display rates vs KES (multiply KES amount). Override via env JSON if needed. */
export const FX_FROM_KES = {
  Kenya: { code: 'KES', symbol: 'KSh', rate: 1, flag: '🇰🇪' },
  Nigeria: { code: 'NGN', symbol: '₦', rate: Number(import.meta.env.VITE_FX_NGN_PER_KES || 0.0065), flag: '🇳🇬' },
  USA: { code: 'USD', symbol: '$', rate: Number(import.meta.env.VITE_FX_USD_PER_KES || 0.0077), flag: '🇺🇸' },
  UK: { code: 'GBP', symbol: '£', rate: Number(import.meta.env.VITE_FX_GBP_PER_KES || 0.0061), flag: '🇬🇧' },
}

export function mlcnsToBaseUnits(amount) {
  return Math.floor(Number(amount) * 10 ** TOKENS.mallcoin.decimals)
}

export function mlcnsFromBaseUnits(units) {
  return Number(units) / 10 ** TOKENS.mallcoin.decimals
}

export function kesFromMlcns(mlcnsAmount, priceKesPerMlcns) {
  return Number(mlcnsAmount) * Number(priceKesPerMlcns || TOKENS.mallcoin.basePriceKes)
}

export function mlcnsFromKes(kesAmount, priceKesPerMlcns) {
  const p = Number(priceKesPerMlcns || TOKENS.mallcoin.basePriceKes)
  return p > 0 ? Number(kesAmount) / p : 0
}
