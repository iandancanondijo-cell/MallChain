/**
 * Request Cache & Debounce Service
 * 
 * Implements intelligent caching with TTL and debouncing to reduce API calls.
 * - Caches responses with configurable TTL (time-to-live)
 * - Debounces rapid requests to the same endpoint
 * - Automatically invalidates stale data
 */

import React from 'react';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // milliseconds
}

interface PendingRequest {
  promise: Promise<any>;
  timeout: NodeJS.Timeout;
}

class RequestCache {
  private cache = new Map<string, CacheEntry>();
  private pendingRequests = new Map<string, PendingRequest>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Get cached data if valid (not expired)
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache with TTL
   */
  set(key: string, data: any, ttlMs: number = 60000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Check if cache is valid (not expired)
   */
  isValid(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Debounced request: if a request is already pending, return the same promise
   * Otherwise, execute the request after debounceMs
   */
  async debouncedRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    debounceMs: number = 300,
    cacheTtlMs: number = 60000
  ): Promise<T> {
    // Return cached data if valid
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Return existing pending request if one is in flight
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!.promise;
    }

    // Clear any existing debounce timer for this key
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }

    // Create a new debounced request
    const promise = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try {
          const data = await requestFn();
          this.set(key, data, cacheTtlMs);
          this.pendingRequests.delete(key);
          this.debounceTimers.delete(key);
          resolve(data);
        } catch (error) {
          this.pendingRequests.delete(key);
          this.debounceTimers.delete(key);
          reject(error);
        }
      }, debounceMs);

      this.debounceTimers.set(key, timeout);
    });

    this.pendingRequests.set(key, { promise, timeout: this.debounceTimers.get(key)! });

    return promise;
  }

  /**
   * Throttled request: reuse cache for a minimum time interval
   * Good for recurring polling
   */
  async throttledRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    minIntervalMs: number = 4000
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const data = await requestFn();
    this.set(key, data, minIntervalMs);
    return data;
  }

  /**
   * Get cache stats (for debugging)
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const requestCache = new RequestCache();

/**
 * Helper: Create a cache key from URL and params
 */
export function createCacheKey(url: string, params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }
  const queryString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('&');
  return `${url}?${queryString}`;
}

/**
 * Hooks for React components
 */
export function useCachedRequest<T>(
  url: string,
  fetchFn: () => Promise<T>,
  options: {
    cacheTtlMs?: number;
    debounceMs?: number;
    pollIntervalMs?: number;
  } = {}
) {
  const {
    cacheTtlMs = 60000,
    debounceMs = 300,
    pollIntervalMs = 0,
  } = options;

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await requestCache.debouncedRequest(
          url,
          fetchFn,
          debounceMs,
          cacheTtlMs
        );
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up polling if needed
    if (pollIntervalMs > 0) {
      const interval = setInterval(fetchData, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [url, cacheTtlMs, debounceMs, pollIntervalMs]);

  return { data, loading, error };
}
