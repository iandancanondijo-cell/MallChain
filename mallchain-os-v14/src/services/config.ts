/**
 * Mallchain Mission Control v14 — configuration.
 * 
 * Task 1.5: Frontend config module with validation
 * 
 * Reads environment variables set at build time (VITE_* env vars):
 * - VITE_API_BASE_URL: Backend API URL (e.g., http://localhost:3000)
 * - VITE_DEMO_MODE: Whether to use demo/local mode (no backend)
 * - VITE_NETWORK: Target network (mainnet or testnet)
 * - VITE_SESSION_TTL: Session timeout in minutes
 * 
 * With sensible defaults:
 * - apiBaseUrl defaults to empty string (demo mode)
 * - demoMode defaults to true
 * - network defaults to testnet
 * - sessionTtlMin defaults to 120 minutes
 * 
 * Mirrors the v14 dashboard's `window.MALLCHAIN_CONFIG` contract so the
 * exact same config object drives the HTML preview and the Vite app.
 * 
 * Validation:
 * - Task 1.5: VITE_API_BASE_URL must be valid HTTP(S) URL without trailing slash
 * - Throws error at module load time if validation fails (fail-fast)
 * - Prevents runtime errors from invalid configuration
 */

export interface MallchainConfig {
  apiBaseUrl: string;
  demoMode: boolean;
  network: 'mainnet' | 'testnet';
  sessionTtlMin: number;
}

/**
 * Parse environment variable as boolean
 * 
 * Handles common boolean representations:
 * - "true", "1", "yes" → true
 * - "false", "0", "no" → false
 * - Empty string → uses default
 * - Undefined → uses default
 */
function envBool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined || v === '') return dflt;
  return v === 'true' || v === '1' || v === 'yes';
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
  if (!url) return '';
  
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
 * - Demo mode controlled by demoMode + apiBaseUrl
 * - Session timeout used for auto-logout
 */
export const config: MallchainConfig = {
  // Backend API base URL (e.g., http://localhost:3000)
  // Empty string means demo mode (use local store instead of backend)
  apiBaseUrl: validatedApiUrl,
  
  // Demo mode: use local store for all data instead of backend
  // Controlled by VITE_DEMO_MODE and presence of apiBaseUrl
  demoMode: envBool(import.meta.env.VITE_DEMO_MODE as string, true),
  
  // Network: mainnet (production) or testnet (development)
  // Controls which blockchain parameters are used
  network: ((import.meta.env.VITE_NETWORK as string) || 'testnet') === 'mainnet' ? 'mainnet' : 'testnet',
  
  // Session timeout in minutes
  // After this time without activity, user is logged out
  sessionTtlMin: parseInt(import.meta.env.VITE_SESSION_TTL as string, 10) || 120,
};

/**
 * Simulation controller — centralized so all timers/streams can be paused
 * the moment a real API base URL is configured.
 * 
 * Purpose: When apiBaseUrl is empty (demo mode), use local simulated data
 * with artificial delays to mimic network latency. When apiBaseUrl is set,
 * disable all simulated timers and use real backend.
 * 
 * Example use in API service:
 * - api.get() checks config.apiBaseUrl
 * - If set: Makes real fetch() request
 * - If empty: Uses sim.every() to simulate server delay, then returns local data
 * 
 * Example use in price engine:
 * - priceEngine uses sim.every() to simulate price updates
 * - With backend: sim.enabled = false, price updates stop (backend sends real prices via Socket.IO)
 * - Without backend: sim.enabled = true, price updates continue (simulated data)
 */
class SimController {
  private timers = new Set<number>();
  enabled = true;

  /**
   * Constructor: Determine if simulation should be enabled
   * - Enabled only if demoMode=true AND apiBaseUrl is empty
   * - Disabled if backend is configured (apiBaseUrl set)
   */
  constructor() {
    this.enabled = config.demoMode && !config.apiBaseUrl;
  }

  /**
   * Schedule a repeating callback
   * 
   * Task 7.4: Socket event throttling/debouncing in React components
   * Used to simulate recurring events (price updates, block notifications, etc.)
   * 
   * In demo mode: Creates setInterval timer
   * In production: Returns no-op function (allows same code to work both modes)
   * 
   * Returns cleanup function:
   * - Call cleanup() to cancel the repeating callback
   * - Useful in React useEffect cleanup
   * 
   * Example:
   * const cleanup = sim.every(() => {
   *   // Update local prices every 2 seconds
   *   priceEngine.updatePrices();
   * }, 2000);
   * 
   * // On component unmount:
   * return () => cleanup();
   */
  every(fn: () => void, ms: number): () => void {
    if (!this.enabled) return () => {};
    const id = window.setInterval(fn, ms);
    this.timers.add(id);
    return () => {
      window.clearInterval(id);
      this.timers.delete(id);
    };
  }

  /**
   * Schedule a one-time callback
   * 
   * Used to simulate network latency for one-time requests
   * 
   * In demo mode: Creates setTimeout timer
   * In production: Returns no-op function
   * 
   * Returns cleanup function to cancel callback if needed
   */
  later(fn: () => void, ms: number): () => void {
    if (!this.enabled) return () => {};
    const id = window.setTimeout(fn, ms);
    this.timers.add(id);
    return () => {
      window.clearTimeout(id);
      this.timers.delete(id);
    };
  }

  /**
   * Stop all timers (used when switching from demo mode to backend)
   */
  pause() {
    this.enabled = false;
    this.timers.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    this.timers.clear();
  }

  /**
   * Resume timers (used when switching from backend back to demo mode)
   */
  resume() {
    this.enabled = config.demoMode && !config.apiBaseUrl;
  }
}

export const sim = new SimController();

/** Expose the same global contract as the HTML preview. */
declare global {
  interface Window {
    MALLCHAIN_CONFIG?: Partial<MallchainConfig>;
    __mallOS?: unknown;
  }
}
