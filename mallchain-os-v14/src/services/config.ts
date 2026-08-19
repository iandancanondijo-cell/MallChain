/**
 * Mallchain Mission Control v14 — configuration.
 *
 * Task 1.5: Frontend config module with validation
 *
 * Reads environment variables set at build time (VITE_* env vars):
 * - VITE_API_BASE_URL: Backend API URL (e.g., http://localhost:3000) — required
 * - VITE_NETWORK: Target network (mainnet or testnet)
 * - VITE_SESSION_TTL: Session timeout in minutes
 *
 * Mirrors the v14 dashboard's `window.MALLCHAIN_CONFIG` contract so the
 * exact same config object drives the HTML preview and the Vite app.
 *
 * Validation:
 * - Task 1.5: VITE_API_BASE_URL must be valid HTTP(S) URL without trailing slash
 * - Throws error at module load time if validation fails or missing (fail-fast) —
 *   this app always talks to a real backend; there is no local-simulation mode.
 */

export interface MallchainConfig {
  apiBaseUrl: string;
  network: 'mainnet' | 'testnet';
  sessionTtlMin: number;
}

/**
 * Task 1.5: Validates VITE_API_BASE_URL if set.
 * 
 * Requirements:
 * - Must be a valid HTTP(S) URL (ensures secure connections)
 * - Must not have a trailing slash (prevents URL construction errors)
 * 
 * Examples:
 * ✓ http://localhost:3000
 * ✓ https://api.example.com
 * ✓ https://api.example.com:8080
 * ✗ http://localhost:3000/ (trailing slash)
 * ✗ localhost:3000 (missing http://)
 * ✗ ftp://example.com (invalid protocol)
 * 
 * Throws error immediately if invalid (fail-fast principle)
 * Errors caught at module load time, not runtime
 */
function validateApiUrl(url: string): string {
  if (!url) {
    // Only enforced for production builds: dev/test runs (no VITE_API_BASE_URL
    // set) still need to load without a backend configured. A production
    // build silently falling back to relative fetches against the app's own
    // static-hosting origin is a misconfiguration that should fail loudly
    // instead of shipping a broken build.
    if (import.meta.env.PROD) {
      throw new Error(
        'VITE_API_BASE_URL is required for production builds — set it before running `npm run build` (see .env.example).'
      );
    }
    return '';
  }

  // Must be HTTP or HTTPS (not FTP, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`VITE_API_BASE_URL must start with http:// or https://, got: ${url}`);
  }
  
  // Must not have trailing slash (would cause issues when constructing URLs)
  // Example: base + /path → "http://example.com/" + "/path" = "http://example.com//path"
  if (url.endsWith('/')) {
    throw new Error(`VITE_API_BASE_URL must not have a trailing slash, got: ${url}`);
  }
  
  // Basic URL validation: try to parse as URL object
  // Catches invalid URLs like "http://invalid..url" (double dots)
  try {
    const urlObj = new URL(url);
    // Valid URL
    return url;
  } catch (err) {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: ${url}`);
  }
}

// Read and validate API base URL from environment
// Throws at module load if VITE_API_BASE_URL is present but invalid
const rawApiUrl = (import.meta.env.VITE_API_BASE_URL as string) || '';
const validatedApiUrl = validateApiUrl(rawApiUrl);

/**
 * Global configuration object
 *
 * Used throughout frontend:
 * - API service uses apiBaseUrl to make requests
 * - Socket manager uses apiBaseUrl to connect
 * - Session timeout used for auto-logout
 */
export const config: MallchainConfig = {
  // Backend API base URL (e.g., http://localhost:3000)
  apiBaseUrl: validatedApiUrl,

  // Network: mainnet (production) or testnet (development)
  // Controls which blockchain parameters are used
  network: ((import.meta.env.VITE_NETWORK as string) || 'testnet') === 'mainnet' ? 'mainnet' : 'testnet',

  // Session timeout in minutes
  // After this time without activity, user is logged out
  sessionTtlMin: parseInt(import.meta.env.VITE_SESSION_TTL as string, 10) || 120,
};

/**
 * Chain parameters needed for client-side transaction signing (mallcoinTx.ts).
 * Defaults mirror the backend's (backend/src/config/index.js) so a real wallet
 * signs transactions the chain will actually accept.
 */
export const chain = {
  chainId: (import.meta.env.VITE_CHAIN_ID as string) || 'mallchain-1',
  addressPrefix: (import.meta.env.VITE_CHAIN_PREFIX as string) || 'mall',
  gasPrice: (import.meta.env.VITE_GAS_PRICE as string) || '0.01stake',
};

/** Expose the same global contract as the HTML preview. */
declare global {
  interface Window {
    MALLCHAIN_CONFIG?: Partial<MallchainConfig>;
    __mallOS?: unknown;
  }
}
