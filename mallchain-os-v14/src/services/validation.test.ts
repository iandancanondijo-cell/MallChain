/**
 * Test Suite: Form Validation & Error Handling
 * 
 * Tests for all 10 tasks:
 * - Task 4.1: Validators coverage
 * - Task 4.2: Email format validation with edge cases
 * - Task 4.3: Password strength calculation
 * - Task 4.4: PIN validation with sequence rejection
 * - Task 4.5: Mnemonic validation with dictionary check
 * - Task 4.6: Address validation with checksum
 * - Task 4.7: Inline error message generation
 * - Task 4.8: Toast notification triggers
 * - Task 4.9: Error-specific messages
 * - Task 4.10: Edge cases and complex scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  validatePIN,
  validateMnemonic,
  validateAddress,
  validateFields,
  FormValidator,
  showValidationError,
  getStrengthStars,
  getStrengthColor,
  validateEmailUniqueness,
  type ValidationResult,
  type PasswordStrength,
} from './validation';

// Mock toast and errorHandler
vi.mock('../components/ui', () => ({
  toast: vi.fn(),
}));

vi.mock('./errorHandler', () => ({
  handleNetworkError: vi.fn(),
}));

describe('Task 4.1 & 4.2: Email Validation', () => {
  describe('Basic format validation', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'john.doe@company.co.uk',
        'first+tag@domain.org',
        'test_email@sub.domain.com',
      ];

      validEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        'missing@domain',
        '@nodomain.com',
        'user@',
        'user @domain.com',
        'user@ domain.com',
      ];

      invalidEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.valid).toBe(false);
        expect(result.message).toBeTruthy();
      });
    });
  });

  describe('Task 4.10: Email edge cases', () => {
    it('should reject empty email', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject whitespace-only email', () => {
      const result = validateEmail('   ');
      expect(result.valid).toBe(false);
    });

    it('should reject email with leading/trailing spaces', () => {
      const result = validateEmail(' user@domain.com ');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('spaces');
    });

    it('should reject email with consecutive dots', () => {
      const result = validateEmail('user..name@domain.com');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('consecutive');
    });

    it('should reject email starting with dot', () => {
      const result = validateEmail('.user@domain.com');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('start or end');
    });

    it('should reject email with very long local part', () => {
      const longLocal = 'a'.repeat(65) + '@domain.com';
      const result = validateEmail(longLocal);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('local part');
    });

    it('should reject email with invalid TLD length', () => {
      const result1 = validateEmail('user@domain.c');
      expect(result1.valid).toBe(false);

      const result2 = validateEmail('user@domain.verylongtld');
      expect(result2.valid).toBe(false);
    });

    it('should warn on disposable email domains', () => {
      const result = validateEmail('user@tempmail.com');
      expect(result.valid).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.message).toContain('temporary');
    });
  });

  describe('Task 4.9: Email uniqueness check', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return error if email exists', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true }),
      });

      const result = await validateEmailUniqueness('taken@example.com');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('already registered');
    });

    it('should return valid if email is unique', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: false }),
      });

      const result = await validateEmailUniqueness('new@example.com');
      expect(result.valid).toBe(true);
    });
  });
});

describe('Task 4.3: Password Strength & Validation', () => {
  describe('Strength calculation', () => {
    it('should calculate strength for strong passwords', () => {
      const strength = calculatePasswordStrength('SecureP@ss123');
      expect(strength.score).toBeGreaterThan(3);
      expect(strength.level).toMatch(/good|strong|very-strong/);
      expect(strength.percentage).toBeGreaterThan(60);
    });

    it('should identify very weak passwords', () => {
      const strength = calculatePasswordStrength('weak');
      expect(strength.score).toBeLessThan(2);
      expect(strength.level).toMatch(/very-weak|weak/);
    });

    it('should include feedback for improvements', () => {
      const strength = calculatePasswordStrength('password');
      expect(strength.feedback.length).toBeGreaterThan(0);
      expect(strength.feedback[0]).toBeTruthy();
    });
  });

  describe('Task 4.10: Password validation edge cases', () => {
    it('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject password shorter than 8 chars', () => {
      const result = validatePassword('Short1!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('8 characters');
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    it('should reject password without number', () => {
      const result = validatePassword('Password!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('number');
    });

    it('should reject password without symbol', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('special character');
    });

    it('should reject password with repeating characters', () => {
      const strength = calculatePasswordStrength('Passssword123!');
      expect(strength.feedback.some(f => f.includes('repeating'))).toBe(true);
    });

    it('should reject password with sequential patterns', () => {
      const strength = calculatePasswordStrength('Abc1234def!');
      expect(strength.feedback.some(f => f.includes('sequential'))).toBe(true);
    });

    it('should accept valid strong passwords', () => {
      const validPasswords = [
        'MySecurePass1!',
        'Tr0pic@lThund3r',
        'PhoenixRising2024!',
        'C0mpl3x#Password',
      ];

      validPasswords.forEach(pass => {
        const result = validatePassword(pass);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Strength stars and colors', () => {
    it('should generate appropriate stars', () => {
      const weak = calculatePasswordStrength('weak');
      const strong = calculatePasswordStrength('VeryStrong1234!');

      expect(getStrengthStars(weak).match(/★/g)?.length || 0).toBeLessThan(
        getStrengthStars(strong).match(/★/g)?.length || 0
      );
    });

    it('should return appropriate colors', () => {
      const veryWeak = calculatePasswordStrength('');
      const strong = calculatePasswordStrength('VeryStrong1234!');

      expect(getStrengthColor(veryWeak)).toContain('#');
      expect(getStrengthColor(strong)).toContain('#');
    });
  });
});

describe('Task 4.4: PIN Validation', () => {
  it('should accept valid PINs', () => {
    // Not '1234'/'12345'/etc — those are rejected below as sequential patterns.
    const validPINs = ['1357', '13579', '135792', '1357924', '13579246'];
    validPINs.forEach(pin => {
      const result = validatePIN(pin);
      expect(result.valid).toBe(true);
    });
  });

  it('should reject PIN with non-digits', () => {
    const result = validatePIN('12a4');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('digits');
  });

  it('should reject PIN with less than 4 digits', () => {
    const result = validatePIN('123');
    expect(result.valid).toBe(false);
  });

  it('should reject PIN with more than 8 digits', () => {
    const result = validatePIN('123456789');
    expect(result.valid).toBe(false);
  });

  describe('Task 4.10: PIN edge cases', () => {
    it('should reject repeating digit patterns (1111)', () => {
      const result = validatePIN('1111');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('repeating');
    });

    it('should reject sequential patterns (1234)', () => {
      const result = validatePIN('1234');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('sequential');
    });

    it('should reject other sequential patterns', () => {
      const sequences = ['2345', '3456', '4567', '5678', '6789'];
      sequences.forEach(seq => {
        const result = validatePIN(seq);
        expect(result.valid).toBe(false);
      });
    });

    it('should reject reverse sequences', () => {
      const result = validatePIN('4321');
      expect(result.valid).toBe(false);
    });

    it('should warn on common weak PINs', () => {
      const result = validatePIN('1212');
      expect(result.severity).toBe('warning');
    });

    it('should reject empty PIN', () => {
      const result = validatePIN('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });
  });
});

describe('Task 4.5: Mnemonic Validation', () => {
  it('should accept valid 12-word mnemonic', () => {
    const validMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    const result = validateMnemonic(validMnemonic);
    expect(result.valid).toBe(true);
  });

  it('should accept valid 24-word mnemonic', () => {
    // Official BIP39 test vector (24 words) — the previous fixture here had 26
    // words (a copy-paste duplication bug), which word-count validation rejects.
    const validMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank year ' +
                          'wave sausage worth useful legal winner thank year wave sausage worth title';
    const result = validateMnemonic(validMnemonic);
    expect(result.valid).toBe(true);
  });

  describe('Task 4.10: Mnemonic edge cases', () => {
    it('should reject wrong word count', () => {
      const result = validateMnemonic('legal winner thank year wave sausage worth useful legal winner thank');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('exactly 12 or 24');
    });

    it('should reject invalid words', () => {
      const result = validateMnemonic('notaword winner thank year wave sausage worth useful legal winner thank year');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    it('should reject words with non-letter characters', () => {
      const result = validateMnemonic('legal123 winner thank year wave sausage worth useful legal winner thank year');
      expect(result.valid).toBe(false);
    });

    it('should be case-insensitive', () => {
      const result = validateMnemonic('LEGAL WINNER THANK YEAR WAVE SAUSAGE WORTH USEFUL LEGAL WINNER THANK YELLOW');
      expect(result.valid).toBe(true);
    });

    it('should handle extra whitespace', () => {
      const result = validateMnemonic('  legal  winner  thank  year  wave  sausage  worth  useful  legal  winner  thank  yellow  ');
      expect(result.valid).toBe(true);
    });

    it('should warn on test mnemonic', () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const result = validateMnemonic(testMnemonic);
      expect(result.severity).toBe('warning');
    });

    it('should reject empty mnemonic', () => {
      const result = validateMnemonic('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });
  });
});

describe('Task 4.6: Address Validation', () => {
  it('should accept a valid mall1 bech32 address', () => {
    const result = validateAddress('mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg');
    expect(result.valid).toBe(true);
  });

  it('should accept another valid mall1 bech32 address', () => {
    const result = validateAddress('mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6');
    expect(result.valid).toBe(true);
  });

  describe('Task 4.10: Address edge cases', () => {
    it('should reject address without the mall1 prefix', () => {
      const result = validateAddress('p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg');
      expect(result.valid).toBe(false);
    });

    it('should reject address that is too short', () => {
      const result = validateAddress('mall1short');
      expect(result.valid).toBe(false);
    });

    it('should reject address with invalid (uppercase) characters', () => {
      const result = validateAddress('mall1P9F39UYLKJV956XELTKDTSEL5Y6XU36XH2M6QG');
      expect(result.valid).toBe(false);
    });

    it('should reject empty address', () => {
      const result = validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject an Ethereum-style address', () => {
      const result = validateAddress('0x5aAeb6053ba3eF8C9Bc9a8b328f5d6250b6cB1e6');
      expect(result.valid).toBe(false);
    });
  });
});

describe('Task 4.7 & 4.10: FormValidator & Inline Errors', () => {
  let validator: FormValidator;

  beforeEach(() => {
    validator = new FormValidator();
  });

  it('should track field errors', () => {
    const result: ValidationResult = { valid: false, message: 'Invalid email', severity: 'error' };
    validator.setError('email', result);

    expect(validator.hasError('email')).toBe(true);
    expect(validator.getErrorMessage('email')).toContain('Invalid');
  });

  it('should clear individual errors', () => {
    const result: ValidationResult = { valid: false, message: 'Error', severity: 'error' };
    validator.setError('email', result);
    validator.clearError('email');

    expect(validator.hasError('email')).toBe(false);
  });

  it('should clear all errors', () => {
    validator.setError('email', { valid: false, message: 'E1', severity: 'error' });
    validator.setError('password', { valid: false, message: 'E2', severity: 'error' });
    validator.clearAllErrors();

    expect(validator.getErrorCount()).toBe(0);
  });

  it('should track form validity', () => {
    expect(validator.isValid()).toBe(true);

    validator.setError('email', { valid: false, message: 'Error', severity: 'error' });
    expect(validator.isValid()).toBe(false);

    validator.clearError('email');
    expect(validator.isValid()).toBe(true);
  });

  it('should get all errors', () => {
    validator.setError('email', { valid: false, message: 'E1', severity: 'error' });
    validator.setError('password', { valid: false, message: 'E2', severity: 'error' });

    const all = validator.getAllErrors();
    expect(all.length).toBe(2);
    expect(all[0].fieldName).toBe('email');
  });

  it('should remove error on valid result', () => {
    validator.setError('email', { valid: false, message: 'Error', severity: 'error' });
    validator.setError('email', { valid: true, severity: 'info' });

    expect(validator.hasError('email')).toBe(false);
  });
});

describe('Task 4.9: Error-Specific Messages', () => {
  it('should provide specific messages for each validator', () => {
    const testCases = [
      { fn: () => validateEmail('invalid'), expectedContent: 'format' },
      { fn: () => validatePassword('weak'), expectedContent: 'characters long' },
      { fn: () => validatePIN('123'), expectedContent: '4-8' },
      { fn: () => validateMnemonic('one two three'), expectedContent: '12 or 24' },
      { fn: () => validateAddress('invalid'), expectedContent: 'format' },
    ];

    testCases.forEach(({ fn, expectedContent }) => {
      const result = fn();
      expect(result.message?.toLowerCase()).toContain(expectedContent.toLowerCase());
    });
  });
});

describe('Task 4.10: Batch Validation', () => {
  it('should validate multiple fields', () => {
    const results = validateFields({
      email: 'test@example.com',
      password: 'ValidPass123!',
      pin: '1357',
    });

    expect(results.email.valid).toBe(true);
    expect(results.password.valid).toBe(true);
    expect(results.pin.valid).toBe(true);
  });

  it('should handle partial field validation', () => {
    const results = validateFields({
      email: 'invalid',
      password: 'VeryStrong1234!',
    });

    expect(results.email.valid).toBe(false);
    expect(results.password.valid).toBe(true);
    expect(results.pin).toBeUndefined();
  });

  it('should catch multiple errors', () => {
    const results = validateFields({
      email: '',
      password: 'weak',
      pin: '12',
      mnemonic: 'invalid',
      address: 'notanaddress',
    });

    expect(results.email.valid).toBe(false);
    expect(results.password.valid).toBe(false);
    expect(results.pin.valid).toBe(false);
    expect(results.mnemonic.valid).toBe(false);
    expect(results.address.valid).toBe(false);
  });
});

describe('Task 4.10: Complex Edge Cases', () => {
  it('should handle very long inputs gracefully', () => {
    const longString = 'a'.repeat(1000);
    const emailResult = validateEmail(longString + '@example.com');
    const passwordResult = validatePassword(longString);

    expect(emailResult.valid).toBe(false);
    expect(passwordResult.valid).toBe(false);
  });

  it('should handle special unicode characters', () => {
    const result = validateEmail('tëst@example.com');
    expect(result.valid).toBe(false);
  });

  it('should handle null/undefined gracefully', () => {
    // These tests check the function handles edge cases
    const emailResult = validateEmail('');
    expect(emailResult.valid).toBe(false);
  });

  it('should validate complex password combinations', () => {
    const complexPasswords = [
      'P@ssw0rd!Secure',
      '9Gsx&kL#mN2xQ',
      'Tr0pical!Thunder$2024',
    ];

    complexPasswords.forEach(pass => {
      const result = validatePassword(pass);
      expect(result.valid).toBe(true);
    });
  });
});
