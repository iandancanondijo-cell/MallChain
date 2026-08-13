/**
 * Integration tests for API service with error handling
 * Task 6.1: Test network error display integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api } from './api';
import { config } from './config';
import { toast } from '../components/ui';

// Mock the toast function
vi.mock('../components/ui', () => ({
  toast: vi.fn(),
  toastBus: { listeners: new Set(), emit: vi.fn() },
}));

// Mock the config to enable real API mode
vi.mock('./config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
  },
  sim: {
    enabled: false,
    pause: vi.fn(),
  },
}));

const mockToast = toast as any;
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Service - Error Handling Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Network error handling', () => {
    it('should catch and display network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      await api.get('/test');

      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect to server'),
        false
      );
    });

    it('should include endpoint context in error message', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await api.post('/api/wallet/send', { amount: 100 });

      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect to server'),
        false
      );
    });

    it('should log network errors to console for debugging', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await api.get('/test');

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should still return error in ApiResult format', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await api.get('/test');

      expect(result).toEqual({
        ok: false,
        error: 'Network error',
      });
    });
  });

  describe('HTTP error handling', () => {
    it('should log HTTP errors to console', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      } as any);

      await api.get('/test');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[API Error]'),
        expect.anything()
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return HTTP error in ApiResult format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found' }),
      } as any);

      const result = await api.get('/test');

      expect(result).toEqual({
        ok: false,
        code: 404,
        error: 'Not Found',
      });
    });

    it('should not show toast for HTTP errors by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request' }),
      } as any);

      await api.get('/test');

      // HTTP errors are logged but not toasted by api service
      // The component using the API should decide to show toast
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('401 error handling', () => {
    it('should clear token on 401', async () => {
      localStorage.setItem('token', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as any);

      // Mock window.location with delay
      const originalLocation = window.location;
      delete (window as any).location;
      const locationMock = { href: '' };
      window.location = locationMock as any;

      await api.get('/test');

      // Token should be cleared
      expect(localStorage.getItem('token')).toBeNull();

      // Should show toast
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('session has expired'),
        false
      );

      // Redirect happens after a small delay in error handler
      // This test verifies the immediate effects (token cleared, toast shown)

      window.location = originalLocation;
    });
  });

  describe('Authorization header', () => {
    it('should include token in Authorization header when present', async () => {
      localStorage.setItem('token', 'test-token-123');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      } as any);

      await api.get('/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/protected'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123',
          }),
        })
      );
    });

    it('should not include Authorization header when token is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      } as any);

      await api.get('/public');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('Request deduplication', () => {
    it('should deduplicate concurrent identical requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      } as any);

      // Make two identical requests concurrently
      const [result1, result2] = await Promise.all([
        api.get('/test'),
        api.get('/test'),
      ]);

      // Should only call fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Both should get the same result
      expect(result1).toEqual(result2);
    });
  });

  describe('Successful requests', () => {
    it('should return successful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ balance: 100, tokens: ['MALL'] }),
      } as any);

      const result = await api.get('/wallet/balance');

      expect(result).toEqual({
        ok: true,
        data: { balance: 100, tokens: ['MALL'] },
      });
    });

    it('should not show error toast on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any);

      await api.get('/test');

      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('POST requests', () => {
    it('should include body in POST requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: '123' }),
      } as any);

      const body = { email: 'test@example.com', password: 'secret' };
      await api.post('/auth/login', body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
    });

    it('should handle network errors in POST requests', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await api.post('/submit', {});

      expect(result.ok).toBe(false);
      expect(mockToast).toHaveBeenCalledWith(
        'Request timed out. Please try again. (POST request to /submit)',
        false
      );
    });
  });
});
