/**
 * AML/sanctions screening provider abstraction.
 *
 * No real sanctions/PEP/watchlist provider is integrated yet — that's a
 * business decision (which vendor: Chainalysis, TRM, ComplyAdvantage, etc.)
 * and requires real API credentials neither of which this codebase can
 * supply on its own. What's built here is the drop-in point: a provider
 * interface, a clearly-labeled mock that preserves today's exact behavior,
 * and an HTTP-based implementation ready to point at a real vendor once
 * AML_PROVIDER_URL + AML_PROVIDER_API_KEY are set.
 *
 * Vendor APIs don't share a request/response shape, so HttpAmlProvider's
 * request body and response mapping are a template — adjust
 * buildRequestBody()/mapResponse() to match whichever vendor is actually
 * chosen. Until then, screen() always returns MockAmlProvider's result.
 */

const axios = require('axios');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * @typedef {Object} AmlCheckResult
 * @property {boolean} sanctions
 * @property {boolean} pep
 * @property {boolean} adverseMedia
 * @property {boolean} watchlist
 * @property {string} provider - 'mock' or the real provider's name
 * @property {unknown} [raw] - Raw provider response, kept for audit trail
 */

class MockAmlProvider {
  // eslint-disable-next-line class-methods-use-this
  async screen(kycData) {
    return {
      sanctions: false, // Would check sanctions lists (OFAC, UN, EU, etc.)
      pep: Boolean(kycData.politicalExposure), // Self-reported, not screened
      adverseMedia: false, // Would check adverse media databases
      watchlist: false, // Would check watchlists
      provider: 'mock',
      raw: null,
    };
  }
}

class HttpAmlProvider {
  constructor({ url, apiKey }) {
    this.url = url;
    this.apiKey = apiKey;
  }

  // Adjust to match the chosen vendor's actual request contract.
  // eslint-disable-next-line class-methods-use-this
  buildRequestBody(kycData) {
    return {
      first_name: kycData.firstName,
      last_name: kycData.lastName,
      date_of_birth: kycData.dateOfBirth,
      nationality: kycData.nationality,
      country: kycData.country,
    };
  }

  // Adjust to match the chosen vendor's actual response contract.
  // eslint-disable-next-line class-methods-use-this
  mapResponse(data) {
    return {
      sanctions: Boolean(data?.sanctions_hit),
      pep: Boolean(data?.pep_hit),
      adverseMedia: Boolean(data?.adverse_media_hit),
      watchlist: Boolean(data?.watchlist_hit),
      provider: 'http',
      raw: data,
    };
  }

  async screen(kycData) {
    const response = await axios.post(this.url, this.buildRequestBody(kycData), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 10000,
    });
    return this.mapResponse(response.data);
  }
}

let cachedProvider = null;

/**
 * Selects the real HTTP provider when AML_PROVIDER_URL + AML_PROVIDER_API_KEY
 * are configured, otherwise the mock. In production, an unconfigured
 * provider is a hard failure at call time (not a silent fallback) — KYC
 * decisions are compliance-critical, so "looks screened but wasn't" must
 * never happen quietly, matching the same fail-fast pattern faucetService.js
 * uses for Redis in production.
 */
function getAmlProvider() {
  if (cachedProvider) return cachedProvider;

  const url = process.env.AML_PROVIDER_URL;
  const apiKey = process.env.AML_PROVIDER_API_KEY;

  if (url && apiKey) {
    cachedProvider = new HttpAmlProvider({ url, apiKey });
  } else if (isProduction) {
    throw new Error(
      'AML_PROVIDER_URL and AML_PROVIDER_API_KEY must be set in production — no AML/sanctions provider is configured.'
    );
  } else {
    cachedProvider = new MockAmlProvider();
  }
  return cachedProvider;
}

/** @returns {Promise<AmlCheckResult>} */
async function screenAml(kycData) {
  const provider = getAmlProvider();
  return provider.screen(kycData);
}

module.exports = { screenAml, getAmlProvider, MockAmlProvider, HttpAmlProvider };
