/**
 * Unit tests for errorHandler utility
 * Task 6.1: Test network error handling and user-friendly messages
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleApiError,
  handleNetworkError,
  handleRateLimitError,
  handle401Error,
  withErrorHandling,
} from './errorHandler';
import { toast } from '../components/ui';

// Mock the toast function
vi.mock('../components/ui', () => ({
  toast: vi.fn(),
}));

// Mock console methods
const consoleSpy = {
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
};

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleApiError', () => {
    it('should display user-friendly message for network errors', () => {
      handleApiError(
        { ok: false, error: 'Failed to fetch' },
        { action: 'loading wallet data' },
        false
      );

      expect(toast).toHaveBeenCalledWith(
        'Unable to connect to server. Please check your connection. (loading wallet data)',
        false
      );
    });

    it('should display HTTP error message with context', () => {
      handleApiError(
        { ok: false, code: 429, error: 'Too many requests' },
        { action: 'submitting form', endpoint: '/api/submit' },
        false
      );

      expect(toast).toHaveBeenCalledWith(
        'Too many requests. Please wait a moment and try again. (submitting form)',
        false
      );
    });

    it('should log error details to console', () => {
      const error = new Error('Network failed');
      handleApiError(
        { ok: false, error: 'Connection refused' },
        { action: 'fetching data', endpoint: '/api/data', originalError: error },
        false
      );

      expect(consoleSpy.error).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[API Error] fetching data',
        expect.objectContaining({
          error: 'Connection refused',
          endpoint: '/api/data',
        })
      );
    });

    it('should suggest retry for retryable errors', () => {
      vi.useFakeTimers();

      handleApiError(
        { ok: false, code: 503, error: 'Service Unavailable' },
        { action: 'loading page' },
        true
      );

      expect(toast).toHaveBeenCalledWith(
        'Server is under maintenance. Please try again later. (loading page)',
        false
      );

      vi.advanceTimersByTime(500);

      expect(toast).toHaveBeenCalledWith(
        '💡 Try refreshing the page or checking your connection',
        false
      );

      vi.useRealTimers();
    });

    it('should not show retry suggestion when showRetryOption is false', () => {
      vi.useFakeTimers();

      handleApiError(
        { ok: false, code: 500, error: 'Internal Server Error' },
        { action: 'submitting auth' },
        false
      );

      expect(toast).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('handleNetworkError', () => {
    it('should handle error objects', () => {
      const error = new Error('Network timeout');
      handleNetworkError(error, { action: 'connecting to server' });

      expect(toast).toHaveBeenCalledWith(
        'Request timed out. Please try again. (connecting to server)',
        false
      );
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle string error messages', () => {
      handleNetworkError('CORS error', { action: 'loading data' });

      expect(toast).toHaveBeenCalledWith(
        'Connection blocked. Please contact support if this persists. (loading data)',
        false
      );
    });

    it('should suggest retry after network error', () => {
      vi.useFakeTimers();

      handleNetworkError('Connection refused', { action: 'test' });

      vi.advanceTimersByTime(500);

      expect(toast).toHaveBeenCalledTimes(2); // Initial error + retry suggestion

      vi.useRealTimers();
    });
  });

  describe('handleRateLimitError', () => {
    it('should display rate limit message without retry seconds', () => {
      handleRateLimitError({ action: 'sending requests' });

      expect(toast).toHaveBeenCalledWith(
        'Too many requests. (sending requests)',
        false
      );
    });

    it('should display rate limit message with retry seconds', () => {
      handleRateLimitError({ action: 'submitting form' }, 60);

      expect(toast).toHaveBeenCalledWith(
        'Too many requests. Please wait about 1 minute. (submitting form)',
        false
      );
    });

    it('should pluralize minutes correctly', () => {
      handleRateLimitError({ action: 'test' }, 300);

      expect(toast).toHaveBeenCalledWith(
        'Too many requests. Please wait about 5 minutes. (test)',
        false
      );
    });

    it('should log warning to console', () => {
      handleRateLimitError({ action: 'test action' }, 120);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[Rate Limited] test action',
        { retryAfterSeconds: 120 }
      );
    });
  });

  describe('handle401Error', () => {
    it('should display session expired message', () => {
      handle401Error({ action: 'loading page' });

      expect(toast).toHaveBeenCalledWith(
        'Your session has expired. Redirecting to login...',
        false
      );
    });

    it('should call redirect callback after delay', () => {
      vi.useFakeTimers();

      const callback = vi.fn();
      handle401Error({ action: 'test' }, callback);

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should redirect to landing by default (via authService.logout)', () => {
      vi.useFakeTimers();

      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { href: '', hash: '' } as any;

      handle401Error({ action: 'test' });

      vi.advanceTimersByTime(1000);

      expect(window.location.hash).toBe('#/landing');

      window.location = originalLocation;
      vi.useRealTimers();
    });

    it('should remove token from localStorage', () => {
      vi.useFakeTimers();

      localStorage.setItem('token', 'test-token');

      handle401Error({ action: 'test' });

      vi.advanceTimersByTime(1000);

      expect(localStorage.getItem('token')).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('withErrorHandling', () => {
    it('should return successful result without retrying', async () => {
      const fn = vi.fn().mockResolvedValue({ ok: true, data: 'success' });

      const result = await withErrorHandling(fn, { action: 'test' });

      expect(result).toEqual({ ok: true, data: 'success' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure with exponential backoff', async () => {
      vi.useFakeTimers();

      const fn = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'Network error' })
        .mockResolvedValueOnce({ ok: false, error: 'Network error' })
        .mockResolvedValueOnce({ ok: true, data: 'success' });

      const promise = withErrorHandling(fn, { action: 'test' }, 2);

      // First attempt (no delay)
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for first backoff (1s)
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Second attempt
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait for second backoff (2s)
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();

      // Third attempt (succeeds)
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toEqual({ ok: true, data: 'success' });

      vi.useRealTimers();
    });

    it('should show error on final attempt', async () => {
      vi.useFakeTimers();

      const fn = vi.fn().mockResolvedValue({ ok: false, error: 'Persistent failure', code: 500 });

      const resultPromise = withErrorHandling(fn, { action: 'test' }, 1);

      // Let the first attempt complete
      await vi.runOnlyPendingTimersAsync();

      // Advance past first retry backoff
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual({ ok: false, error: 'Persistent failure', code: 500 });
      expect(toast).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle rate limit errors without retry', async () => {
      const fn = vi.fn().mockResolvedValue({ ok: false, code: 429, error: 'Rate limited' });

      const result = await withErrorHandling(fn, { action: 'test' }, 2);

      expect(result).toEqual({ ok: false, code: 429, error: 'Rate limited' });
      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });

    it('should handle thrown errors', async () => {
      vi.useFakeTimers();

      const error = new Error('Network timeout');
      const fn = vi.fn().mockRejectedValue(error);

      const result = await withErrorHandling(fn, { action: 'test' }, 0);

      expect(result.ok).toBe(false);
      expect(consoleSpy.error).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('error message mapping', () => {
    const testCases = [
      {
        error: 'Failed to fetch',
        expected: 'Unable to connect to server. Please check your connection.',
      },
      {
        error: 'timeout',
        expected: 'Request timed out. Please try again.',
      },
      {
        error: 'CORS error',
        expected: 'Connection blocked. Please contact support if this persists.',
      },
      {
        error: 'ERR_NETWORK',
        expected: 'Network error. Please check your connection.',
      },
    ];

    testCases.forEach(({ error, expected }) => {
      it(`should map "${error}" to user-friendly message`, () => {
        handleApiError(
          { ok: false, error },
          { action: 'test' },
          false
        );

        expect(toast).toHaveBeenCalledWith(
          expect.stringContaining(expected),
          false
        );
      });
    });

    const httpCases = [
      { code: 400, expected: 'Invalid request' },
      { code: 401, expected: 'Your session has expired' },
      { code: 403, expected: 'do not have permission' },
      { code: 404, expected: 'not found' },
      { code: 500, expected: 'Server error' },
      { code: 503, expected: 'under maintenance' },
    ];

    httpCases.forEach(({ code, expected }) => {
      it(`should map HTTP ${code} to user-friendly message`, () => {
        handleApiError(
          { ok: false, code, error: `HTTP ${code}` },
          { action: 'test' },
          false
        );

        expect(toast).toHaveBeenCalledWith(
          expect.stringContaining(expected),
          false
        );
      });
    });
  });
});
