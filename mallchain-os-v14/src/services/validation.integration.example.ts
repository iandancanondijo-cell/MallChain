/**
 * Integration Examples: Form Validation & Error Handling
 * 
 * This file demonstrates how to use the validation service (validation.ts)
 * in React components with real-time validation, inline errors, and toasts.
 * 
 * Based on all 10 tasks from Phase 1, Section 4
 */

import {
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  validatePIN,
  validateMnemonic,
  validateAddress,
  validateFields,
  validateEmailUniqueness,
  FormValidator,
  showValidationError,
  showMultipleValidationErrors,
  getStrengthStars,
  getStrengthColor,
  type ValidationResult,
  type PasswordStrength,
} from './validation';

/* ============================================
   EXAMPLE 1: Real-time Email Validation
   (Task 4.2: Real-time email format validation)
============================================ */

export class EmailFieldController {
  private lastValidEmail: string | null = null;

  /**
   * Called on input change (debounced in React)
   */
  onEmailChange(email: string): { 
    valid: boolean; 
    message: string; 
    isChecking?: boolean;
  } {
    // Validate format first (Task 4.2)
    const formatResult = validateEmail(email);

    if (!formatResult.valid) {
      return {
        valid: false,
        message: formatResult.message || 'Invalid email',
      };
    }

    // If format is good, optionally check uniqueness via API (Task 4.9)
    // This should be done with debouncing in real component
    return {
      valid: true,
      message: formatResult.message || 'Email looks good',
      isChecking: true, // Indicate API call in progress
    };
  }

  /**
   * Handle async uniqueness check result
   */
  async checkEmailUniqueness(email: string): Promise<{
    available: boolean;
    message: string;
  }> {
    const result = await validateEmailUniqueness(email);

    if (!result.valid) {
      return {
        available: false,
        message: result.message || 'Email is not available',
      };
    }

    this.lastValidEmail = email;
    return {
      available: true,
      message: 'Email is available',
    };
  }

  /**
   * Get CSS class for field styling (Task 4.7)
   */
  getEmailFieldClass(email: string): string {
    if (!email) return '';

    const result = validateEmail(email);
    if (!result.valid) return 'field-error';

    if (result.severity === 'warning') return 'field-warning';

    return 'field-success';
  }
}

/* ============================================
   EXAMPLE 2: Real-time Password Strength
   (Task 4.3: Real-time password strength calculation)
============================================ */

export class PasswordFieldController {
  private strength: PasswordStrength | null = null;

  /**
   * Called on password input change
   * Returns strength info for real-time display
   */
  onPasswordChange(password: string): {
    strength: PasswordStrength;
    strengthDisplay: {
      stars: string;
      color: string;
      percentage: number;
      level: string;
    };
    isValid: boolean;
  } {
    // Task 4.3: Calculate strength in real-time
    const strength = calculatePasswordStrength(password);
    this.strength = strength;

    // Generate display info
    const { getStrengthStars, getStrengthColor } = require('./validation');

    return {
      strength,
      strengthDisplay: {
        stars: getStrengthStars(strength),
        color: getStrengthColor(strength),
        percentage: strength.percentage,
        level: strength.level.replace('-', ' '),
      },
      isValid: strength.level === 'strong' || strength.level === 'very-strong',
    };
  }

  /**
   * Task 4.9: Get user-friendly error message
   */
  getPasswordError(password: string): string | null {
    const result = validatePassword(password);
    return result.valid ? null : result.message || null;
  }

  /**
   * Get feedback items for display
   */
  getPasswordFeedback(password: string): string[] {
    if (!this.strength) {
      this.onPasswordChange(password);
    }
    return this.strength?.feedback || [];
  }

  /**
   * Get CSS class for field styling (Task 4.7)
   */
  getPasswordFieldClass(password: string): string {
    if (!password) return '';

    const result = validatePassword(password);
    if (!result.valid) return 'field-error';

    return 'field-success';
  }
}

/* ============================================
   EXAMPLE 3: PIN Validation
   (Task 4.4: PIN validation with sequence rejection)
============================================ */

export class PINFieldController {
  /**
   * Validate PIN format and patterns
   */
  validatePINInput(pin: string): {
    valid: boolean;
    message: string;
    icon: string;
  } {
    const result = validatePIN(pin);

    return {
      valid: result.valid,
      message: result.message || '',
      icon: result.valid ? '✓' : result.severity === 'warning' ? '⚠' : '✕',
    };
  }

  /**
   * Get CSS class for field styling (Task 4.7)
   */
  getPINFieldClass(pin: string): string {
    if (!pin) return '';

    const result = validatePIN(pin);
    if (!result.valid) return 'field-error';

    if (result.severity === 'warning') return 'field-warning';

    return 'field-success';
  }

  /**
   * Show error with toast (Task 4.8)
   */
  showPINError(pin: string): void {
    const result = validatePIN(pin);
    if (!result.valid) {
      showValidationError('PIN', result);
    }
  }
}

/* ============================================
   EXAMPLE 4: Mnemonic Validation
   (Task 4.5: Mnemonic validation with dictionary check)
============================================ */

export class MnemonicFieldController {
  /**
   * Validate mnemonic phrase
   */
  validateMnemonicInput(mnemonic: string): {
    valid: boolean;
    message: string;
    wordCount: number;
    severity: 'error' | 'warning' | 'info';
  } {
    const result = validateMnemonic(mnemonic);
    const words = mnemonic.trim().split(/\s+/).filter(w => w.length > 0);

    return {
      valid: result.valid,
      message: result.message || '',
      wordCount: words.length,
      severity: result.severity || 'info',
    };
  }

  /**
   * Get word count progress
   */
  getWordCountProgress(mnemonic: string): {
    current: number;
    required: number;
    percentage: number;
  } {
    const words = mnemonic.trim().split(/\s+/).filter(w => w.length > 0);
    return {
      current: words.length,
      required: 12,
      percentage: Math.min(100, (words.length / 12) * 100),
    };
  }

  /**
   * Get CSS class for field styling (Task 4.7)
   */
  getMnemonicFieldClass(mnemonic: string): string {
    if (!mnemonic) return '';

    const result = validateMnemonic(mnemonic);
    if (!result.valid) return 'field-error';

    if (result.severity === 'warning') return 'field-warning';

    return 'field-success';
  }
}

/* ============================================
   EXAMPLE 5: Address Validation
   (Task 4.6: Address validation for wallet imports)
============================================ */

export class AddressFieldController {
  /**
   * Validate wallet address
   */
  validateAddressInput(address: string): {
    valid: boolean;
    message: string;
    isChecksum: boolean | null;
    isLowercase: boolean | null;
  } {
    const result = validateAddress(address);

    return {
      valid: result.valid,
      message: result.message || '',
      isChecksum: result.isChecksum || null,
      isLowercase: result.isLowercase || null,
    };
  }

  /**
   * Get CSS class for field styling (Task 4.7)
   */
  getAddressFieldClass(address: string): string {
    if (!address) return '';

    const result = validateAddress(address);
    if (!result.valid) return 'field-error';

    return 'field-success';
  }

  /**
   * Get address info for display
   */
  getAddressInfo(address: string): {
    formatted: string;
    checksum: string;
  } {
    return {
      formatted: address || '0x',
      checksum: address.substring(0, 6) + '...' + address.substring(38),
    };
  }
}

/* ============================================
   EXAMPLE 6: Multi-field Form Validation
   (Task 4.10: Complex validation scenarios)
============================================ */

export class SignupFormValidator {
  private validator = new FormValidator();

  /**
   * Validate entire signup form
   * Task 4.10: Batch validation
   */
  validateSignupForm(data: {
    email: string;
    password: string;
    confirmPassword: string;
    pin: string;
  }): boolean {
    // Clear previous errors (Task 4.7)
    this.validator.clearAllErrors();

    // Task 4.2: Email validation
    const emailResult = validateEmail(data.email);
    this.validator.setError('email', emailResult);

    // Task 4.3: Password validation
    const passwordResult = validatePassword(data.password);
    this.validator.setError('password', passwordResult);

    // Additional: Confirm password matches
    if (data.password !== data.confirmPassword) {
      this.validator.setError('confirmPassword', {
        valid: false,
        message: 'Passwords do not match',
        severity: 'error',
      });
    }

    // Task 4.4: PIN validation
    const pinResult = validatePIN(data.pin);
    this.validator.setError('pin', pinResult);

    // Get all errors and show (Task 4.8, 4.9)
    const errors = this.validator.getAllErrors();
    if (errors.length > 0) {
      showMultipleValidationErrors(errors);
      return false;
    }

    return true;
  }

  /**
   * Get inline error message for field (Task 4.7)
   */
  getFieldError(fieldName: string): string | null {
    const error = this.validator.getError(fieldName);
    return error ? error.message : null;
  }

  /**
   * Get all field errors with CSS classes
   */
  getFieldClasses(fieldName: string): string {
    const error = this.validator.getError(fieldName);
    if (!error) return '';
    return error.severity === 'error' ? 'field-error' : 'field-warning';
  }

  /**
   * Get form error count for UX feedback
   */
  getErrorCount(): number {
    return this.validator.getErrorCount();
  }

  /**
   * Check if entire form is valid
   */
  isFormValid(): boolean {
    return this.validator.isValid();
  }
}

/* ============================================
   EXAMPLE 7: React Component Integration Pattern
   (Task 4.7: Inline error messages)
   (Task 4.8: Toast notifications)
============================================ */

/**
 * Example React Hook for form validation
 * 
 * Usage in component:
 * 
 * function LoginForm() {
 *   const [email, setEmail] = useState('');
 *   const [password, setPassword] = useState('');
 *   const form = useFormValidation();
 * 
 *   const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const value = e.target.value;
 *     setEmail(value);
 *     
 *     // Real-time validation (Task 4.2, 4.3)
 *     form.validateField('email', value);
 *   };
 * 
 *   const handleSubmit = (e: React.FormEvent) => {
 *     e.preventDefault();
 *     
 *     // Validate all fields
 *     if (!form.validateForm({ email, password })) {
 *       return; // Errors shown via toast and inline (Task 4.8, 4.7)
 *     }
 *     
 *     // Proceed with submission
 *   };
 * 
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input
 *         value={email}
 *         onChange={handleEmailChange}
 *         className={form.getFieldClass('email')}
 *       />
 *       {form.getError('email') && (
 *         <span className="error-text">{form.getError('email')}</span>
 *       )}
 *       
 *       <input
 *         value={password}
 *         onChange={(e) => setPassword(e.target.value)}
 *         className={form.getFieldClass('password')}
 *       />
 *       {form.getError('password') && (
 *         <span className="error-text">{form.getError('password')}</span>
 *       )}
 *       
 *       <button disabled={!form.isValid()}>Submit</button>
 *     </form>
 *   );
 * }
 */

export function useFormValidation() {
  const validator = new FormValidator();
  const emailController = new EmailFieldController();
  const passwordController = new PasswordFieldController();

  return {
    // Task 4.2: Email validation
    validateEmail: (email: string) => {
      const result = validateEmail(email);
      validator.setError('email', result);
      return result;
    },

    // Task 4.3: Password validation with strength
    validatePassword: (password: string) => {
      const result = validatePassword(password);
      validator.setError('password', result);
      return result;
    },

    getPasswordStrength: (password: string) => {
      return passwordController.onPasswordChange(password);
    },

    // Task 4.4: PIN validation
    validatePIN: (pin: string) => {
      const result = validatePIN(pin);
      validator.setError('pin', result);
      return result;
    },

    // Task 4.5: Mnemonic validation
    validateMnemonic: (mnemonic: string) => {
      const result = validateMnemonic(mnemonic);
      validator.setError('mnemonic', result);
      return result;
    },

    // Task 4.6: Address validation
    validateAddress: (address: string) => {
      const result = validateAddress(address);
      validator.setError('address', result);
      return result;
    },

    // Task 4.7: Get inline error messages
    getError: (fieldName: string) => validator.getErrorMessage(fieldName),
    getFieldClass: (fieldName: string) =>
      validator.hasError(fieldName) ? 'field-error' : '',

    // Task 4.8: Get all errors for toast display
    getErrors: () => validator.getAllErrors(),

    // Task 4.10: Form-level validation
    validateForm: (data: Record<string, string>) => {
      const results = validateFields(data as any);
      Object.entries(results).forEach(([field, result]) => {
        validator.setError(field, result);
      });

      if (!validator.isValid()) {
        showMultipleValidationErrors(validator.getAllErrors());
      }

      return validator.isValid();
    },

    isValid: () => validator.isValid(),
    clearErrors: () => validator.clearAllErrors(),
  };
}

export default {
  EmailFieldController,
  PasswordFieldController,
  PINFieldController,
  MnemonicFieldController,
  AddressFieldController,
  SignupFormValidator,
  useFormValidation,
};
