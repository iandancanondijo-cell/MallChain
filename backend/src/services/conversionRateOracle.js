const { getMarketPrice, getChainParams } = require('./mallcoinService');
const { getCacheService, CacheService } = require('./cacheService');
const logger = require('../utils/logger');

const RATE_SCALE = 1_000_000;

const pointPrice = () =>
  (typeof process.env.MALLPOINT_PRICE_KES !== 'undefined' && !isNaN(Number(process.env.MALLPOINT_PRICE_KES)))
    ? Number(process.env.MALLPOINT_PRICE_KES)
    : 2;

/**
 * Calculates the dynamic MLPTS→MLCNS conversion rate from fiat prices.
 *
 * Formula: proposed_rate = (mlptsPriceKes / mlcnsMidPriceKes) * RATE_SCALE
 *
 * The on-chain keeper applies: mintedMlcns = (pointsAmount * proposed_rate) / RATE_SCALE
 * So if MLPTS=2 KES and MLCNS=0.62 KES, proposed_rate = 3,225,806 and
 * 100 MLPTS → 322.58 MLCNS (both worth ~200 KES).
 *
 * The rate is clamped to the on-chain [min_conversion_rate, max_conversion_rate]
 * bounds so the Msg always passes on-chain validation.
 */
async function getDynamicConversionRate() {
  const cache = getCacheService();
  const cacheKey = 'oracle:conversion_rate';

  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  }

  const mlptsPriceKes = pointPrice();
  const marketPrice = await getMarketPrice();
  const mlcnsMidPriceKes = marketPrice.midPriceKes;

  const chainParams = await getChainParams();
  const minRate = Number(chainParams.min_conversion_rate) || 1_000;
  const maxRate = Number(chainParams.max_conversion_rate) || 100_000_000;

  let proposedRate;
  let clamped = false;

  if (mlcnsMidPriceKes <= 0) {
    logger.warn('conversionRateOracle', 'MLCNS mid price is zero/negative, falling back to midpoint of bounds', {
      mlcnsMidPriceKes,
    });
    proposedRate = Math.round((minRate + maxRate) / 2);
    clamped = true;
  } else {
    const rawRate = Math.round((mlptsPriceKes / mlcnsMidPriceKes) * RATE_SCALE);

    if (rawRate < minRate) {
      proposedRate = minRate;
      clamped = true;
      logger.warn('conversionRateOracle', 'raw rate below min bound — clamped', {
        rawRate, minRate, mlptsPriceKes, mlcnsMidPriceKes,
      });
    } else if (rawRate > maxRate) {
      proposedRate = maxRate;
      clamped = true;
      logger.warn('conversionRateOracle', 'raw rate above max bound — clamped', {
        rawRate, maxRate, mlptsPriceKes, mlcnsMidPriceKes,
      });
    } else {
      proposedRate = rawRate;
    }
  }

  const result = {
    proposedRate,
    minRate,
    maxRate,
    mlptsPriceKes,
    mlcnsMidPriceKes,
    rateScale: RATE_SCALE,
    clamped,
    source: 'fiat-pegged-oracle',
    fetchedAt: Date.now(),
  };

  if (cache) {
    await cache.set(cacheKey, result, CacheService.TTL.SHORT);
  }

  return result;
}

module.exports = { getDynamicConversionRate, RATE_SCALE };
