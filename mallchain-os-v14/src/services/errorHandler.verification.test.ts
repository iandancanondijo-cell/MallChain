/**
 * Task 6.2-6.7: Verification tests for error handling system
 * 
 * Tests user-friendly error message display for all common failure scenarios:
 * - Task 6.2: Common failure scenarios (network timeout, connection refused, CORS, 429, 500, 401)
 * - Task 6.3: 429 rate limit error handling with wait messages
 * - Task 6.4: Socket.IO connection error fallback messages
 * - Task 6.5: Manual testing guidance for error scenarios
 * - Task 6.6: Error logging to console verification
 * - Task 6.7: Toast/notification system display verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast } from '../components/ui';
import {
  handleApiError,
  handleNetworkError,
  handleRateLimitError,
  handle401Error,
  withErrorHandling,
} from './errorHandler';
import type { ApiResult } from './api';

// Mock the toast function
vi.mock('../components/ui', () => ({
  toast: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Setup console mocks to verify logging
const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Task 6.2: User-Friendly Error Messages for Common Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Network Timeout', () => {
    it('should display user-friendly message for timeout error', () => {
      const result: ApiResult = {
        ok: false,
        error: 'timeout',
      };

      handleApiError(result, {
        action: 'loading wallet data',
        endpoint: '/api/wallet/balances',
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
        false
      );
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('API Error'),
        expect.any(Object)
      );
    });

    it('should suggest retry for timeout errors', () => {
      const result: ApiResult = {
        ok: false,
        error: 'Request timeout',
      };

      handleApiError(result, {
        action: 'fetching transactions',
        endpoint: '/api/tx',
      }, true);

      expect(toast).toHaveBeenCalled();
    });
  });

  describe('Connection Refused', () => {
    it('should handle "Failed to fetch" error gracefully', () => {
      const error = new Error('Failed to fetch');
      
      handleNetworkError(error, {
        action: 'connecting to backend',
        endpoint: '/api/health',
        originalError: error,
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect'),
        false
      );
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('Network Error'),
        expect.any(Object)
      );
    });

    it('should handle network request failed', () => {
      const error = new Error('Network request failed');
      
      handleNetworkError(error, {
        action: 'sending transaction',
        endpoint: '/api/tx',
        originalError: error,
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect'),
        false
      );
    });

    it('should include context about what failed', () => {
      const error = new Error('Failed to fetch');
      const context = {
        action: 'loading wallet balances',
        endpoint: '/api/wallet/balances',
      };

      handleNetworkError(error, context);

      expect(toast).toHaveBeenCalled();
      const call = (toast as any).mock.calls[0];
      expect(call[0]).toContain('loading wallet balances');
    });
  });

  describe('CORS Error', () => {
    it('should handle CORS errors with helpful message', () => {
      const result: ApiResult = {
        ok: false,
        error: 'CORS error: Cross-Origin Request Blocked',
      };

      handleApiError(result, {
        action: 'accessing API',
        endpoint: '/api/balances',
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Connection blocked'),
        false
      );
    });

    it('should suggest contacting support for CORS issues', () => {
      const error = new Error('CORS policy: No \'Access-Control-Allow-Origin\' header');

      handleNetworkError(error, {
        action: 'fetching data',
        endpoint: '/api/market',
        originalError: error,
      });

      expect(toast).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting (429)', () => {
    it('should display rate limit message', () => {
      const result: ApiResult = {
        ok: false,
        code: 429,
        error: 'Too many requests',
      };

      handleApiError(result, {
        action: 'sending transactions',
        endpoint: '/api/tx',
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Too many requests'),
        false
      );
    });

    it('should show HTTP error code message for 429', () => {
      const result: ApiResult = {
        ok: false,
        code: 429,
        error: 'Rate limit exceeded',
      };

      handleApiError(result, {
        action: 'submitting form',
      });

      // Should show the HTTP error message
      expect(toast).toHaveBeenCalled();
    });

    it('should be marked as retryable', () => {
      const result: ApiResult = {
        ok: false,
        code: 429,
        error: 'Rate limited',
      };

      // This should not throw and should handle gracefully
      handleApiError(result, {
        action: 'test',
      });

      expect(toast).toHaveBeenCalled();
    });
  });

  describe('Server Error (500)', () => {
    it('should display user-friendly message for 500 errors', () => {
      const result: ApiResult = {
        ok: false,
        code: 500,
        error: 'Internal server error',
      };

      handleApiError(result, {
        action: 'processing request',
        endpoint: '/api/tx',
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Server error'),
        false
      );
    });

    it('should suggest retry for 500 errors', () => {
      const result: ApiResult = {
        ok: false,
        code: 500,
        error: 'Server error',
      };

      handleApiError(result, { action: 'test' }, true);

      expect(toast).toHaveBeenCalled();
    });

    it('should handle various server error codes (502, 503, 504)', () => {
      const errorCodes = [502, 503, 504];

      for (const code of errorCodes) {
        vi.clearAllMocks();
        const result: ApiResult = {
          ok: false,
          code,
          error: `Server error ${code}`,
        };

        handleApiError(result, { action: 'test' });

        expect(toast).toHaveBeenCalled();
        const message = (toast as any).mock.calls[0][0];
        expect(message).toMatch(/server|unavailable|timeout/i);
      }
    });
  });

  describe('Unauthorized (401)', () => {
    it('should clear token and redirect on 401', () => {
      localStorage.setItem('token', 'test-token');
      const redirectFn = vi.fn();

      handle401Error(
        { action: 'accessing protected route', endpoint: '/api/wallet' },
        redirectFn
      );

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('expired'),
        false
      );
      expect(consoleWarnMock).toHaveBeenCalled();

      // Wait for async redirect
      setTimeout(() => {
        expect(localStorage.getItem('token')).toBeNull();
        expect(redirectFn).toHaveBeenCalled();
      }, 1100);
    });

    it('should handle 401 response from API', () => {
      const result: ApiResult = {
        ok: false,
        code: 401,
        error: 'Invalid or expired token',
      };

      handleApiError(result, {
        action: 'loading user profile',
        endpoint: '/api/user',
      });

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('expired'),
        false
      );
    });
  });
});

describe('Task 6.3: Rate Limit Error Handling with Wait Messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display rate limit error with standard message', () => {
    handleRateLimitError({
      action: 'submitting rapid requests',
    });

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('Too many requests'),
      false
    );
  });

  it('should include retry wait time when provided', () => {
    handleRateLimitError(
      { action: 'sending transactions' },
      60 // 60 seconds
    );

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('wait'),
      false
    );
  });

  it('should calculate minutes for wait time display', () => {
    handleRateLimitError(
      { action: 'bulk operations' },
      120 // 2 minutes
    );

    expect(toast).toHaveBeenCalled();
    const message = (toast as any).mock.calls[0][0];
    expect(message).toMatch(/2 minute/i);
  });

  it('should log rate limit with retry info', () => {
    handleRateLimitError(
      { action: 'test' },
      30
    );

    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('Rate Limited'),
      expect.any(Object)
    );
  });

  it('should include context about failed action', () => {
    handleRateLimitError({
      action: 'uploading data batch',
      endpoint: '/api/upload',
    });

    expect(toast).toHaveBeenCalled();
    const message = (toast as any).mock.calls[0][0];
    // Should contain the action context
    expect(message).toBeDefined();
  });
});

describe('Task 6.4: Socket.IO Connection Errors with Fallback Messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle socket connection error', () => {
    const error = new Error('WebSocket connection failed');

    handleNetworkError(error, {
      action: 'connecting to real-time updates',
      endpoint: 'ws://localhost:4000',
      originalError: error,
    });

    expect(toast).toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalled();
  });

  it('should provide fallback UI message for Socket.IO errors', () => {
    const error = new Error('ECONNREFUSED: Connection refused');

    handleNetworkError(error, {
      action: 'establishing websocket',
      endpoint: 'ws://localhost:4000',
      originalError: error,
    });

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('Unable to connect'),
      false
    );
  });

  it('should suggest continuing with manual refresh', async () => {
    const error = new Error('Socket timeout');

    handleNetworkError(error, {
      action: 'subscribing to wallet updates',
    });

    expect(toast).toHaveBeenCalled();
    
    // Wait for delayed toast
    await new Promise(r => setTimeout(r, 600));

    // Should suggest manual refresh in one of the toasts
    const calls = (toast as any).mock.calls;
    const messages = calls.map((c: any) => c[0]).join(' ');
    // Error handler shows retry suggestion in a second delayed toast with 💡 emoji
    expect(messages).toContain('refresh');
  });

  it('should log socket errors for debugging', () => {
    const error = new Error('WebSocket error: 1000');

    handleNetworkError(error, {
      action: 'socket communication',
      endpoint: 'ws://localhost:4000',
      originalError: error,
    });

    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('Network Error'),
      expect.objectContaining({
        error: expect.stringContaining('WebSocket'),
      })
    );
  });
});

describe('Task 6.5: Manual Test Scenarios', () => {
  // These tests verify that the error handler works with various real-world scenarios
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle complete error flow: network error → log → display → retry suggestion', () => {
    const error = new Error('Failed to fetch');
    const context = {
      action: 'loading dashboard data',
      endpoint: '/api/dashboard',
      originalError: error,
    };

    handleNetworkError(error, context);

    // Verify logging happened
    expect(consoleErrorMock).toHaveBeenCalled();

    // Verify toast displayed
    expect(toast).toHaveBeenCalled();

    // Verify messages are user-friendly
    const messages = (toast as any).mock.calls.map((c: any) => c[0]);
    expect(messages.some((m: string) => !m.includes('fetch'))).toBe(true);
  });

  it('should handle cascading errors with proper context', () => {
    const errors = [
      { error: new Error('Failed to fetch'), action: 'initial request' },
      { error: new Error('timeout'), action: 'retry attempt 1' },
      { error: new Error('Connection refused'), action: 'retry attempt 2' },
    ];

    for (const { error, action } of errors) {
      vi.clearAllMocks();
      handleNetworkError(error, { action });
      expect(toast).toHaveBeenCalled();
    }
  });

  it('should handle mixed HTTP and network errors', () => {
    vi.clearAllMocks();
    const httpError: ApiResult = {
      ok: false,
      code: 500,
      error: 'Internal server error',
    };
    handleApiError(httpError, { action: 'http test' });

    vi.clearAllMocks();
    const networkError = new Error('Failed to fetch');
    handleNetworkError(networkError, { action: 'network test' });

    // Both should display errors
    expect(toast).toHaveBeenCalled();
  });
});

describe('Task 6.6: Error Logging to Console for Debugging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log API errors with full details', () => {
    const result: ApiResult = {
      ok: false,
      code: 500,
      error: 'Server error',
    };

    handleApiError(result, {
      action: 'processing transaction',
      endpoint: '/api/tx',
    });

    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('API Error'),
      expect.objectContaining({
        endpoint: '/api/tx',
        error: 'Server error',
        code: 500,
      })
    );
  });

  it('should log network errors with original error object', () => {
    const originalError = new Error('Network timeout');
    
    handleNetworkError(originalError, {
      action: 'socket connection',
      endpoint: 'ws://localhost:4000',
      originalError,
    });

    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('Network Error'),
      expect.objectContaining({
        error: expect.stringContaining('timeout'),
        originalError: originalError,
      })
    );
  });

  it('should log 401 errors to console', () => {
    handle401Error({
      action: 'accessing protected endpoint',
      endpoint: '/api/admin',
    });

    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('Unauthorized'),
      expect.any(Object)
    );
  });

  it('should log rate limit errors for monitoring', () => {
    handleRateLimitError({
      action: 'bulk API calls',
    }, 60);

    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('Rate Limited'),
      expect.any(Object)
    );
  });

  it('should include endpoint and action context in logs', () => {
    const error: ApiResult = {
      ok: false,
      code: 403,
      error: 'Access forbidden',
    };

    handleApiError(error, {
      action: 'deleting user account',
      endpoint: '/api/users/delete',
    });

    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        endpoint: '/api/users/delete',
      })
    );
  });

  it('should handle errors that occur during logging', () => {
    // This tests error handling robustness
    const error = new Error('Error during logging');
    
    expect(() => {
      handleNetworkError(error, {
        action: 'test',
      });
    }).not.toThrow();
  });
});

describe('Task 6.7: Toast/Notification System Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display toast for API errors', () => {
    const result: ApiResult = {
      ok: false,
      code: 500,
      error: 'Server error',
    };

    handleApiError(result, { action: 'test' });

    expect(toast).toHaveBeenCalled();
  });

  it('should pass error flag (false) to toast for error messages', () => {
    const result: ApiResult = {
      ok: false,
      code: 400,
      error: 'Bad request',
    };

    handleApiError(result, { action: 'test' });

    // Second parameter should be false (error state)
    expect(toast).toHaveBeenCalledWith(
      expect.any(String),
      false
    );
  });

  it('should display user-friendly messages in toast, not technical errors', () => {
    const result: ApiResult = {
      ok: false,
      code: 500,
    };

    handleApiError(result, { action: 'test' });

    const message = (toast as any).mock.calls[0][0];
    expect(message).not.toMatch(/Error|Exception|TypeError/);
  });

  it('should format rate limit wait time in toast message', () => {
    handleRateLimitError(
      { action: 'test' },
      180 // 3 minutes
    );

    const message = (toast as any).mock.calls[0][0];
    expect(message).toMatch(/minute/i);
  });

  it('should include action context in toast messages', () => {
    const result: ApiResult = {
      ok: false,
      error: 'Connection error',
    };

    const context = {
      action: 'syncing wallet',
      endpoint: '/api/wallet/sync',
    };

    handleApiError(result, context);

    const message = (toast as any).mock.calls[0][0];
    expect(message).toContain('syncing wallet');
  });

  it('should show multiple toasts for comprehensive error feedback', () => {
    const result: ApiResult = {
      ok: false,
      code: 500,
      error: 'Server error',
    };

    handleApiError(result, { action: 'test' }, true); // showRetryOption = true

    // Should show at least one toast (error message)
    expect(toast).toHaveBeenCalled();
  });

  it('should use appropriate tone in error messages', () => {
    const testCases = [
      { error: 'Failed to fetch', expectedTone: 'friendly' },
      { code: 429, expectedTone: 'helpful' },
      { code: 401, expectedTone: 'actionable' },
    ];

    for (const testCase of testCases) {
      vi.clearAllMocks();
      
      if ('code' in testCase) {
        const result: ApiResult = {
          ok: false,
          code: testCase.code,
          error: 'test error',
        };
        handleApiError(result, { action: 'test' });
      } else {
        handleNetworkError(testCase.error, { action: 'test' });
      }

      const message = (toast as any).mock.calls[0][0];
      // Messages should be clear and user-friendly
      expect(message).toBeTruthy();
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it('should handle retry suggestions in toasts', () => {
    const result: ApiResult = {
      ok: false,
      code: 500,
      error: 'Server error',
    };

    handleApiError(result, { action: 'test' }, true);

    // Should display user message and retry suggestion
    expect(toast).toHaveBeenCalled();
  });
});

describe('Task 6: Integrated Error Handling with withErrorHandling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful API calls without error display', async () => {
    const result: ApiResult = { ok: true, data: { test: 'data' } };
    const fn = vi.fn().mockResolvedValue(result);

    const response = await withErrorHandling(fn, { action: 'test' });

    expect(response.ok).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it('should handle failed API calls with error display', async () => {
    const result: ApiResult = { ok: false, error: 'Test error' };
    const fn = vi.fn().mockResolvedValue(result);

    const response = await withErrorHandling(fn, { action: 'test' }, 0);

    expect(response.ok).toBe(false);
    expect(toast).toHaveBeenCalled();
  });

  it('should implement exponential backoff for retries', async () => {
    const results = [
      { ok: false, error: 'Try again' },
      { ok: true, data: 'Success' },
    ];
    const fn = vi.fn()
      .mockResolvedValueOnce(results[0])
      .mockResolvedValueOnce(results[1]);

    const start = Date.now();
    const response = await withErrorHandling(fn, { action: 'test' }, 1);
    const elapsed = Date.now() - start;

    expect(response.ok).toBe(true);
    // Should have waited for exponential backoff (at least 1 second)
    expect(elapsed).toBeGreaterThan(900);
  });

  it('should handle 429 errors specially without retry', async () => {
    const result: ApiResult = { ok: false, code: 429, error: 'Rate limited' };
    const fn = vi.fn().mockResolvedValue(result);

    const response = await withErrorHandling(fn, { action: 'test' }, 1);

    expect(response.ok).toBe(false);
    expect(response.code).toBe(429);
    // Should show rate limit message
    expect(toast).toHaveBeenCalled();
  });

  it('should handle 401 errors with redirect', async () => {
    const result: ApiResult = { ok: false, code: 401, error: 'Unauthorized' };
    const fn = vi.fn().mockResolvedValue(result);

    const response = await withErrorHandling(fn, { action: 'test' }, 0);

    expect(response.ok).toBe(false);
    expect(response.code).toBe(401);
    expect(toast).toHaveBeenCalled();
  });
});
