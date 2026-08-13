/**
 * Mallchain Mission Control v14 — API Client Layer
 * 
 * Provides comprehensive wrapper methods for authentication endpoints
 * to make frontend development easier. Uses the existing `api` service
 * and returns proper ApiResult types.
 * 
 * Requirement 9.1: Frontend must map authentication actions to backend routes
 */

import { api } from './api';

interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: number;
}

/**
 * User object structure returned by backend authentication endpoints
 */
export interface User {
  _id: string;
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  role: string;
  creator_level: string;
  mlpts_balance: number;
  mallcoin_balance: number;
  streak_count: number;
  tasks_completed: number;
  rank_points: number;
  fraud_strikes: number;
  fraud_status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Login response structure
 */
export interface LoginResponse {
  token: string;
  user?: User;
}

/**
 * Register response structure
 */
export interface RegisterResponse {
  token: string;
  user?: User;
}

/**
 * Current user response structure (from /api/auth/me)
 */
export interface CurrentUserResponse {
  user: User;
}

/**
 * API Client class providing authentication endpoint methods
 */
class ApiClient {
  /**
   * Login with email and password
   * Maps to: POST /api/auth/login
   * 
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise resolving to ApiResult with token
   */
  async login(email: string, password: string): Promise<ApiResult<LoginResponse>> {
    return api.post<LoginResponse>('/api/auth/login', { email, password });
  }

  /**
   * Login with username and password (mines authentication)
   * Maps to: POST /api/auth/login-username
   * 
   * @param username - User's username
   * @param password - User's password
   * @returns Promise resolving to ApiResult with token and user data
   */
  async loginUsername(username: string, password: string): Promise<ApiResult<LoginResponse>> {
    return api.post<LoginResponse>('/api/auth/login-username', { username, password });
  }

  /**
   * Register new user with email and password
   * Maps to: POST /api/auth/register
   * 
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise resolving to ApiResult with token
   */
  async register(email: string, password: string): Promise<ApiResult<RegisterResponse>> {
    return api.post<RegisterResponse>('/api/auth/register', { email, password });
  }

  /**
   * Register new user with username and password (mines authentication)
   * Maps to: POST /api/auth/register-username
   * 
   * @param username - Desired username (3-32 chars, letters/numbers/underscores)
   * @param password - User's password
   * @returns Promise resolving to ApiResult with token and user data
   */
  async registerUsername(username: string, password: string): Promise<ApiResult<RegisterResponse>> {
    return api.post<RegisterResponse>('/api/auth/register-username', { username, password });
  }

  /**
   * Get current authenticated user information
   * Maps to: GET /api/auth/me
   * Requires valid JWT token in localStorage
   * 
   * @returns Promise resolving to ApiResult with user data
   */
  async getCurrentUser(): Promise<ApiResult<CurrentUserResponse>> {
    return api.get<CurrentUserResponse>('/api/auth/me');
  }

  /**
   * Logout current user
   * Clears JWT token from localStorage
   * Note: Backend doesn't have a dedicated logout endpoint, so this is client-side only
   * 
   * @returns Promise resolving to ApiResult (always succeeds)
   */
  async logout(): Promise<ApiResult<{ message: string }>> {
    try {
      localStorage.removeItem('token');
      return Promise.resolve({ 
        ok: true, 
        data: { message: 'Logged out successfully' } 
      });
    } catch (e) {
      return Promise.resolve({ 
        ok: false, 
        error: (e as Error).message 
      });
    }
  }

  /**
   * Store authentication token in localStorage
   * Helper method for handling successful authentication
   * 
   * @param token - JWT token to store
   */
  storeToken(token: string): void {
    try {
      localStorage.setItem('token', token);
    } catch (e) {
      console.warn('Failed to store token in localStorage:', (e as Error).message);
    }
  }

  /**
   * Get stored authentication token from localStorage
   * 
   * @returns JWT token or null if not found
   */
  getToken(): string | null {
    try {
      return localStorage.getItem('token');
    } catch (e) {
      console.warn('Failed to get token from localStorage:', (e as Error).message);
      return null;
    }
  }

  /**
   * Check if user is authenticated (has valid token)
   * Note: This only checks for token presence, not validity
   * 
   * @returns True if token exists in localStorage
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
}

/**
 * Singleton instance of ApiClient for use throughout the application
 */
export const apiClient = new ApiClient();
