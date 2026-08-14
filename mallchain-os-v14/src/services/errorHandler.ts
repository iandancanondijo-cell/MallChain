/**
 * Task 6.1: Frontend error handler for network failures
 * 
 * Provides centralized error handling for API network failures with:
 * - User-friendly error messages (not technical details)
 * - Context about what action failed
 * - Error recovery options (retry capability)
 * - Console logging for debugging
 */

import { toast } from '../components/ui';
import type { ApiResult } from './api';
import { authService } from './auth';

/**
 * Error context describing what operation failed
 */
export interface ErrorContext {
  action: string;  // e.g., "loading wallet data", "sending transaction"
  endpoint?: string;  // e.g., "/api/wallet/balances"
  originalError?: Error;  // Original error for logging
}

/**
 * Common network error messages mapped to user-friendly descriptions
 */
const ERROR_MESSAGES: Record<string, string> = {
  'Failed to fetch': 'Unable to connect to server. Please check your connection.',
  'fetch failed': 'Unable to connect to server. Please check your connection.',
  'Network request failed': 'Unable to connect to server. Please check your connection.',
  'timeout': 'Request timed out. Please try again.',
  'CORS error': 'Connection blocked. Please contact support if this persists.',
  'ERR_NETWORK': 'Network error. Please check your connection.',
  'ERR_INVALID_URL': 'Invalid server configuration. Please contact support.',
};

/**
 * Map HTTP error codes to user-friendly messages
 */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check the data and try again.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Server error. Please try again later.',
  502: 'Server temporarily unavailable. Please try again later.',
  503: 'Server is under maintenance. Please try again later.',
  504: 'Server timeout. Please try again later.',
};

/**
 * Handles API errors and displays appropriate user feedback
 * 
 * @param result - The API result object containing error info
 * @param context - Context about what operation failed
 * @param showRetryOption - Whether to show a retry suggestion
 */
export function handleApiError(
  result: Pick<ApiResult, 'ok' | 'error' | 'code'> | ApiResult,
  context: ErrorContext,
  showRetryOption = true
): void {
  if (result.ok) return;

  const { action, endpoint, originalError } = context;

  // Log detailed error for debugging
  console.error(`[API Error] ${action}`, {
    endpoint,
    error: result.error,
    code: result.code,
    originalError,
  });

  // Determine user-friendly message
  let userMessage = getUserFriendlyMessage(result.error, result.code);

  // Add context about what failed
  const contextMsg = action ? ` (${action})` : '';
  const fullMessage = userMessage + contextMsg;

  // Display error toast
  toast(fullMessage, false);

  // Add retry suggestion if appropriate
  if (showRetryOption && isRetryableError(result)) {
    setTimeout(() => {
      toast('💡 Try refreshing the page or checking your connection', false);
    }, 500);
  }
}

/**
 * Handles network errors during API calls
 * 
 * @param error - The error object from fetch or API call
 * @param context - Context about what operation failed
 */
export function handleNetworkError(error: Error | string, context: ErrorContext): void {
  const { action, endpoint, originalError } = context;
  const errorMsg = typeof error === 'string' ? error : error.message;

  // Log error for debugging
  console.error(`[Network Error] ${action}`, {
    endpoint,
    error: errorMsg,
    originalError: originalError || error,
  });

  // Get user-friendly message
  const userMessage = getUserFriendlyMessage(errorMsg);
  const contextMsg = action ? ` (${action})` : '';
  const fullMessage = userMessage + contextMsg;

  // Display error toast
  toast(fullMessage, false);

  // Suggest retry
  setTimeout(() => {
    toast('💡 Try refreshing the page or checking your connection', false);
  }, 500);
}

/**
 * Handles rate limit errors (429) with special message
 * 
 * @param context - Context about what operation failed
 * @param retryAfterSeconds - Seconds to wait before retry (if known)
 */
export function handleRateLimitError(context: ErrorContext, retryAfterSeconds?: number): void {
  const { action } = context;

  console.warn(`[Rate Limited] ${action}`, { retryAfterSeconds });

  const waitMsg = retryAfterSeconds
    ? ` Please wait about ${Math.ceil(retryAfterSeconds / 60)} minute${Math.ceil(retryAfterSeconds / 60) > 1 ? 's' : ''}.`
    : '';

  const userMessage = `Too many requests.${waitMsg}`;
  const contextMsg = action ? ` (${action})` : '';

  toast(userMessage + contextMsg, false);
}

/**
 * Handles 401 unauthorized errors with redirect to login
 * 
 * @param context - Context about what operation failed
 * @param onRedirect - Callback when redirecting to login
 */
export function handle401Error(context: ErrorContext, onRedirect?: () => void): void {
  const { action, endpoint } = context;

  console.warn(`[Unauthorized] ${action}`, { endpoint });

  // Clear the token immediately, synchronously — a 401 means it's already
  // invalid, so any other in-flight/concurrent request must not keep
  // sending it while we wait for the toast to display.
  authService.clearToken();

  toast('Your session has expired. Redirecting to login...', false);

  // Give time for the toast to display, then finish logging out: reset the
  // store (so no stale balances/wallet/etc. linger past the forced logout)
  // and navigate via the app's own hash router rather than a hard page
  // reload. authService.logout() clears the token again — a harmless no-op
  // at this point. `onRedirect` is an optional extra hook for callers that
  // need to react to the logout (e.g. tests).
  setTimeout(() => {
    authService.logout();
    onRedirect?.();
  }, 1000);
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(result: Pick<ApiResult, 'ok' | 'error' | 'code'> | ApiResult): boolean {
  if (result.ok) return false;

  // Network errors are always retryable
  if (!result.code) return true;

  // Specific HTTP error codes that are retryable
  const retryableCodes = [408, 429, 500, 502, 503, 504];
  return retryableCodes.includes(result.code);
}

/**
 * Gets user-friendly error message
 */
function getUserFriendlyMessage(error?: string, code?: number): string {
  // Check HTTP error codes first
  if (code && HTTP_ERROR_MESSAGES[code]) {
    return HTTP_ERROR_MESSAGES[code];
  }

  // Check common network error messages
  if (error) {
    // Exact match
    if (ERROR_MESSAGES[error]) {
      return ERROR_MESSAGES[error];
    }

    // Partial match
    for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
      if (error.toLowerCase().includes(key.toLowerCase())) {
        return msg;
      }
    }

    // Check for specific error patterns
    if (error.includes('CORS') || error.includes('Cross-Origin')) {
      return 'Connection blocked due to security policy. Please contact support.';
    }

    if (error.includes('timeout') || error.includes('Timeout')) {
      return 'Request took too long. Please try again.';
    }

    if (error.includes('abort')) {
      return 'Request was cancelled. Please try again.';
    }
  }

  // Fallback message
  return 'Unable to connect to server. Please check your connection.';
}

/**
 * Creates a retry wrapper for API calls with automatic error handling
 * 
 * @param fn - The async function to call (typically an API call)
 * @param context - Context about the operation
 * @param maxRetries - Maximum number of retries (default: 1)
 * @returns The result or handled error
 */
export async function withErrorHandling<T>(
  fn: () => Promise<ApiResult<T>>,
  context: ErrorContext,
  maxRetries = 1
): Promise<ApiResult<T>> {
  let lastError: ApiResult = { ok: false, error: 'Unknown error' };

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn();

      if (result.ok) {
        return result;
      }

      // Handle specific error types
      if (result.code === 429) {
        handleRateLimitError(context);
        return result;
      }

      if (result.code === 401) {
        handle401Error(context);
        return result;
      }

      lastError = result;

      // Retry if not the last attempt
      if (attempt <= maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      // Show error on final attempt
      handleApiError(result, context);
      return result;
    } catch (error) {
      lastError = { ok: false, error: (error as Error).message };

      if (attempt <= maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      // Show error on final attempt
      handleNetworkError(error as Error, context);
      return lastError as ApiResult<T>;
    }
  }

  return lastError as ApiResult<T>;
}

/**
 * Hook to use error handler with cleanup
 * Returns a callback to show errors that cleans up after display
 */
export function useErrorHandler() {
  return {
    handleApiError,
    handleNetworkError,
    handleRateLimitError,
    handle401Error,
    withErrorHandling,
  };
}
