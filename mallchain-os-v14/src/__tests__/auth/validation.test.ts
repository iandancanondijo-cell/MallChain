/**
 * Validation Service Tests
 * Tests email, password, PIN, mnemonic, and address validators
 */

import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  validatePIN,
  validateMnemonic,
  validateAddress,
  calculatePasswordStrength,
} from '../../services/validation';

describe('Validation Service', () => {
  describe('Email Validation', () => {
    it('should accept valid email format', () => {
      const result = validateEmail('user@example.com');
      expect(result.valid).toBe(true);
    });

    it('should reject email without @', () => {
      const result = validateEmail('userexample.com');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/invalid|format/i);
    });

    it('should reject email without domain', () => {
      const result = validateEmail('user@');
      expect(result.valid).toBe(false);
    });

    it('should reject email without TLD', () => {
      const result = validateEmail('user@example');
      expect(result.valid).toBe(false);
    });

    it('should reject empty email', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/required/i);
    });

    it('should reject email with leading/trailing spaces', () => {
      const result = validateEmail(' user@example.com ');
      expect(result.valid).toBe(false);
    });

    it('should reject email with consecutive dots', () => {
      const result = validateEmail('user..name@example.com');
      expect(result.valid).toBe(false);
    });

    it('should reject email with dots at start/end of local part', () => {
      const result1 = validateEmail('.user@example.com');
      const result2 = validateEmail('user.@example.com');
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });

    it('should warn about temporary email domains', () => {
      const result = validateEmail('user@tempmail.com');
      expect(result.message).toMatch(/temporary/i);
      expect(result.severity).toBe('warning');
    });

    it('should validate TLD length (2-6 characters)', () => {
      const result1 = validateEmail('user@example.c'); // Too short
      const result2 = validateEmail('user@example.information'); // Too long
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });
  });

  describe('Password Strength Calculation', () => {
    it('should return score 0 for empty password', () => {
      const strength = calculatePasswordStrength('');
      expect(strength.score).toBe(0);
      expect(strength.level).toBe('very-weak');
    });

    it('should return score 0 for very weak password', () => {
      const strength = calculatePasswordStrength('pass');
      expect(strength.score).toBe(0);
    });

    it('should increase score for length', () => {
      const weak = calculatePasswordStrength('Pass1!');
      const strong = calculatePasswordStrength('VeryLongPassword123!@#');
      expect(strong.score).toBeGreaterThan(weak.score);
    });

    it('should increase score for uppercase letters', () => {
      const strength = calculatePasswordStrength('password123!');
      expect(strength.feedback.some(f => f.includes('uppercase'))).toBe(true);
    });

    it('should increase score for lowercase letters', () => {
      const strength = calculatePasswordStrength('PASSWORD123!');
      expect(strength.feedback.some(f => f.includes('lowercase'))).toBe(true);
    });

    it('should increase score for numbers', () => {
      const strength = calculatePasswordStrength('Password!@#');
      expect(strength.feedback.some(f => f.includes('number'))).toBe(true);
    });

    it('should increase score for special characters', () => {
      const strength = calculatePasswordStrength('Password123');
      expect(strength.feedback.some(f => f.includes('special'))).toBe(true);
    });

    it('should penalize repeating characters', () => {
      const normal = calculatePasswordStrength('StrongPass123!');
      const repeating = calculatePasswordStrength('StrongPaaass123!');
      expect(repeating.score).toBeLessThan(normal.score);
    });

    it('should penalize sequential patterns', () => {
      const normal = calculatePasswordStrength('StrongPass567!');
      const sequential = calculatePasswordStrength('StrongPass1234!');
      expect(sequential.score).toBeLessThanOrEqual(normal.score);
    });

    it('should cap score at 5', () => {
      const strength = calculatePasswordStrength('VeryLongStrongPassword123!@#$%^&*()');
      expect(strength.score).toBeLessThanOrEqual(5);
    });

    it('should calculate percentage (0-100)', () => {
      const strength = calculatePasswordStrength('StrongPass123!');
      expect(strength.percentage).toBeGreaterThan(0);
      expect(strength.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Password Validation', () => {
    it('should reject password with less than 8 characters', () => {
      const result = validatePassword('Short1!');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/8 characters/i);
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('lowercase123!');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/uppercase/i);
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('UPPERCASE123!');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/lowercase/i);
    });

    it('should reject password without number', () => {
      const result = validatePassword('Password!@#');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/number/i);
    });

    it('should reject password without special character', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/special/i);
    });

    it('should accept strong password', () => {
      const result = validatePassword('StrongPass123!@#');
      expect(result.valid).toBe(true);
    });

    it('should provide error messages for each requirement', () => {
      const result = validatePassword('weak');
      expect(result.message).toBeTruthy();
      expect(result.valid).toBe(false);
    });
  });

  describe('PIN Validation', () => {
    it('should accept 6-digit PIN', () => {
      const result = validatePIN('123456');
      expect(result.valid).toBe(true);
    });

    it('should accept 4-digit PIN', () => {
      const result = validatePIN('1234');
      expect(result.valid).toBe(true);
    });

    it('should accept 8-digit PIN', () => {
      const result = validatePIN('12345678');
      expect(result.valid).toBe(true);
    });

    it('should reject PIN with less than 4 digits', () => {
      const result = validatePIN('123');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/4-8 digits/i);
    });

    it('should reject PIN with more than 8 digits', () => {
      const result = validatePIN('123456789');
      expect(result.valid).toBe(false);
    });

    it('should reject PIN with non-numeric characters', () => {
      const result = validatePIN('12345a');
      expect(result.valid).toBe(false);
    });

    it('should reject PIN with repeating digits (1111)', () => {
      const result = validatePIN('111123');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/repeating/i);
    });

    it('should reject PIN with sequential patterns (1234)', () => {
      const result = validatePIN('123456');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/sequential/i);
    });

    it('should warn for common weak PINs', () => {
      const result = validatePIN('111111');
      expect(result.severity).toBe('warning');
    });

    it('should reject empty PIN', () => {
      const result = validatePIN('');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/required/i);
    });
  });

  describe('Mnemonic Validation', () => {
    it('should accept 12-word mnemonic', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should accept 24-word mnemonic', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should reject mnemonic with wrong word count', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/12 or 24/i);
    });

    it('should reject mnemonic with invalid words', () => {
      const mnemonic = 'invalid notaword fakeword one two three four five six seven eight';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/invalid/i);
    });

    it('should reject empty mnemonic', () => {
      const result = validateMnemonic('');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/required/i);
    });

    it('should normalize to lowercase for validation', () => {
      const mnemonic = 'ABANDON ABOUT ABOVE ABSENT ABSORB ABSTRACT ABUSE ACCESS ACCIDENT ACCOUNT ACCUSE ACHIEVE';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should handle extra whitespace', () => {
      const mnemonic = 'abandon  about   above  absent absorb abstract abuse access accident account accuse achieve';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should detect test mnemonic', () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const result = validateMnemonic(testMnemonic);
      expect(result.severity).toBe('warning');
    });

    it('should report word count in result', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
      expect(result.message).toMatch(/12-word/i);
    });

    it('should reject words with special characters', () => {
      const mnemonic = 'abandon@ about# above$ absent% absorb^ abstract& abuse* access! accident( account) accuse+';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(false);
    });

    it('should reject words that are too short/long', () => {
      const mnemonic = 'a ab absolute abstinence abusiveness accidental accountabilities accusation';
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(false);
    });
  });

  describe('Address Validation', () => {
    it('should accept a valid Mallchain (bech32) address', () => {
      const result = validateAddress('mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg');
      expect(result.valid).toBe(true);
    });

    it('should reject an address without the mall1 prefix', () => {
      const result = validateAddress('cosmos1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg');
      expect(result.valid).toBe(false);
    });

    it('should reject an address that is too short', () => {
      const result = validateAddress('mall1short');
      expect(result.valid).toBe(false);
    });

    it('should reject an address with uppercase characters', () => {
      const result = validateAddress('mall1P9F39UYLKJV956XELTKDTSEL5Y6XU36XH2M6QG');
      expect(result.valid).toBe(false);
    });

    it('should reject an Ethereum-style address', () => {
      const result = validateAddress('0x5aAeb6053ba3F0Fb6671C7a1957ba39D2eFf7e3d');
      expect(result.valid).toBe(false);
    });

    it('should reject empty address', () => {
      const result = validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/required/i);
    });
  });

  describe('Error Messages', () => {
    it('should provide specific error message for email format', () => {
      const result = validateEmail('invalid');
      expect(result.message).toMatch(/format|invalid/i);
    });

    it('should provide specific error message for password requirements', () => {
      const result = validatePassword('weak');
      expect(result.message).toBeTruthy();
    });

    it('should provide specific error message for PIN format', () => {
      const result = validatePIN('12');
      expect(result.message).toMatch(/4-8 digits/i);
    });

    it('should provide specific error message for mnemonic word count', () => {
      const result = validateMnemonic('abandon about');
      expect(result.message).toMatch(/12 or 24/i);
    });

    it('should provide specific error message for address format', () => {
      const result = validateAddress('invalid');
      expect(result.message).toMatch(/format|invalid/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long email', () => {
      const longEmail = 'a'.repeat(65) + '@example.com';
      const result = validateEmail(longEmail);
      expect(result.valid).toBe(false);
    });

    it('should handle very long password', () => {
      const longPass = 'StrongPass123!' + 'a'.repeat(100);
      const result = validatePassword(longPass);
      expect(result.valid).toBe(true);
    });

    it('should handle unicode characters in email', () => {
      const result = validateEmail('user@例え.jp');
      expect(result.valid).toBe(false); // Should reject non-ASCII
    });

    it('should handle special characters in PIN', () => {
      const result = validatePIN('!@#$%^');
      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-only input', () => {
      const result1 = validateEmail('   ');
      const result2 = validatePassword('   ');
      const result3 = validatePIN('   ');
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result3.valid).toBe(false);
    });

    it('should handle null/undefined gracefully', () => {
      const result1 = validateEmail(null as any);
      const result2 = validatePassword(undefined as any);
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });
  });
});
