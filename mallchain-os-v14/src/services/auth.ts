/**
 * Mallchain Mission Control v14 — Authentication service.
 *
 * Contract: Manages JWT token storage and retrieval from localStorage.
 * Provides functions for token lifecycle management on login/logout/expiration.
 *
 * Features:
 * - Task 4.3: Store JWT token in localStorage on login success
 * - Task 4.3: Retrieve token from localStorage for API requests
 * - Task 4.3: Clear token from localStorage on logout/401 response
 * - Token expiration checking
 * - Type-safe token access
 */

const TOKEN_KEY = 'token';

/**
 * JWT payload structure
 */
export interface JwtPayload {
  userId: string;
  username: string;
  exp: number;
  iat?: number;
}

/**
 * Authentication service for token management
 */
class AuthService {
  /**
   * Task 4.3: Store JWT token in localStorage
   * Throws error if localStorage is unavailable (e.g., private browsing mode)
   */
  storeToken(token: string): void {
    try {
      if (!token) {
        throw new Error('Token cannot be empty');
      }
      localStorage.setItem(TOKEN_KEY, token);
      console.log('[Auth] Token stored in localStorage');
    } catch (error) {
      console.error('[Auth] Failed to store token in localStorage:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Task 4.3: Retrieve JWT token from localStorage
   * Returns null if token doesn't exist or localStorage is unavailable
   */
  getToken(): string | null {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      return token ? String(token) : null;
    } catch (error) {
      console.warn('[Auth] Failed to access localStorage for token:', (error as Error).message);
      return null;
    }
  }

  /**
   * Task 4.3: Clear token from localStorage
   * Called on logout or when receiving 401 response
   */
  clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      console.log('[Auth] Token cleared from localStorage');
    } catch (error) {
      console.warn('[Auth] Failed to clear token from localStorage:', (error as Error).message);
    }
  }

  /**
   * Check if user is authenticated
   * Returns true if token exists and is not expired
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const payload = this.decodeToken(token);
      if (!payload) {
        return false;
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) {
        console.log('[Auth] Token expired, clearing');
        this.clearToken();
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Auth] Error checking token validity:', (error as Error).message);
      this.clearToken();
      return false;
    }
  }

  /**
   * Decode JWT token payload (without verification)
   * Note: This is only for client-side parsing. Token signature verification happens on the backend.
   */
  private decodeToken(token: string): JwtPayload | null {
    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      // Decode payload (second part)
      const payload = JSON.parse(atob(parts[1])) as JwtPayload;
      return payload;
    } catch (error) {
      console.error('[Auth] Failed to decode token:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get token expiration time in seconds from now
   * Returns null if token doesn't exist or is invalid
   */
  getTokenExpiresIn(): number | null {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const payload = this.decodeToken(token);
      if (!payload) {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;
      return expiresIn > 0 ? expiresIn : null;
    } catch (error) {
      console.error('[Auth] Error calculating token expiry:', (error as Error).message);
      return null;
    }
  }

  /**
   * Check if token will expire soon (within timeoutSeconds)
   */
  isTokenExpiringSoon(timeoutSeconds: number = 300): boolean {
    const expiresIn = this.getTokenExpiresIn();
    if (expiresIn === null) {
      return true; // Token doesn't exist or is invalid, treat as expiring
    }
    return expiresIn < timeoutSeconds;
  }

  /**
   * Check if browser supports biometric authentication (WebAuthn)
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      return await Promise.resolve(
        typeof window !== 'undefined' &&
        'PublicKeyCredential' in window
      );
    } catch {
      return false;
    }
  }
}

/**
 * Global singleton instance of AuthService
 */
export const authService = new AuthService();
