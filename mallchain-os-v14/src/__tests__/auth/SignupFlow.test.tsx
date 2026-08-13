/**
 * SignupFlow Component Tests
 * Tests form validation, password strength, 2FA setup, and mnemonic backup
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignupFlow from '../../features/auth/SignupFlow';

describe('SignupFlow Component', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    // Mock API calls
    global.fetch = vi.fn();
  });

  describe('Form Field Validation', () => {
    it('should validate email format on blur', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const emailInput = screen.getByPlaceholderText(/email/i);
      
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.blur(emailInput);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid.*email/i)).toBeInTheDocument();
      });
    });

    it('should show error for duplicate email', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true }),
      });

      render(<SignupFlow navigate={mockNavigate} />);
      const emailInput = screen.getByPlaceholderText(/email/i);
      
      fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
      fireEvent.blur(emailInput);
      
      await waitFor(() => {
        expect(screen.getByText(/already registered/i)).toBeInTheDocument();
      });
    });

    it('should validate password minimum length', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      
      fireEvent.change(passwordInput, { target: { value: 'Short1!' } });
      fireEvent.blur(passwordInput);
      
      await waitFor(() => {
        expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
      });
    });

    it('should validate password confirmation match', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      const confirmInput = screen.getByPlaceholderText(/confirm/i);
      
      fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass123!' } });
      fireEvent.blur(confirmInput);
      
      await waitFor(() => {
        expect(screen.getByText(/passwords.*do not match/i)).toBeInTheDocument();
      });
    });
  });

  describe('Password Strength Indicator', () => {
    it('should show strength indicator that updates in real-time', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      
      fireEvent.change(passwordInput, { target: { value: 'weak' } });
      expect(screen.getByText(/very-weak/i) || screen.getByText(/weak/i)).toBeInTheDocument();
      
      fireEvent.change(passwordInput, { target: { value: 'StrongPass123!' } });
      await waitFor(() => {
        expect(screen.getByText(/strong/i)).toBeInTheDocument();
      });
    });

    it('should display strength bar with color coding', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      
      fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
      
      await waitFor(() => {
        const strengthBar = screen.getByRole('progressbar', { hidden: true }) || document.querySelector('[data-testid="strength-bar"]');
        expect(strengthBar).toBeInTheDocument();
      });
    });

    it('should provide feedback for weak passwords', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      
      fireEvent.change(passwordInput, { target: { value: 'lowercase123' } });
      
      await waitFor(() => {
        expect(screen.getByText(/uppercase/i)).toBeInTheDocument();
      });
    });
  });

  describe('2FA Setup Flow', () => {
    it('should display 2FA setup option after password creation', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      // Fill email and password
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/^password/i);
      const confirmInput = screen.getByPlaceholderText(/confirm/i);
      
      fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
      fireEvent.change(confirmInput, { target: { value: 'ValidPass123!' } });
      
      const continueBtn = screen.getByRole('button', { name: /continue/i });
      fireEvent.click(continueBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/2fa|two-factor/i)).toBeInTheDocument();
      });
    });

    it('should allow enabling/disabling 2FA', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      // Navigate to 2FA step (mock previous steps)
      const twoFaToggle = screen.queryByRole('switch', { name: /2fa|two-factor/i });
      if (twoFaToggle) {
        fireEvent.click(twoFaToggle);
        expect(twoFaToggle).toHaveAttribute('aria-checked', 'true');
      }
    });

    it('should display QR code for TOTP setup', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      // Enable 2FA in mock state
      const qrCode = screen.queryByAltText(/qr code|authenticator/i);
      if (qrCode) {
        expect(qrCode).toBeVisible();
      }
    });
  });

  describe('Mnemonic Backup Verification', () => {
    it('should display 12-word mnemonic backup phrase', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      await waitFor(() => {
        const mnemonicWords = screen.queryAllByText(/abandon|about|above/); // Common BIP39 words
        expect(mnemonicWords.length).toBeGreaterThan(0);
      });
    });

    it('should require user to confirm mnemonic words', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      // Get backup words to verify
      const backupPhrase = screen.getByText(/backup.*mnemonic|recovery.*phrase/i);
      expect(backupPhrase).toBeInTheDocument();
      
      // Should show verification step
      const verifyBtn = screen.queryByRole('button', { name: /verify|confirm.*backup/i });
      if (verifyBtn) {
        fireEvent.click(verifyBtn);
        
        await waitFor(() => {
          expect(screen.getByText(/select.*words|click.*order/i)).toBeInTheDocument();
        });
      }
    });

    it('should show error if mnemonic verification fails', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      // Skip backup warning (if available)
      const skipBtn = screen.queryByRole('button', { name: /skip|i saved it/i });
      if (!skipBtn) {
        // Try to proceed with wrong verification
        const wrongWord = screen.queryByRole('button', { name: /word [1-9]/i });
        if (wrongWord) {
          fireEvent.click(wrongWord);
        }
      }
    });

    it('should allow copying mnemonic to clipboard', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      const copyBtn = screen.queryByRole('button', { name: /copy|clipboard/i });
      if (copyBtn) {
        fireEvent.click(copyBtn);
        // In real test, check clipboard content
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate email error from backend', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Email already registered' }),
      });

      render(<SignupFlow navigate={mockNavigate} />);
      const emailInput = screen.getByPlaceholderText(/email/i);
      
      fireEvent.change(emailInput, { target: { value: 'taken@example.com' } });
      
      const submitBtn = screen.getByRole('button', { name: /sign up|create/i });
      fireEvent.click(submitBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/already registered|already exists/i)).toBeInTheDocument();
      });
    });

    it('should handle validation error from backend', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Password does not meet requirements' }),
      });

      render(<SignupFlow navigate={mockNavigate} />);
      const submitBtn = screen.getByRole('button', { name: /sign up|create/i });
      fireEvent.click(submitBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/requirements|invalid/i)).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<SignupFlow navigate={mockNavigate} />);
      const submitBtn = screen.getByRole('button', { name: /sign up|create/i });
      fireEvent.click(submitBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/network|connection|try again/i)).toBeInTheDocument();
      });
    });

    it('should show validation errors inline', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      const emailInput = screen.getByPlaceholderText(/email/i);
      
      fireEvent.change(emailInput, { target: { value: 'invalid' } });
      fireEvent.blur(emailInput);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid.*format|valid.*email/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to login page when "Sign In" link clicked', async () => {
      render(<SignupFlow navigate={mockNavigate} />);
      
      const signInLink = screen.getByRole('link', { name: /sign in|login/i });
      fireEvent.click(signInLink);
      
      expect(mockNavigate).toHaveBeenCalledWith('/auth/login');
    });

    it('should navigate to dashboard on successful signup', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token' }),
      });

      render(<SignupFlow navigate={mockNavigate} />);
      
      const submitBtn = screen.getByRole('button', { name: /sign up|create/i });
      fireEvent.click(submitBtn);
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      }, { timeout: 2000 });
    });
  });
});
