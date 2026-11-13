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
 * PROVENANCE RULE — the one invariant every provider here must keep:
 * `screened` says whether a sanctions/watchlist list was actually consulted.
 * "No hits" is only a clean result when something ran. The two paths that run
 * nothing (UnscreenedAmlProvider in dev/test, SafeguardAmlProvider in
 * production without a vendor) therefore report `screened:false` with every
 * flag false, and kycController.performAMLCheck treats that exactly like a
 * provider outage: held for manual review at high risk. The safeguard used to
 * fake `sanctions:true` to get the same hold — same outcome for the queue, but
 * it left a fabricated sanctions hit in the compliance audit trail, which is
 * the opposite of what an audit trail is for.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * @typedef {Object} AmlCheckResult
 * @property {boolean} screened - true only when a real vendor list was consulted.
 *   Every path that screens nobody sets this false.
 * @property {boolean} sanctions
 * @property {boolean} pep
 * @property {boolean} adverseMedia
 * @property {boolean} watchlist
 * @property {string} riskLevel - 'low' | 'medium' | 'high' | 'critical' | 'unknown'
 *   ('unknown' whenever screened is false — nothing was measured)
 * @property {string} provider - 'none' | 'safeguard' | 'unavailable' | 'chainalysis' | 'trm' | 'complyadvantage' | 'http'
 * @property {unknown} [raw] - Raw provider response, kept for audit trail
 * @property {string} [warning] - Set when no screening actually ran
 */

/**
 * A vendor answer has to at least be a JSON object. null / a string / an array
 * is a transport or contract problem, not "no matches", and reading it as no
 * matches would record a fabricated clean screening result. Throwing here sends
 * the submission down performAMLCheck's fail-closed path (held at high risk for
 * manual review) instead.
 *
 * A well-formed but empty object is deliberately still accepted: several
 * vendors answer a genuinely clean search with `{}`-style payloads, and this
 * file cannot verify their schema without live credentials. The `raw` payload
 * kept in the KYC record is what a reviewer judges, not the shape guess here.
 */
function assertScreeningPayload(data, providerName) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${providerName} returned no readable screening payload`);
  }
}

/**
 * UnscreenedAmlProvider — dev/test default (and any environment without vendor
 * credentials, apart from production, which uses SafeguardAmlProvider).
 *
 * It consults nothing, and says so: no flags are raised because no list was
 * queried, riskLevel is 'unknown' because nothing was measured, and provider
 * is 'none'. The applicant's politically-exposed answer is preserved as a
 * declaration (it is also a top-level KYC field) rather than promoted into
 * `pep`, which means "a PEP list matched".
 */
class UnscreenedAmlProvider {
  // eslint-disable-next-line class-methods-use-this
  async screen(kycData) {
    const warning = 'No AML screening vendor is configured (AML_PROVIDER_TYPE / AML_PROVIDER_API_KEY) — no sanctions, PEP, adverse-media or watchlist list was consulted';
    return {
      screened: false,
      sanctions: false,
      pep: false,
      adverseMedia: false,
      watchlist: false,
      riskLevel: 'unknown',
      provider: 'none',
      raw: {
        warning,
        declaredPoliticalExposure: Boolean(kycData.politicalExposure),
      },
      warning,
    };
  }
}

/**
 * SafeguardAmlProvider — production with no vendor configured.
 *
 * Nothing is screened, so nothing may be reported as screened: the flags stay
 * false and `screened:false` carries the state. performAMLCheck turns that into
 * high risk + manual review, which is the fail-safe the queue needs without
 * inventing a sanctions hit in the audit trail.
 */
class SafeguardAmlProvider {
  // eslint-disable-next-line class-methods-use-this
  async screen(kycData) {
    const warning = 'AML SAFEGUARD: production has no real AML provider configured, so nothing was screened. Set AML_PROVIDER_TYPE and AML_PROVIDER_API_KEY to enable screening; until then every submission is held for manual review.';
    return {
      screened: false,
      sanctions: false,
      pep: false,
      adverseMedia: false,
      watchlist: false,
      riskLevel: 'unknown',
      provider: 'safeguard',
      raw: {
        warning,
        declaredPoliticalExposure: Boolean(kycData.politicalExposure),
      },
      warning,
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
    assertScreeningPayload(data, 'Chainalysis');
    const riskLevel = this.calculateRiskLevel(data);
    return {
      screened: true,
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
    assertScreeningPayload(data, 'TRM Labs');
    const riskLevel = this.calculateRiskLevel(data);
    return {
      screened: true,
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
    assertScreeningPayload(data, 'ComplyAdvantage');
    const riskLevel = this.calculateRiskLevel(data);
    return {
      screened: true,
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
    assertScreeningPayload(data, 'HTTP AML provider');
    const riskLevel = this.calculateRiskLevel(data);
    return {
      screened: true,
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
 * Is this environment value a credential, or sample-env boilerplate that was
 * never replaced?
 *
 * `AML_PROVIDER_API_KEY=YOUR_CHAINALYSIS_API_KEY` is present in this repo's
 * own .env today. Treating it as a configured vendor meant every KYC
 * submission spent the full axios timeout dialling api.chainalysis.com, failed
 * on DNS, and was recorded as `provider:'unavailable'` — which tells whoever
 * reads the audit trail "the screening service had an outage" when the truth is
 * "we have no credentials". Both hold the submission for manual review; only
 * one of them is a fact.
 *
 * Only unmistakable placeholder shapes are rejected, so a real key that happens
 * to contain one of these words is never silently downgraded.
 */
const PLACEHOLDER_CREDENTIAL_RE = /^(your[_-]|changeme|replace[_-]|placeholder|xxxx)/i;

function usableCredential(value, label) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (PLACEHOLDER_CREDENTIAL_RE.test(trimmed)) {
    logger.error('aml', `${label} is a documentation placeholder rather than a configured value — AML screening cannot run. Set it to the credential or endpoint the vendor issued.`);
    return null;
  }
  return trimmed;
}

/**
 * Selects AML provider based on configuration:
 * 1. If AML_PROVIDER_TYPE is set, uses vendor-specific provider
 * 2. Else if AML_PROVIDER_URL + AML_PROVIDER_API_KEY set, uses HTTP provider
 * 3. Else if production, uses SafeguardAmlProvider (fail-safe)
 * 4. Else uses UnscreenedAmlProvider (dev/test)
 *
 * Paths 3 and 4 screen nobody; both report `screened:false` so the caller
 * treats the submission as unvetted rather than clean.
 */
function getAmlProvider() {
  if (cachedProvider) return cachedProvider;

  const providerType = process.env.AML_PROVIDER_TYPE?.toLowerCase();
  const apiKey = usableCredential(process.env.AML_PROVIDER_API_KEY, 'AML_PROVIDER_API_KEY');
  const url = usableCredential(process.env.AML_PROVIDER_URL, 'AML_PROVIDER_URL');

  // A vendor named without a usable key would otherwise fall silently through
  // to a provider that screens nobody — an operator who believes screening is
  // on must not find out from a KYC audit. The choice below is unchanged
  // (still fail-closed), the difference is that it is now announced.
  if (providerType && !apiKey) {
    logger.error('aml', `AML_PROVIDER_TYPE="${providerType}" is set but AML_PROVIDER_API_KEY is missing or a placeholder — no vendor screening can run, submissions will be held for manual review`);
  }

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
    // 4. Dev/test: nothing is screened, and the record says so
    cachedProvider = new UnscreenedAmlProvider();
    logger.warn('aml', 'No AML provider configured (dev/test): AML screening does not run, submissions are held for manual review');
  }

  return cachedProvider;
}

/**
 * Drop the memoised provider so the next call re-reads the environment.
 * Exists for tests (and for any future hot-reload of AML_* config); the
 * process-wide cache is otherwise only correct for a boot-time environment.
 */
function resetAmlProvider() {
  cachedProvider = null;
}

async function screenAml(kycData) {
  const provider = getAmlProvider();
  return provider.screen(kycData);
}

module.exports = {
  screenAml,
  getAmlProvider,
  resetAmlProvider,
  UnscreenedAmlProvider,
  SafeguardAmlProvider,
  HttpAmlProvider,
  ChainalysisProvider,
  TrmLabsProvider,
  ComplyAdvantageProvider,
};
