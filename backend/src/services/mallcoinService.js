const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const MLCNS_DECIMALS = Number(process.env.MLCNS_DECIMALS || 6);
const DEFAULT_PRICE_KES = Number(process.env.MLCNS_BASE_PRICE_KES || 0.6);

function fromBaseUnits(units) {
  return Number(units || 0) / 10 ** MLCNS_DECIMALS;
}

function toBaseUnits(amount) {
  return Math.floor(Number(amount) * 10 ** MLCNS_DECIMALS);
}

async function getWalletBalance(address) {
  const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/wallet_balance/${encodeURIComponent(address)}`;
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const wb = data.wallet_balance || data.walletBalance || {};
    const balance = BigInt(wb.balance || 0);
    const locked = BigInt(wb.locked || 0);
    const available = balance > locked ? balance - locked : 0n;
    return {
      address,
      balance: balance.toString(),
      locked: locked.toString(),
      available: available.toString(),
      balanceDisplay: fromBaseUnits(balance),
      availableDisplay: fromBaseUnits(available),
      denom: 'MLCNS',
      exists: true,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        address,
        balance: '0',
        locked: '0',
        available: '0',
        balanceDisplay: 0,
        availableDisplay: 0,
        denom: 'MLCNS',
        exists: false,
      };
    }
    throw err;
  }
}

async function getMarketPrice() {
  try {
    const { data } = await axios.get(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/market/price`, {
      timeout: 8000,
    });
    const mp = data.market_price || data.marketPrice || {};
    const buy = Number(mp.buy_price || 0) / 100;
    const sell = Number(mp.sell_price || 0) / 100;
    const mid = buy && sell ? (buy + sell) / 2 : buy || sell || DEFAULT_PRICE_KES;
    return {
      buyPriceKes: buy || DEFAULT_PRICE_KES,
      sellPriceKes: sell || DEFAULT_PRICE_KES,
      midPriceKes: mid,
      engagementScore: data.activity_metrics?.engagement_score,
      priceImpactMultiplier: data.activity_metrics?.price_impact_multiplier,
      raw: mp,
    };
  } catch {
    return {
      buyPriceKes: DEFAULT_PRICE_KES,
      sellPriceKes: DEFAULT_PRICE_KES,
      midPriceKes: DEFAULT_PRICE_KES,
      fallback: true,
    };
  }
}

async function getActivityMetrics() {
  try {
    const { data } = await axios.get(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/emission_state`, {
      timeout: 8000,
    });
    return data.emission_state || data.emissionState || null;
  } catch {
    return null;
  }
}

function isValidAddress(address) {
  const prefix = config.chain.prefix;
  return typeof address === 'string' && address.startsWith(prefix) && address.length > prefix.length + 10;
}

module.exports = {
  MLCNS_DECIMALS,
  fromBaseUnits,
  toBaseUnits,
  getWalletBalance,
  getMarketPrice,
  getActivityMetrics,
  isValidAddress,
};
