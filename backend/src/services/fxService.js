const axios = require('axios');
const { getCacheService, CacheService } = require('./cacheService');
const { createExternalApiBreaker } = require('../utils/circuitBreaker');

// open.er-api.com — free, no API key required, covers ~166 real-world
// currencies (including KES and most African/Asian/Latin American
// currencies frankfurter.app's ECB-only rate set doesn't have).
const FX_API_URL = process.env.FX_API_URL || 'https://open.er-api.com/v6/latest';
const fxBreaker = createExternalApiBreaker();

/** Fetches (and caches) the full USD-based rate table in one call — cheaper than one request per currency pair, and lets us validate/list every supported code. */
async function getRatesMap(base) {
  const cache = getCacheService();
  const cacheKey = CacheService.Keys.exchangeRate(`${base}_ALL`);

  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  }

  const { data } = await fxBreaker.execute(async () => {
    return await axios.get(`${FX_API_URL}/${base}`, { timeout: 8000 });
  });

  if (data?.result !== 'success' || !data.rates) {
    throw new Error('FX provider returned an unexpected response');
  }

  const result = { base, rates: data.rates, date: data.time_last_update_utc || null, fetchedAt: Date.now() };
  // The provider itself only refreshes ~once/day — an hour-long cache is
  // plenty fresh for display purposes without hammering a free API.
  if (cache) await cache.set(cacheKey, result, CacheService.TTL.LONG);
  return result;
}

async function getFxRate(base, quote) {
  const map = await getRatesMap(base);
  const rate = map.rates[quote];
  if (typeof rate !== 'number') {
    throw new Error(`FX provider does not support currency "${quote}"`);
  }
  return { base, quote, rate, date: map.date, fetchedAt: map.fetchedAt };
}

module.exports = { getFxRate, getRatesMap };
