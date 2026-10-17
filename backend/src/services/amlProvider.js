/**
 * AML/sanctions screening provider abstraction with vendor-specific integrations.
 *
 * Supports multiple real providers:
 * - Chainalysis (https://docs.chainalysis.com/kyc-aml)
 * - TRM Labs (https://docs.trmlabs.com/screening)
 * - ComplyAdvantage (https://docs.complyadvantage.com/)
 *
 * Vendor selection via AML_PROVIDER_TYPE environment variable.
 * Credentials: AML_PROVIDER_API_KEY (required for each vendor)
 * 
 * P0 WORKAROUND: SafeguardAmlProvider returns high-risk flags to block
 * KYC approvals until real provider is configured (production fail-safe).
 */

const axios = require('axios');
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * @typedef {Object} AmlCheckResult
 * @property {boolean} sanctions
 * @property {boolean} pep
 * @property {boolean} adverseMedia
 * @property {boolean} watchlist
 * @property {string} riskLevel - 'low' | 'medium' | 'high' | 'critical'
 * @property {string} provider - 'mock', 'safeguard', 'chainalysis', 'trm', 'complyadvantage'
 * @property {unknown} [raw] - Raw provider response, kept for audit trail
 * @property {string} [warning] - Safeguard warning (if using SafeguardAmlProvider)
 */

class MockAmlProvider {
  // eslint-disable-next-line class-methods-use-this
  async screen(kycData) {
    return {
      sanctions: false,
      pep: Boolean(kycData.politicalExposure),
      adverseMedia: false,
      watchlist: false,
      riskLevel: 'low',
      provider: 'mock',
      raw: null,
    };
  }
}

/**
 * P0 WORKAROUND: SafeguardAmlProvider
 * Production mode: flags all submissions as high-risk until real provider configured
 * This blocks KYC approval via UI logic that checks for high risk, forcing manual review
 */
class SafeguardAmlProvider {
  async screen(kycData) {
    return {
      sanctions: true,
      pep: true,
      adverseMedia: true,
      watchlist: true,
      riskLevel: 'critical',
      provider: 'safeguard',
      raw: { warning: 'AML provider not configured; all submissions held for manual review' },
      warning: 'AML SAFEGUARD: Real AML provider not configured. Set AML_PROVIDER_TYPE and AML_PROVIDER_API_KEY in production.'
    };
  }
}

/**
 * Chainalysis KYC/AML Screening Provider
 * Docs: https://docs.chainalysis.com/kyc-aml
 * 
 * Requires: AML_PROVIDER_API_KEY (Chainalysis API key)
 * Optional: AML_CHAINALYSIS_ENDPOINT (defaults to production)
 */
class ChainalysisProvider {
  constructor({ apiKey, endpoint = 'https://api.chainalysis.com' }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  buildRequestBody(kycData) {
    return {
      givenName: kycData.firstName,
      familyName: kycData.lastName,
      dateOfBirth: kycData.dateOfBirth, // YYYY-MM-DD
      nationality: kycData.nationality, // ISO 3166-1 alpha-2
      location: {
        country: kycData.country,
        state: kycData.state,
        city: kycData.city,
        postalCode: kycData.postalCode,
      },
      // PEP (Politically Exposed Person) declaration
      politicalExposure: kycData.politicalExposure || false,
    };
  }

  mapResponse(data) {
    // Chainalysis response structure
    const riskLevel = this.calculateRiskLevel(data);
    return {
      sanctions: Boolean(data?.sanctions?.hit),
      pep: Boolean(data?.pep?.hit),
      adverseMedia: Boolean(data?.adverseMedia?.hit),
      watchlist: Boolean(data?.watchlist?.hit),
      riskLevel,
      provider: 'chainalysis',
      raw: data,
    };
  }

  calculateRiskLevel(data) {
    if (data?.sanctions?.hit) return 'critical';
    if (data?.pep?.hit || data?.adverseMedia?.hit) return 'high';
    if (data?.watchlist?.hit) return 'medium';
    return 'low';
  }

  async screen(kycData) {
    try {
      const response = await axios.post(`${this.endpoint}/v1/screening/aml`, this.buildRequestBody(kycData), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
      return this.mapResponse(response.data);
    } catch (err) {
      logger.error('aml', 'Chainalysis screening failed', err);
      throw new Error(`Chainalysis AML screening failed: ${err.message}`);
    }
  }
}

/**
 * TRM Labs AML Screening Provider
 * Docs: https://docs.trmlabs.com/screening
 * 
 * Requires: AML_PROVIDER_API_KEY (TRM Labs API key)
 * Optional: AML_TRM_ENDPOINT (defaults to production)
 */
class TrmLabsProvider {
  constructor({ apiKey, endpoint = 'https://api.trmlabs.com' }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  buildRequestBody(kycData) {
    return {
      firstName: kycData.firstName,
      lastName: kycData.lastName,
      dateOfBirth: kycData.dateOfBirth,
      nationality: kycData.nationality,
      address: {
        country: kycData.country,
        state: kycData.state,
        city: kycData.city,
        postalCode: kycData.postalCode,
      },
      isPEP: kycData.politicalExposure || false,
    };
  }

  mapResponse(data) {
    // TRM Labs response structure
    const riskLevel = this.calculateRiskLevel(data);
    return {
      sanctions: data?.entity?.sanctions?.isHit || false,
      pep: data?.entity?.pep?.isHit || false,
      adverseMedia: data?.entity?.adverseMedia?.isHit || false,
      watchlist: data?.entity?.watchlist?.isHit || false,
      riskLevel,
      provider: 'trm',
      raw: data,
    };
  }

  calculateRiskLevel(data) {
    if (data?.entity?.sanctions?.isHit) return 'critical';
    if (data?.entity?.pep?.isHit || data?.entity?.adverseMedia?.isHit) return 'high';
    if (data?.entity?.watchlist?.isHit) return 'medium';
    return 'low';
  }

  async screen(kycData) {
    try {
      const response = await axios.post(`${this.endpoint}/public/screening/aml/entity`, this.buildRequestBody(kycData), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
      return this.mapResponse(response.data);
    } catch (err) {
      logger.error('aml', 'TRM Labs screening failed', err);
      throw new Error(`TRM Labs AML screening failed: ${err.message}`);
    }
  }
}

/**
 * ComplyAdvantage AML Screening Provider
 * Docs: https://docs.complyadvantage.com/
 * 
 * Requires: AML_PROVIDER_API_KEY (ComplyAdvantage API key)
 * Optional: AML_COMPLYADVANTAGE_ENDPOINT (defaults to production)
 */
class ComplyAdvantageProvider {
  constructor({ apiKey, endpoint = 'https://api.complyadvantage.com' }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  buildRequestBody(kycData) {
    return {
      first_name: kycData.firstName,
      last_name: kycData.lastName,
      date_of_birth: kycData.dateOfBirth,
      nationality: kycData.nationality,
      country: kycData.country,
      state: kycData.state,
      city: kycData.city,
      postal_code: kycData.postalCode,
      politically_exposed_person: kycData.politicalExposure || false,
    };
  }

  mapResponse(data) {
    // ComplyAdvantage response structure
    const riskLevel = this.calculateRiskLevel(data);
    return {
      sanctions: data?.sanctions || false,
      pep: data?.pep || false,
      adverseMedia: data?.adverse_media || false,
      watchlist: data?.watchlist_hit || false,
      riskLevel,
      provider: 'complyadvantage',
      raw: data,
    };
  }

  calculateRiskLevel(data) {
    if (data?.sanctions) return 'critical';
    if (data?.pep || data?.adverse_media) return 'high';
    if (data?.watchlist_hit) return 'medium';
    return 'low';
  }

  async screen(kycData) {
    try {
      const response = await axios.post(`${this.endpoint}/v1/searches`, this.buildRequestBody(kycData), {
        headers: {
          Authorization: `Token token="${this.apiKey}"`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
      return this.mapResponse(response.data);
    } catch (err) {
      logger.error('aml', 'ComplyAdvantage screening failed', err);
      throw new Error(`ComplyAdvantage AML screening failed: ${err.message}`);
    }
  }
}

/**
 * Generic HTTP AML Provider - fallback for custom vendors
 */
class HttpAmlProvider {
  constructor({ url, apiKey }) {
    this.url = url;
    this.apiKey = apiKey;
  }

  buildRequestBody(kycData) {
    return {
      first_name: kycData.firstName,
      last_name: kycData.lastName,
      date_of_birth: kycData.dateOfBirth,
      nationality: kycData.nationality,
      country: kycData.country,
    };
  }

  mapResponse(data) {
    const riskLevel = this.calculateRiskLevel(data);
    return {
      sanctions: Boolean(data?.sanctions_hit),
      pep: Boolean(data?.pep_hit),
      adverseMedia: Boolean(data?.adverse_media_hit),
      watchlist: Boolean(data?.watchlist_hit),
      riskLevel,
      provider: 'http',
      raw: data,
    };
  }

  calculateRiskLevel(data) {
    if (data?.sanctions_hit) return 'critical';
    if (data?.pep_hit || data?.adverse_media_hit) return 'high';
    if (data?.watchlist_hit) return 'medium';
    return 'low';
  }

  async screen(kycData) {
    try {
      const response = await axios.post(this.url, this.buildRequestBody(kycData), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 10000,
      });
      return this.mapResponse(response.data);
    } catch (err) {
      logger.error('aml', 'HTTP AML provider failed', err);
      throw new Error(`HTTP AML screening failed: ${err.message}`);
    }
  }
}

let cachedProvider = null;

/**
 * Selects AML provider based on configuration:
 * 1. If AML_PROVIDER_TYPE is set, uses vendor-specific provider
 * 2. Else if AML_PROVIDER_URL + AML_PROVIDER_API_KEY set, uses HTTP provider
 * 3. Else if production, uses SafeguardAmlProvider (fail-safe)
 * 4. Else uses MockAmlProvider (dev/test)
 */
function getAmlProvider() {
  if (cachedProvider) return cachedProvider;

  const providerType = process.env.AML_PROVIDER_TYPE?.toLowerCase();
  const apiKey = process.env.AML_PROVIDER_API_KEY;
  const url = process.env.AML_PROVIDER_URL;

  // 1. Check for vendor-specific providers
  if (providerType === 'chainalysis' && apiKey) {
    const endpoint = process.env.AML_CHAINALYSIS_ENDPOINT;
    cachedProvider = new ChainalysisProvider({ apiKey, endpoint });
    logger.info('aml', `Initialized Chainalysis AML provider`);
  } else if (providerType === 'trm' && apiKey) {
    const endpoint = process.env.AML_TRM_ENDPOINT;
    cachedProvider = new TrmLabsProvider({ apiKey, endpoint });
    logger.info('aml', `Initialized TRM Labs AML provider`);
  } else if (providerType === 'complyadvantage' && apiKey) {
    const endpoint = process.env.AML_COMPLYADVANTAGE_ENDPOINT;
    cachedProvider = new ComplyAdvantageProvider({ apiKey, endpoint });
    logger.info('aml', `Initialized ComplyAdvantage AML provider`);
  } else if (url && apiKey) {
    // 2. Fall back to generic HTTP provider
    cachedProvider = new HttpAmlProvider({ url, apiKey });
    logger.info('aml', `Initialized HTTP AML provider: ${url}`);
  } else if (isProduction) {
    // 3. Production without real provider: use SafeguardAmlProvider
    cachedProvider = new SafeguardAmlProvider();
    logger.warn('aml', 'Production mode: AML provider not configured. SafeguardAmlProvider active. Set AML_PROVIDER_TYPE and AML_PROVIDER_API_KEY to use real screening.');
  } else {
    // 4. Dev/test: use mock provider
    cachedProvider = new MockAmlProvider();
    logger.info('aml', `Initialized mock AML provider (dev mode)`);
  }

  return cachedProvider;
}

async function screenAml(kycData) {
  const provider = getAmlProvider();
  return provider.screen(kycData);
}

module.exports = {
  screenAml,
  getAmlProvider,
  MockAmlProvider,
  SafeguardAmlProvider,
  HttpAmlProvider,
  ChainalysisProvider,
  TrmLabsProvider,
  ComplyAdvantageProvider,
};
