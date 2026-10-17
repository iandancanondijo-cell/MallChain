/**
 * Client-side Rate Limiting Service
 * Provides simple rate limiting for frontend operations to prevent brute force attacks
 * (e.g., login attempts, PIN submissions, API calls)
 *
 * IMPORTANT: This is a UI-level control, not a security boundary. The backend
 * must enforce its own stricter rate limiting. This is only to provide good UX
 * and reduce unnecessary server load.
 */

interface RateLimitBucket {
  attempts: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

/**
 * Check if an operation is rate limited
 * @param key Unique identifier (e.g., 'login_user@example.com', 'pin_submit_3')
 * @param maxAttempts Max attempts allowed in the window
 * @param windowMs Time window in milliseconds
 * @returns true if rate limited (block the operation), false if OK to proceed
 */
export function isRateLimited(
  key: string,
  maxAttempts: number = 3,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  // Create new bucket if doesn't exist or window expired
  if (!bucket || now >= bucket.resetAt) {
    bucket = { attempts: 0, resetAt: now + windowMs };
  }

  // Increment attempt counter
  bucket.attempts++;
  buckets.set(key, bucket);

  // Return true if exceeds max attempts (operation should be blocked)
  return bucket.attempts > maxAttempts;
}

/**
 * Get remaining time (in ms) until the rate limit window resets for this key
 * @param key The rate limit key
 * @returns Milliseconds until reset, or 0 if not rate limited
 */
export function getRateLimitResetIn(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;

  const remaining = bucket.resetAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Get the number of attempts remaining before rate limit is hit
 * @param key The rate limit key
 * @param maxAttempts Max attempts allowed
 * @returns Number of attempts left (can be negative if already limited)
 */
export function getRateLimitRemaining(key: string, maxAttempts: number = 3): number {
  const bucket = buckets.get(key);
  if (!bucket) return maxAttempts;

  return Math.max(0, maxAttempts - bucket.attempts);
}

/**
 * Reset rate limit for a specific key (e.g., on successful operation)
 * @param key The rate limit key to reset
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Clear all rate limits (use sparingly, e.g., on logout)
 */
export function clearAllRateLimits(): void {
  buckets.clear();
}

/**
 * Get human-readable error message for rate limiting
 * @param key The rate limit key
 * @returns Error message to display to user
 */
export function getRateLimitErrorMessage(key: string): string {
  const resetIn = getRateLimitResetIn(key);
  const seconds = Math.ceil(resetIn / 1000);

  if (seconds > 60) {
    const minutes = Math.ceil(seconds / 60);
    return `Too many attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
  } else if (seconds > 0) {
    return `Too many attempts. Please try again in ${seconds} second${seconds > 1 ? 's' : ''}.`;
  }

  return 'Too many attempts. Please try again later.';
}
