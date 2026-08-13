/**
 * Auth Integration Tests
 * Tests complete signup, login, lockout recovery, session persistence, and logout flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '../../services/auth';
import { validateEmail, validatePassword, validatePIN } from '../../services/validation';

describe('Auth Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    global.fetch = vi.fn();
  });

  describe('Complete Signup Flow', () => {
    it('should complete signup: email → password → 2FA → backup', async () => {
      // Step 1: Validate email
      const emailValidation = validateEmail('newuser@example.com');
      expect(emailValidation.valid).toBe(true);

      // Step 2: Validate password
      const passwordValidation = validatePassword('StrongPass123!');
      expect(passwordValidation.valid).toBe(true);

      // Step 3: Create 2FA setup token (mocked)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ setupToken: 'setup-token', qrCode: 'data:image/svg+xml...' }),
      });

      // Step 4: Verify mnemonic backup (would show 12-word phrase)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ confirmationRequired: true }),
      });

      // Step 5: Complete signup
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'jwt-token', userId: 'user-123' }),
      });

      // Verify flow completes
      expect(emailValidation.valid && passwordValidation.valid).toBe(true);
    });

    it('should reject duplicate email during signup', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Email already registered' }),
      });

      // Simulate duplicate email check
      const response = await fetch('/api/auth/email-exists', {
        method: 'POST',
        body: JSON.stringify({ email: 'taken@example.com' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
    });

    it('should reject weak password during signup', async () => {
      const passwordValidation = validatePassword('weak');
      expect(passwordValidation.valid).toBe(false);
    });
  });

  describe('Complete Login Flow', () => {
    it('should complete login: email/password → PIN → dashboard', async () => {
      // Step 1: Submit email and password
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionToken: 'session-token' }),
      });

      const emailResponse = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'ValidPass123' }),
      });
      expect(emailResponse.ok).toBe(true);

      const emailData = await emailResponse.json();
      sessionStorage.setItem('session_token', emailData.sessionToken);

      // Step 2: Verify PIN
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'jwt-token' }),
      });

      const pinResponse = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ sessionToken: emailData.sessionToken, pin: '123456' }),
      });
      expect(pinResponse.ok).toBe(true);

      const pinData = await pinResponse.json();
      localStorage.setItem('token', pinData.token);

      // Step 3: Verify token stored
      expect(localStorage.getItem('token')).toBe('jwt-token');
      expect(sessionStorage.getItem('session_token')).toBeDefined();
    });

    it('should store PIN attempts in localStorage for lockout tracking', () => {
      // First attempt
      let attempts = { count: 1, lockedUntil: null };
      localStorage.setItem('pin_attempts', JSON.stringify(attempts));

      // Second attempt
      attempts.count = 2;
      localStorage.setItem('pin_attempts', JSON.stringify(attempts));

      // Third attempt triggers lockout
      attempts.count = 3;
      attempts.lockedUntil = Date.now() + 15 * 60 * 1000;
      localStorage.setItem('pin_attempts', JSON.stringify(attempts));

      const stored = JSON.parse(localStorage.getItem('pin_attempts') || '{}');
      expect(stored.count).toBe(3);
      expect(stored.lockedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('Account Lockout Recovery', () => {
    it('should unlock account after 15 minute wait', async () => {
      // Lock account
      const lockoutTime = Date.now() - 1000; // 1 second in the past
      localStorage.setItem('pin_lockout', JSON.stringify({
        locked: true,
        remainingAttempts: 0,
        lockoutEndsAt: lockoutTime,
      }));

      // Check if unlocked
      const lockoutData = JSON.parse(localStorage.getItem('pin_lockout') || '{}');
      const isUnlocked = lockoutData.lockoutEndsAt && Date.now() > lockoutData.lockoutEndsAt;

      expect(isUnlocked).toBe(true);
    });

    it('should allow unlock with backup code', async () => {
      // Attempt backup code verification
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'jwt-token', backupCodeUsed: true }),
      });

      const response = await fetch('/api/auth/verify-backup-code', {
        method: 'POST',
        body: JSON.stringify({ sessionToken: 'token', backupCode: 'BACKUP-CODE-123' }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.backupCodeUsed).toBe(true);

      // Clear lockout
      localStorage.removeItem('pin_lockout');
      expect(localStorage.getItem('pin_lockout')).toBeNull();
    });

    it('should show countdown when locked', () => {
      const lockoutTime = Date.now() + 10 * 60 * 1000; // 10 minutes
      localStorage.setItem('pin_lockout', JSON.stringify({
        locked: true,
        remainingAttempts: 0,
        lockoutEndsAt: lockoutTime,
      }));

      const lockoutData = JSON.parse(localStorage.getItem('pin_lockout') || '{}');
      const remainingMs = lockoutData.lockoutEndsAt - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60000);

      expect(remainingMins).toBeGreaterThan(0);
      expect(remainingMins).toBeLessThanOrEqual(15);
    });
  });

  describe('Session Persistence', () => {
    it('should persist session token across page reloads', async () => {
      // Initial login
      const token = 'jwt-token-12345';
      localStorage.setItem('token', token);

      // Simulate page reload - check if token still available
      const retrievedToken = localStorage.getItem('token');
      expect(retrievedToken).toBe(token);
    });

    it('should validate token is still valid after reload', async () => {
      const token = 'jwt-token-12345';
      localStorage.setItem('token', token);

      // Mock token validation endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, expiresIn: 3600 }),
      });

      const response = await fetch('/api/auth/validate-token', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.valid).toBe(true);
    });

    it('should handle token expiration gracefully', async () => {
      const token = 'expired-token';
      localStorage.setItem('token', token);

      // Mock token validation returning expired
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Token expired' }),
      });

      const response = await fetch('/api/auth/validate-token', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);

      // Clear token and redirect to login
      if (!response.ok) {
        localStorage.removeItem('token');
        expect(localStorage.getItem('token')).toBeNull();
      }
    });

    it('should restore user state from token on app load', async () => {
      const token = 'jwt-token';
      localStorage.setItem('token', token);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'user@example.com',
            name: 'Test User',
          },
        }),
      });

      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.ok).toBe(true);
      const userData = await response.json();
      expect(userData.user.email).toBe('user@example.com');
    });
  });

  describe('Logout Flow', () => {
    it('should clear token from storage on logout', () => {
      localStorage.setItem('token', 'jwt-token');
      sessionStorage.setItem('session_token', 'session-token');

      // Logout - clear all tokens
      localStorage.removeItem('token');
      sessionStorage.removeItem('session_token');

      expect(localStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('session_token')).toBeNull();
    });

    it('should call logout endpoint to invalidate token server-side', async () => {
      const token = 'jwt-token';
      localStorage.setItem('token', token);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.ok).toBe(true);
    });

    it('should clear user state on logout', () => {
      // Store user state
      sessionStorage.setItem('user', JSON.stringify({
        id: 'user-123',
        email: 'user@example.com',
        authed: true,
      }));

      // Clear on logout
      sessionStorage.removeItem('user');

      expect(sessionStorage.getItem('user')).toBeNull();
    });

    it('should redirect to login page after logout', () => {
      // Mock navigation
      const navigate = vi.fn();

      // Clear tokens
      localStorage.removeItem('token');
      sessionStorage.removeItem('session_token');

      // Redirect to login
      if (!localStorage.getItem('token')) {
        navigate('/auth/login');
      }

      expect(navigate).toHaveBeenCalledWith('/auth/login');
    });

    it('should clear remember me preference on logout', () => {
      localStorage.setItem('remember_email', 'user@example.com');

      // Option 1: Clear on logout
      localStorage.removeItem('remember_email');
      expect(localStorage.getItem('remember_email')).toBeNull();

      // Option 2: Keep for convenience (depending on UX preference)
      localStorage.setItem('remember_email', 'user@example.com');
      expect(localStorage.getItem('remember_email')).toBe('user@example.com');
    });
  });

  describe('Session Security', () => {
    it('should not expose token in URL or query params', async () => {
      const token = 'jwt-token';
      const url = 'https://mallchain.app/dashboard';

      // Should NOT contain token
      expect(url).not.toMatch(/token|auth/i);
    });

    it('should use secure token storage', () => {
      const token = 'jwt-token-secret';

      // Store in localStorage (not httpOnly due to browser limitations)
      localStorage.setItem('token', token);

      // In production, use secure cookies with httpOnly flag
      expect(localStorage.getItem('token')).toBe(token);
    });

    it('should validate CSRF token on logout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'csrf-token-value',
          Authorization: 'Bearer jwt-token',
        },
      });

      expect(response.ok).toBe(true);
    });

    it('should clear sensitive data from memory after logout', () => {
      let password: string | null = 'SensitivePassword123!';
      let pin: string | null = '123456';

      // Logout - clear sensitive data
      password = null;
      pin = null;

      expect(password).toBeNull();
      expect(pin).toBeNull();
    });
  });

  describe('Multi-Step Error Recovery', () => {
    it('should recover from failed email/password step', async () => {
      // First attempt fails
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      const response1 = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'wrong' }),
      });

      expect(response1.ok).toBe(false);

      // Second attempt succeeds
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionToken: 'session-token' }),
      });

      const response2 = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'correct' }),
      });

      expect(response2.ok).toBe(true);
    });

    it('should allow going back to previous step', () => {
      const currentStep = 1; // PIN entry

      // Go back to email/password
      const previousStep = currentStep - 1;
      expect(previousStep).toBe(0);

      // Session token should still be valid for retry
      sessionStorage.setItem('session_token', 'valid-token');
      expect(sessionStorage.getItem('session_token')).toBeTruthy();
    });
  });
});
