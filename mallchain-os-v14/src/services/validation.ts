/**
 * Phase 1, Section 4: Form Validation & Error Handling
 * 
 * Comprehensive validation service for wallet forms including:
 * - Task 4.1: Email/password/PIN validators
 * - Task 4.2: Real-time email format validation
 * - Task 4.3: Real-time password strength calculation
 * - Task 4.4: PIN validation (4-8 digits, no sequences)
 * - Task 4.5: Mnemonic validation (12 words, dictionary check)
 * - Task 4.6: Address validation for wallet imports
 * - Task 4.7: Inline error messages
 * - Task 4.8: Toast notifications for errors
 * - Task 4.9: Error-specific messages
 * - Task 4.10: Edge case handling
 */

import { wordlists } from 'bip39';
import { toast } from '../components/ui';
import { handleNetworkError } from './errorHandler';
import type { ErrorContext } from './errorHandler';

/* ============== TYPES ============== */

export interface ValidationResult {
  valid: boolean;
  message?: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface PasswordStrength {
  score: number; // 0-5
  level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
  feedback: string[];
  percentage: number; // 0-100
}

export interface AddressValidation extends ValidationResult {
  isChecksum?: boolean;
  isLowercase?: boolean;
}

/* ============== COMMON PATTERNS ============== */

// Task 4.1: Email pattern - RFC 5322 simplified
// ASCII-only local part and domain (matches the rest of this validator's
// checks below, e.g. dot/length rules) — rejects unicode/IDN addresses like
// "tëst@example.com" or "user@例え.jp" rather than silently accepting input
// this app's other layers don't handle.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z0-9-]+$/;

// Task 4.1: Strong password pattern components
const PASSWORD_UPPERCASE = /[A-Z]/;
const PASSWORD_LOWERCASE = /[a-z]/;
const PASSWORD_NUMBER = /\d/;
const PASSWORD_SYMBOL = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

// Task 4.4: PIN pattern - 4-8 digits
const PIN_PATTERN = /^\d{4,8}$/;

// Task 4.6: Mallchain address pattern — bech32 with the "mall" HRP, matching the
// backend's validator (backend/src/routes/send.js addressParamSchema).
const MALL_ADDRESS_PATTERN = /^mall1[a-z0-9]{38,58}$/;

/* ============== SIMPLE WORD DICTIONARY (Task 4.5) ============== */

// The real BIP39 English word list (2048 words), from the same `bip39` package
// wallet.ts uses for mnemonic generation/derivation. This used to be a hand-rolled
// ~200-word subset that cut off alphabetically around "ann-" and was full of
// corrupted repeated entries — it rejected the vast majority of valid, real
// BIP39 recovery phrases (e.g. official BIP39 test vectors). See validation.test.ts.
const COMMON_ENGLISH_WORDS = new Set(wordlists.english);

/* ============== EMAIL VALIDATION (Task 4.2) ============== */

/**
 * Task 4.2: Real-time email format validation
 * Checks basic format, domain structure, and common issues
 */
export function validateEmail(email: string): ValidationResult {
  // Handle empty/whitespace
  if (!email || !email.trim()) {
    return {
      valid: false,
      message: 'Email address is required',
      severity: 'error',
    };
  }

  const trimmed = email.trim();

  // Check for leading/trailing whitespace
  if (trimmed !== email) {
    return {
      valid: false,
      message: 'Email cannot contain leading or trailing spaces',
      severity: 'error',
    };
  }

  // Check basic format
  if (!EMAIL_PATTERN.test(trimmed)) {
    return {
      valid: false,
      message: 'Email format is invalid (must be: user@domain.com)',
      severity: 'error',
    };
  }

  const [localPart, domain] = trimmed.split('@');

  // Check local part length (max 64 chars per RFC)
  if (localPart.length > 64) {
    return {
      valid: false,
      message: 'Email local part is too long (max 64 characters)',
      severity: 'error',
    };
  }

  // Check for consecutive dots
  if (trimmed.includes('..')) {
    return {
      valid: false,
      message: 'Email cannot contain consecutive dots',
      severity: 'error',
    };
  }

  // Check for invalid starting/ending characters
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return {
      valid: false,
      message: 'Email local part cannot start or end with a dot',
      severity: 'error',
    };
  }

  // Check domain has at least 2 parts
  const domainParts = domain.split('.');
  if (domainParts.length < 2) {
    return {
      valid: false,
      message: 'Email domain must have at least one dot',
      severity: 'error',
    };
  }

  // Check TLD length
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || tld.length > 6) {
    return {
      valid: false,
      message: 'Email TLD must be 2-6 characters',
      severity: 'error',
    };
  }

  // Check for common disposable email domains (warning only)
  const disposableDomains = ['tempmail', 'throwaway', '10minutemail', 'guerrillamail'];
  if (disposableDomains.some(d => domain.toLowerCase().includes(d))) {
    return {
      valid: true,
      message: 'This appears to be a temporary email address',
      severity: 'warning',
    };
  }

  return {
    valid: true,
    message: 'Email format is valid',
    severity: 'info',
  };
}

/**
 * Task 4.9: Validate email uniqueness via API (optional)
 * Returns error if email already exists
 */
export async function validateEmailUniqueness(email: string): Promise<ValidationResult> {
  try {
    const response = await fetch('/api/auth/email-exists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { exists: boolean };

    if (data.exists) {
      return {
        valid: false,
        message: 'Email address is already registered',
        severity: 'error',
      };
    }

    return { valid: true, severity: 'info' };
  } catch (error) {
    // Treat network errors gracefully - don't block submission
    console.warn('[Validation] Email uniqueness check failed:', (error as Error).message);
    return { valid: true, severity: 'warning', message: 'Could not verify email uniqueness' };
  }
}

/* ============== PASSWORD VALIDATION (Task 4.3) ============== */

/**
 * Task 4.3: Real-time password strength calculation
 * Returns score 0-5 and user-friendly feedback
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return {
      score: 0,
      level: 'very-weak',
      feedback: ['Password is required'],
      percentage: 0,
    };
  }

  // Length scoring
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters');
  } else {
    score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 0.5;
  }

  // Uppercase scoring
  if (!PASSWORD_UPPERCASE.test(password)) {
    feedback.push('Password must contain an uppercase letter');
  } else {
    score += 0.75;
  }

  // Lowercase scoring
  if (!PASSWORD_LOWERCASE.test(password)) {
    feedback.push('Password must contain a lowercase letter');
  } else {
    score += 0.75;
  }

  // Number scoring
  if (!PASSWORD_NUMBER.test(password)) {
    feedback.push('Password must contain a number');
  } else {
    score += 0.75;
  }

  // Symbol scoring
  if (!PASSWORD_SYMBOL.test(password)) {
    feedback.push('Password must contain a special character (!@#$%^&*)');
  } else {
    score += 0.75;
  }

  // No repeating characters (e.g., aaaa, 1111)
  if (/(.)\1{2,}/.test(password)) {
    feedback.push('Password should not contain repeating characters');
    score -= 0.5;
  }

  // Common patterns (sequential like abcd, 1234)
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|123|234|345|456|567|678|789)/i.test(password)) {
    feedback.push('Password should not contain sequential patterns');
    score -= 0.5;
  }

  // Cap score at 5
  score = Math.min(5, Math.max(0, score));

  // Determine level
  let level: PasswordStrength['level'];
  if (score < 1) level = 'very-weak';
  else if (score < 1.75) level = 'weak';
  else if (score < 2.75) level = 'fair';
  else if (score < 3.75) level = 'good';
  else if (score < 4.75) level = 'strong';
  else level = 'very-strong';

  return {
    score: Math.round(score),
    level,
    feedback,
    percentage: Math.round((score / 5) * 100),
  };
}

/**
 * Task 4.1: Validate password meets minimum requirements
 */
export function validatePassword(password: string): ValidationResult {
  const strength = calculatePasswordStrength(password);

  if (!password) {
    return {
      valid: false,
      message: 'Password is required',
      severity: 'error',
    };
  }

  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long',
      severity: 'error',
    };
  }

  if (!PASSWORD_UPPERCASE.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter',
      severity: 'error',
    };
  }

  if (!PASSWORD_LOWERCASE.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter',
      severity: 'error',
    };
  }

  if (!PASSWORD_NUMBER.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
      severity: 'error',
    };
  }

  if (!PASSWORD_SYMBOL.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one special character (!@#$%^&*)',
      severity: 'error',
    };
  }

  // Reject very weak passwords even if they meet minimum
  if (strength.level === 'very-weak' || strength.level === 'weak') {
    return {
      valid: false,
      message: 'Password is too weak. ' + strength.feedback.join(', '),
      severity: 'error',
    };
  }

  return {
    valid: true,
    message: `Password strength: ${strength.level.replace('-', ' ')}`,
    severity: 'info',
  };
}


/* ============== PIN VALIDATION (Task 4.4) ============== */

/**
 * Task 4.4: PIN validation (4-8 digits, no sequences)
 * Rejects repeating sequences (1111) and sequential patterns (1234)
 */
export function validatePIN(pin: string): ValidationResult {
  // Handle empty/whitespace
  if (!pin || !pin.trim()) {
    return {
      valid: false,
      message: 'PIN is required',
      severity: 'error',
    };
  }

  const trimmed = pin.trim();

  // Check basic format
  if (!PIN_PATTERN.test(trimmed)) {
    return {
      valid: false,
      message: 'PIN must be 4-8 digits',
      severity: 'error',
    };
  }

  // Check for repeating digits (1111, 2222, etc.)
  if (/(.)\1{3,}/.test(trimmed)) {
    return {
      valid: false,
      message: 'PIN cannot contain repeating digits (e.g., 1111)',
      severity: 'error',
    };
  }

  // Check for sequential patterns (1234, 5678, etc.)
  if (/(?:0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/.test(trimmed)) {
    return {
      valid: false,
      message: 'PIN cannot contain sequential patterns (e.g., 1234)',
      severity: 'error',
    };
  }

  // Check for common weak patterns
  const commonPINs = ['1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '0000', '1212', '1010'];
  if (commonPINs.includes(trimmed)) {
    return {
      valid: true,
      message: 'PIN is very common and easily guessable',
      severity: 'warning',
    };
  }

  return {
    valid: true,
    message: 'PIN format is valid',
    severity: 'info',
  };
}

/* ============== MNEMONIC VALIDATION (Task 4.5) ============== */

/**
 * Task 4.5: Mnemonic validation (12 words, dictionary check)
 * Validates BIP39 mnemonic phrase structure
 */
export function validateMnemonic(mnemonic: string): ValidationResult {
  // Handle empty/whitespace
  if (!mnemonic || !mnemonic.trim()) {
    return {
      valid: false,
      message: 'Mnemonic phrase is required',
      severity: 'error',
    };
  }

  const trimmed = mnemonic.trim();

  // Split into words and normalize
  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  // Check word count (standard is 12 or 24)
  if (words.length !== 12 && words.length !== 24) {
    return {
      valid: false,
      message: `Mnemonic must contain exactly 12 or 24 words (got ${words.length})`,
      severity: 'error',
    };
  }

  // Check each word is in dictionary
  const invalidWords: string[] = [];
  for (const word of words) {
    // Check for valid characters (letters only)
    if (!/^[a-z]+$/.test(word)) {
      invalidWords.push(word);
      continue;
    }

    // Check word length (valid BIP39 words are 3-8 chars)
    if (word.length < 3 || word.length > 8) {
      invalidWords.push(word);
      continue;
    }

    // Check if word exists in dictionary
    if (!COMMON_ENGLISH_WORDS.has(word)) {
      invalidWords.push(word);
    }
  }

  if (invalidWords.length > 0) {
    return {
      valid: false,
      message: `Invalid words in mnemonic: ${invalidWords.slice(0, 3).join(', ')}${invalidWords.length > 3 ? '...' : ''}`,
      severity: 'error',
    };
  }

  // Warn about common test mnemonics
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  if (trimmed === testMnemonic) {
    return {
      valid: true,
      message: 'This is a test mnemonic phrase (commonly known)',
      severity: 'warning',
    };
  }

  return {
    valid: true,
    message: `Valid ${words.length}-word mnemonic phrase`,
    severity: 'info',
  };
}

/* ============== ADDRESS VALIDATION (Task 4.6) ============== */

/**
 * Task 4.6: Address validation for wallet imports/sends.
 * Validates Mallchain bech32 addresses (HRP "mall"), matching the backend's
 * validator (backend/src/routes/send.js addressParamSchema / mallcoinService.isValidAddress).
 */
export function validateAddress(address: string): AddressValidation {
  // Handle empty/whitespace
  if (!address || !address.trim()) {
    return {
      valid: false,
      message: 'Wallet address is required',
      severity: 'error',
    };
  }

  const trimmed = address.trim();

  if (!MALL_ADDRESS_PATTERN.test(trimmed)) {
    return {
      valid: false,
      message: 'Invalid address format. Must start with "mall1" followed by 38-58 lowercase letters/digits',
      severity: 'error',
    };
  }

  return {
    valid: true,
    message: 'Valid wallet address',
    severity: 'info',
  };
}

/* ============== VALIDATION STATE MANAGEMENT ============== */

/**
 * Form field error state for inline display (Task 4.7)
 */
export interface FieldError {
  fieldName: string;
  message: string;
  severity: 'error' | 'warning';
  showInline: boolean;
}

/**
 * Manage form field validation errors
 */
export class FormValidator {
  private errors = new Map<string, FieldError>();

  /**
   * Set error for a field
   */
  setError(fieldName: string, result: ValidationResult, showInline = true): void {
    if (result.valid) {
      this.errors.delete(fieldName);
    } else {
      const severity = result.severity === 'error' || result.severity === 'warning' ? result.severity : 'error';
      this.errors.set(fieldName, {
        fieldName,
        message: result.message || 'Invalid input',
        severity,
        showInline,
      });
    }
  }

  /**
   * Get error for a field
   */
  getError(fieldName: string): FieldError | undefined {
    return this.errors.get(fieldName);
  }

  /**
   * Check if field has error
   */
  hasError(fieldName: string): boolean {
    return this.errors.has(fieldName);
  }

  /**
   * Get all errors
   */
  getAllErrors(): FieldError[] {
    return Array.from(this.errors.values());
  }

  /**
   * Get error message for field or empty string
   */
  getErrorMessage(fieldName: string): string {
    return this.errors.get(fieldName)?.message || '';
  }

  /**
   * Clear error for a field
   */
  clearError(fieldName: string): void {
    this.errors.delete(fieldName);
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.errors.clear();
  }

  /**
   * Check if form is valid (no errors)
   */
  isValid(): boolean {
    return this.errors.size === 0;
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.size;
  }
}

/* ============== ERROR NOTIFICATION (Task 4.8, 4.9) ============== */

/**
 * Task 4.8: Toast notifications for validation errors
 * Task 4.9: Error-specific messages
 */
export function showValidationError(fieldName: string, result: ValidationResult): void {
  if (result.valid) return;

  // Log for debugging
  console.warn(`[Validation Error] ${fieldName}:`, result.message);

  // Show toast notification
  const severity = result.severity || 'error';
  const icon = severity === 'error' ? '✕' : severity === 'warning' ? '⚠' : 'ℹ';
  const prefix = `${icon} ${fieldName}: `;

  toast(prefix + (result.message || 'Invalid input'), severity === 'error');
}

/**
 * Show network error during validation
 */
export function showValidationNetworkError(fieldName: string, error: Error): void {
  const context: ErrorContext = {
    action: `validating ${fieldName}`,
    endpoint: '/api/validation',
    originalError: error,
  };

  handleNetworkError(error, context);
}

/**
 * Show multiple validation errors at once
 */
export function showMultipleValidationErrors(errors: FieldError[]): void {
  if (errors.length === 0) return;

  // Show up to 3 errors as toasts
  errors.slice(0, 3).forEach(error => {
    const icon = error.severity === 'error' ? '✕' : '⚠';
    toast(`${icon} ${error.fieldName}: ${error.message}`, error.severity === 'error');
  });

  // If more than 3 errors, show summary
  if (errors.length > 3) {
    toast(`${errors.length - 3} more validation errors`, false);
  }
}

/* ============== BATCH VALIDATION (Task 4.10) ============== */

/**
 * Validate multiple fields at once
 */
export function validateFields(fields: {
  email?: string;
  password?: string;
  pin?: string;
  mnemonic?: string;
  address?: string;
}): Record<string, ValidationResult> {
  const results: Record<string, ValidationResult> = {};

  if (fields.email !== undefined) {
    results.email = validateEmail(fields.email);
  }

  if (fields.password !== undefined) {
    results.password = validatePassword(fields.password);
  }

  if (fields.pin !== undefined) {
    results.pin = validatePIN(fields.pin);
  }

  if (fields.mnemonic !== undefined) {
    results.mnemonic = validateMnemonic(fields.mnemonic);
  }

  if (fields.address !== undefined) {
    results.address = validateAddress(fields.address);
  }

  return results;
}

/**
 * Get strength indicator for display (0-5 stars)
 */
export function getStrengthStars(strength: PasswordStrength): string {
  const filled = Math.round(strength.score);
  const empty = 5 - filled;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}

/**
 * Get strength color for UI display
 */
export function getStrengthColor(strength: PasswordStrength): string {
  switch (strength.level) {
    case 'very-weak':
    case 'weak':
      return '#dc2626'; // Red
    case 'fair':
      return '#f97316'; // Orange
    case 'good':
      return '#eab308'; // Yellow
    case 'strong':
    case 'very-strong':
      return '#16a34a'; // Green
    default:
      return '#6b7280'; // Gray
  }
}

export default {
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  validatePIN,
  validateMnemonic,
  validateAddress,
  validateFields,
  FormValidator,
  showValidationError,
  showValidationNetworkError,
  showMultipleValidationErrors,
  getStrengthStars,
  getStrengthColor,
};
