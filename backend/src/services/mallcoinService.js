const axios = require('axios');
const { config } = require('../config');
const { createBlockchainBreaker } = require('../utils/circuitBreaker');
const { getCacheService, CacheService } = require('./cacheService');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const MLCNS_DECIMALS = Number(process.env.MLCNS_DECIMALS || 6);
const DEFAULT_PRICE_KES = Number(process.env.MLCNS_BASE_PRICE_KES || 0.6);
const blockchainBreaker = createBlockchainBreaker();

function fromBaseUnits(units) {
  return Number(units || 0) / 10 ** MLCNS_DECIMALS;
}

function toBaseUnits(amount) {
  return Math.floor(Number(amount) * 10 ** MLCNS_DECIMALS);
}

async function getWalletBalance(address) {
  const cache = getCacheService();
  const cacheKey = CacheService.Keys.walletBalance(address);
  
  // Try cache first
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/wallet_balance/${encodeURIComponent(address)}`;
  try {
    const { data } = await blockchainBreaker.execute(async () => {
      return await axios.get(url, { timeout: 8000 });
    });
    const wb = data.wallet_balance || data.walletBalance || {};
    const balance = BigInt(wb.balance || 0);
    const locked = BigInt(wb.locked || 0);
    const available = balance > locked ? balance - locked : 0n;
    const result = {
      address,
      balance: balance.toString(),
      locked: locked.toString(),
      available: available.toString(),
      balanceDisplay: fromBaseUnits(balance),
      availableDisplay: fromBaseUnits(available),
      denom: 'MLCNS',
      exists: true,
    };
    
    // Cache for 30 seconds
    if (cache) {
      await cache.set(cacheKey, result, CacheService.TTL.SHORT);
    }
    
    return result;
  } catch (err) {
    if (err.response?.status === 404) {
      const notFoundResult = {
        address,
        balance: '0',
        locked: '0',
        available: '0',
        balanceDisplay: 0,
        availableDisplay: 0,
        denom: 'MLCNS',
        exists: false,
      };
      // Cache not-found results for shorter time
      if (cache) {
        await cache.set(cacheKey, notFoundResult, CacheService.TTL.SHORT);
      }
      return notFoundResult;
    }
    throw err;
  }
}

async function getMarketPrice() {
  const cache = getCacheService();
  const cacheKey = CacheService.Keys.marketPrice();
  
  // Try cache first
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const { data } = await blockchainBreaker.execute(async () => {
      return await axios.get(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/market/price`, {
        timeout: 8000,
      });
    });
    const mp = data.market_price || data.marketPrice || {};
    const buy = Number(mp.buy_price || 0) / 100;
    const sell = Number(mp.sell_price || 0) / 100;
    const mid = buy && sell ? (buy + sell) / 2 : buy || sell || DEFAULT_PRICE_KES;
    const result = {
      buyPriceKes: buy || DEFAULT_PRICE_KES,
      sellPriceKes: sell || DEFAULT_PRICE_KES,
      midPriceKes: mid,
      engagementScore: data.activity_metrics?.engagement_score,
      priceImpactMultiplier: data.activity_metrics?.price_impact_multiplier,
      raw: mp,
    };
    
    // Cache for 30 seconds
    if (cache) {
      await cache.set(cacheKey, result, CacheService.TTL.SHORT);
    }
    
    return result;
  } catch {
    const fallbackResult = {
      buyPriceKes: DEFAULT_PRICE_KES,
      sellPriceKes: DEFAULT_PRICE_KES,
      midPriceKes: DEFAULT_PRICE_KES,
      fallback: true,
    };
    // Cache fallback for shorter time
    if (cache) {
      await cache.set(cacheKey, fallbackResult, CacheService.TTL.SHORT);
    }
    return fallbackResult;
  }
}

async function getActivityMetrics() {
  const cache = getCacheService();
  const cacheKey = CacheService.Keys.emissionState();
  
  // Try cache first
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const { data } = await blockchainBreaker.execute(async () => {
      return await axios.get(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/emission_state`, {
        timeout: 8000,
      });
    });
    const result = data.emission_state || data.emissionState || null;
    
    // Cache for 1 minute
    if (cache) {
      await cache.set(cacheKey, result, CacheService.TTL.MEDIUM);
    }
    
    return result;
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
