/**
 * Unit tests for apiClient module
 * Tests authentication endpoint wrapper methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './apiClient';
import * as apiModule from './api';

// Mock the api module
vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('apiClient', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    // Setup mock localStorage
    mockLocalStorage = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => mockLocalStorage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      mockLocalStorage[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete mockLocalStorage[key];
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should call api.post with correct endpoint and credentials', async () => {
      const mockResponse = { ok: true, data: { token: 'test-token' } };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockResponse);

      const result = await apiClient.login('test@example.com', 'password123');

      expect(apiModule.api.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle login errors', async () => {
      const mockError = { ok: false, error: 'Invalid credentials', code: 400 };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockError);

      const result = await apiClient.login('test@example.com', 'wrong');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('loginUsername', () => {
    it('should call api.post with correct endpoint and username credentials', async () => {
      const mockResponse = { 
        ok: true, 
        data: { 
          token: 'test-token',
          user: { _id: '123', username: 'testuser', email: 'testuser@mines.mallchain.local' }
        } 
      };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockResponse);

      const result = await apiClient.loginUsername('testuser', 'password123');

      expect(apiModule.api.post).toHaveBeenCalledWith('/api/auth/login-username', {
        username: 'testuser',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('register', () => {
    it('should call api.post with correct endpoint and user data', async () => {
      const mockResponse = { ok: true, data: { token: 'new-token' } };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockResponse);

      const result = await apiClient.register('newuser@example.com', 'securepass');

      expect(apiModule.api.post).toHaveBeenCalledWith('/api/auth/register', {
        email: 'newuser@example.com',
        password: 'securepass',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle registration errors (email exists)', async () => {
      const mockError = { ok: false, error: 'email exists', code: 400 };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockError);

      const result = await apiClient.register('existing@example.com', 'password');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('email exists');
    });
  });

  describe('registerUsername', () => {
    it('should call api.post with correct endpoint and username data', async () => {
      const mockResponse = { 
        ok: true, 
        data: { 
          token: 'new-token',
          user: { _id: '456', username: 'newuser', email: 'newuser@mines.mallchain.local' }
        } 
      };
      vi.spyOn(apiModule.api, 'post').mockResolvedValue(mockResponse);

      const result = await apiClient.registerUsername('newuser', 'securepass');

      expect(apiModule.api.post).toHaveBeenCalledWith('/api/auth/register-username', {
        username: 'newuser',
        password: 'securepass',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getCurrentUser', () => {
    it('should call api.get with correct endpoint', async () => {
      const mockUser = {
        _id: '123',
        id: '123',
        email: 'test@example.com',
        username: null,
        phone: null,
        role: 'user',
        creator_level: '0',
        mlpts_balance: 100,
        mallcoin_balance: 50,
        streak_count: 5,
        tasks_completed: 10,
        rank_points: 200,
        fraud_strikes: 0,
        fraud_status: 'clear',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const mockResponse = { ok: true, data: { user: mockUser } };
      vi.spyOn(apiModule.api, 'get').mockResolvedValue(mockResponse);

      const result = await apiClient.getCurrentUser();

      expect(apiModule.api.get).toHaveBeenCalledWith('/api/auth/me');
      expect(result).toEqual(mockResponse);
      expect(result.data?.user.email).toBe('test@example.com');
    });

    it('should handle 401 error when token is invalid', async () => {
      const mockError = { ok: false, error: 'invalid token', code: 401 };
      vi.spyOn(apiModule.api, 'get').mockResolvedValue(mockError);

      const result = await apiClient.getCurrentUser();

      expect(result.ok).toBe(false);
      expect(result.code).toBe(401);
    });
  });

  describe('logout', () => {
    it('should remove token from localStorage', async () => {
      mockLocalStorage['token'] = 'test-token';

      const result = await apiClient.logout();

      expect(result.ok).toBe(true);
      expect(result.data?.message).toBe('Logged out successfully');
      expect(mockLocalStorage['token']).toBeUndefined();
    });

    it('should handle localStorage errors gracefully', async () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const result = await apiClient.logout();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('localStorage not available');
    });
  });

  describe('storeToken', () => {
    it('should store token in localStorage', () => {
      apiClient.storeToken('new-token-123');

      expect(mockLocalStorage['token']).toBe('new-token-123');
    });

    it('should handle localStorage errors', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      apiClient.storeToken('token');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to store token in localStorage:',
        'Storage quota exceeded'
      );
    });
  });

  describe('getToken', () => {
    it('should retrieve token from localStorage', () => {
      mockLocalStorage['token'] = 'stored-token';

      const token = apiClient.getToken();

      expect(token).toBe('stored-token');
    });

    it('should return null when token does not exist', () => {
      const token = apiClient.getToken();

      expect(token).toBeNull();
    });

    it('should handle localStorage errors', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const token = apiClient.getToken();

      expect(token).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to get token from localStorage:',
        'localStorage not available'
      );
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      mockLocalStorage['token'] = 'valid-token';

      expect(apiClient.isAuthenticated()).toBe(true);
    });

    it('should return false when token does not exist', () => {
      expect(apiClient.isAuthenticated()).toBe(false);
    });
  });
});
