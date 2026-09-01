const axios = require('axios');
const bech32 = require('bech32');
const { config } = require('../config');
const { createBlockchainBreaker } = require('../utils/circuitBreaker');
const { getCacheService, CacheService } = require('./cacheService');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const MLCNS_DECIMALS = Number(process.env.MLCNS_DECIMALS || 6);
// Matches the on-chain MarketPrice default (x/mlcoin/keeper/end_blocker.go:
// BuyPrice: 62, SellPrice: 58, i.e. cents of KES) — used only when the chain
// is unreachable, so the fallback should reflect the same buy/sell spread
// rather than quoting one flat rate for both sides.
const DEFAULT_BUY_PRICE_KES = Number(process.env.MLCNS_BUY_PRICE_KES || 0.62);
const DEFAULT_SELL_PRICE_KES = Number(process.env.MLCNS_SELL_PRICE_KES || 0.58);
// Single source of truth for the Mallpoints -> Mallcoin conversion ratio.
// Mirrors x/mlcoin/types/params.go DefaultMlptsPerMlcns (3_200_000 = 3.2
// fixed-point with 6 decimals). Used only as a safe fallback when the live
// on-chain governance param can't be fetched via REST.
const DEFAULT_MLPTS_PER_MLCNS_FIXED = 3_200_000;
const MLPTS_PER_MLCNS_SCALE = 1_000_000;
// Matches x/mlcoin/types DefaultMinStakeAmount (18250 = equal to default
// RewardDivisor so the smallest accepted stake always earns >= 1 unit of
// block reward per block). Used as the fallback when chain params are down.
const DEFAULT_MIN_STAKE_AMOUNT = 18_250;
const blockchainBreaker = createBlockchainBreaker();

function fromBaseUnits(units) {
  return Number(units || 0) / 10 ** MLCNS_DECIMALS;
}

function toBaseUnits(amount) {
  return Math.floor(Number(amount) * 10 ** MLCNS_DECIMALS);
}

// mlptsPerMlcnsToNumber converts the on-chain 6-decimal fixed-point
// `mlpts_per_mlcns` governance param into a floating-point ratio suitable
// for preview math in the frontend and backend /convert settle.
// Example: 3_200_000 (fixed) -> 3.2 (float)
function mlptsPerMlcnsToNumber(fixed) {
  const f = Number(fixed || 0);
  if (!Number.isFinite(f) || f <= 0) {
    return DEFAULT_MLPTS_PER_MLCNS_FIXED / MLPTS_PER_MLCNS_SCALE;
  }
  return f / MLPTS_PER_MLCNS_SCALE;
}

function getMlptsPerMlcnsScale() {
  return MLPTS_PER_MLCNS_SCALE;
}

// getChainParams returns the current on-chain x/mlcoin governance params.
// Source of truth for: MinStakeAmount, MlptsPerMlcns, BurnWallet.
// Falls back to safe compiled defaults if REST is unreachable, callers
// can detect the fallback via result.source === 'fallback'.
async function getChainParams() {
  const cache = getCacheService();
  const cacheKey = CacheService.Keys.mlcoinParams();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  }

  const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/params`;
  try {
    const { data } = await blockchainBreaker.execute(async () => {
      return await axios.get(url, { timeout: 8000 });
    });
    const p = data.params || data.Params || {};
    const minStake = Number(p.min_stake_amount ?? p.minStakeAmount ?? 0);
    const mlptsFixed = Number(p.mlpts_per_mlcns ?? p.mlptsPerMlcns ?? 0);
    const result = {
      source: 'chain',
      burn_wallet: p.burn_wallet || p.burnWallet || '',
      min_stake_amount: minStake > 0 ? minStake : DEFAULT_MIN_STAKE_AMOUNT,
      mlpts_per_mlcns: mlptsFixed > 0 ? mlptsFixed : DEFAULT_MLPTS_PER_MLCNS_FIXED,
    };
    if (cache) {
      await cache.set(cacheKey, result, CacheService.TTL.MEDIUM);
    }
    return result;
  } catch {
    const fallback = {
      source: 'fallback',
      burn_wallet: '',
      min_stake_amount: DEFAULT_MIN_STAKE_AMOUNT,
      mlpts_per_mlcns: DEFAULT_MLPTS_PER_MLCNS_FIXED,
    };
    if (cache) {
      await cache.set(cacheKey, fallback, CacheService.TTL.SHORT);
    }
    return fallback;
  }
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
    const mid = buy && sell ? (buy + sell) / 2 : buy || sell || DEFAULT_BUY_PRICE_KES;
    const result = {
      buyPriceKes: buy || DEFAULT_BUY_PRICE_KES,
      sellPriceKes: sell || DEFAULT_SELL_PRICE_KES,
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
      buyPriceKes: DEFAULT_BUY_PRICE_KES,
      sellPriceKes: DEFAULT_SELL_PRICE_KES,
      midPriceKes: (DEFAULT_BUY_PRICE_KES + DEFAULT_SELL_PRICE_KES) / 2,
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

// Real bech32 decode + checksum validation — not just a prefix/length check.
// A prefix/length heuristic accepts typo'd addresses (e.g. one flipped
// character) as "valid", since bech32's whole purpose is a checksum that
// catches exactly that class of error. This gates real fund-moving paths
// (sendController.js send/broadcast, faucetService.js minting), so letting
// a mistyped address through here means the failure only surfaces after
// broadcast (or, worse, some other consequence) instead of a clear
// client-visible rejection up front.
function isValidAddress(address) {
  if (typeof address !== 'string' || !address) return false;
  let decoded;
  try {
    decoded = bech32.decode(address);
  } catch {
    return false;
  }
  if (decoded.prefix !== config.chain.prefix) return false;
  // Standard Cosmos SDK addresses are 20 bytes (RIPEMD-160 of the pubkey).
  return bech32.fromWords(decoded.words).length === 20;
}

module.exports = {
  MLCNS_DECIMALS,
  DEFAULT_MLPTS_PER_MLCNS_FIXED,
  MLPTS_PER_MLCNS_SCALE,
  DEFAULT_MIN_STAKE_AMOUNT,
  fromBaseUnits,
  toBaseUnits,
  mlptsPerMlcnsToNumber,
  getMlptsPerMlcnsScale,
  getChainParams,
  getWalletBalance,
  getMarketPrice,
  getActivityMetrics,
  isValidAddress,
};
