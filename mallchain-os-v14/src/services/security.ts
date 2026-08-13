/**
 * Security Service
 * Handles PIN hashing/verification, mnemonic encryption/decryption, and biometric operations
 * Uses bcryptjs for PIN security and crypto-js for mnemonic encryption
 */

import bcrypt from 'bcryptjs';
import CryptoJS from 'crypto-js';

/**
 * Type definitions for security operations
 */

export interface PinHashResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export interface PinVerifyResult {
  success: boolean;
  valid?: boolean;
  error?: string;
}

export interface EncryptionResult {
  success: boolean;
  encrypted?: string;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  decrypted?: string;
  error?: string;
}

export interface BiometricData {
  type: 'fingerprint' | 'face' | 'iris' | 'none';
  enrolled: boolean;
  createdAt?: number;
  lastUsed?: number;
  error?: string;
}

export interface BiometricCheckResult {
  available: boolean;
  type?: 'fingerprint' | 'face' | 'iris';
  error?: string;
}

// Constants
const PIN_SALT_ROUNDS = 10;
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
const ENCRYPTION_ALGORITHM = 'AES';

/**
 * Validate PIN format
 * @param pin - PIN string to validate
 * @returns Boolean indicating if PIN meets requirements
 */
export function validatePinFormat(pin: string): boolean {
  if (!pin || typeof pin !== 'string') {
    return false;
  }

  // Check length
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return false;
  }

  // Check if only digits
  if (!/^\d+$/.test(pin)) {
    return false;
  }

  // Check for common sequences (1111, 1234, etc.)
  if (isCommonPinSequence(pin)) {
    return false;
  }

  return true;
}

/**
 * Check if PIN is a common/weak sequence
 * @param pin - PIN to check
 * @returns Boolean indicating if PIN is weak
 */
function isCommonPinSequence(pin: string): boolean {
  // All same digit (1111, 2222, etc.)
  if (/^(\d)\1+$/.test(pin)) {
    return true;
  }

  // Sequential digits (1234, 2345, 5678, etc.)
  for (let i = 0; i < pin.length - 1; i++) {
    const current = parseInt(pin[i]);
    const next = parseInt(pin[i + 1]);
    if (Math.abs(current - next) !== 1) {
      return false;
    }
  }

  return pin.length >= 3; // If all sequential and 3+ digits
}

/**
 * Hash a PIN using bcryptjs
 * @param pin - The PIN to hash
 * @returns Promise resolving to hash result
 */
export async function hashPin(pin: string): Promise<PinHashResult> {
  try {
    if (!validatePinFormat(pin)) {
      return {
        success: false,
        error: `Invalid PIN format. PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} digits without sequences.`,
      };
    }

    const hash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);

    return {
      success: true,
      hash,
    };
  } catch (error) {
    console.error('[Security] Error hashing PIN:', error);
    return {
      success: false,
      error: `Failed to hash PIN: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify a PIN against a hash
 * @param pin - The PIN to verify
 * @param hash - The hash to verify against
 * @returns Promise resolving to verification result
 */
export async function verifyPin(pin: string, hash: string): Promise<PinVerifyResult> {
  try {
    if (!pin || !hash) {
      return {
        success: false,
        error: 'PIN and hash are required for verification',
      };
    }

    const isValid = await bcrypt.compare(pin, hash);

    return {
      success: true,
      valid: isValid,
    };
  } catch (error) {
    console.error('[Security] Error verifying PIN:', error);
    return {
      success: false,
      error: `Failed to verify PIN: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Encrypt mnemonic using PIN as key (AES encryption)
 * @param mnemonic - The mnemonic to encrypt
 * @param pin - The PIN to use as encryption key
 * @returns Promise resolving to encrypted result
 */
export async function encryptMnemonic(mnemonic: string, pin: string): Promise<EncryptionResult> {
  try {
    if (!mnemonic || !pin) {
      return {
        success: false,
        error: 'Mnemonic and PIN are required for encryption',
      };
    }

    if (!validatePinFormat(pin)) {
      return {
        success: false,
        error: 'Invalid PIN format',
      };
    }

    // Use PIN as encryption key (stretched for security)
    const key = CryptoJS.PBKDF2(pin, 'mallchain_salt_v1', {
      keySize: 256 / 32,
      iterations: 100,
    }).toString();

    // Encrypt mnemonic
    const encrypted = CryptoJS.AES.encrypt(mnemonic, key).toString();

    return {
      success: true,
      encrypted,
    };
  } catch (error) {
    console.error('[Security] Error encrypting mnemonic:', error);
    return {
      success: false,
      error: `Failed to encrypt mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Decrypt mnemonic using PIN
 * @param encrypted - The encrypted mnemonic string
 * @param pin - The PIN to use as decryption key
 * @returns Promise resolving to decrypted result
 */
export async function decryptMnemonic(encrypted: string, pin: string): Promise<DecryptionResult> {
  try {
    if (!encrypted || !pin) {
      return {
        success: false,
        error: 'Encrypted mnemonic and PIN are required for decryption',
      };
    }

    // Use PIN as decryption key (same derivation as encryption)
    const key = CryptoJS.PBKDF2(pin, 'mallchain_salt_v1', {
      keySize: 256 / 32,
      iterations: 100,
    }).toString();

    // Decrypt mnemonic
    const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      return {
        success: false,
        error: 'Failed to decrypt mnemonic. Verify PIN is correct.',
      };
    }

    return {
      success: true,
      decrypted,
    };
  } catch (error) {
    console.error('[Security] Error decrypting mnemonic:', error);
    return {
      success: false,
      error: `Failed to decrypt mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Detect if WebAuthn (biometric) is available on this device
 * @returns BiometricCheckResult with availability and type
 */
export function detectBiometricAvailability(): BiometricCheckResult {
  try {
    // Check for WebAuthn support
    const webAuthnAvailable =
      window.PublicKeyCredential !== undefined &&
      navigator.credentials !== undefined;

    if (!webAuthnAvailable) {
      return {
        available: false,
        error: 'WebAuthn not supported on this device',
      };
    }

    // Attempt to detect biometric type
    let biometricType: 'fingerprint' | 'face' | 'iris' | undefined;

    // Simple detection based on browser and OS
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes('android')) {
      biometricType = 'fingerprint'; // Android commonly uses fingerprint
    } else if (userAgent.includes('iphone') || userAgent.includes('mac')) {
      biometricType = 'face'; // iOS/Mac commonly uses Face ID
    } else if (userAgent.includes('windows')) {
      biometricType = 'face'; // Windows Hello typically uses face
    }

    return {
      available: true,
      type: biometricType,
    };
  } catch (error) {
    console.error('[Security] Error detecting biometric:', error);
    return {
      available: false,
      error: 'Failed to detect biometric capability',
    };
  }
}

/**
 * Enroll biometric (store fingerprint/face data)
 * Note: In production, this would interact with WebAuthn API
 * @returns Promise resolving to biometric data
 */
export async function enrollBiometric(): Promise<BiometricData> {
  try {
    const biometricCheck = detectBiometricAvailability();

    if (!biometricCheck.available) {
      console.warn('[Security] Biometric not available');
      return {
        type: 'none',
        enrolled: false,
        error: biometricCheck.error,
      };
    }

    // In production, this would use WebAuthn API to register credential
    // For now, we store locally that biometric is enrolled
    const biometricData: BiometricData = {
      type: biometricCheck.type || 'fingerprint',
      enrolled: true,
      createdAt: Date.now(),
    };

    return biometricData;
  } catch (error) {
    console.error('[Security] Error enrolling biometric:', error);
    return {
      type: 'none',
      enrolled: false,
    };
  }
}

/**
 * Verify biometric (authenticate with fingerprint/face)
 * Note: In production, this would interact with WebAuthn API
 * @returns Promise resolving to verification success
 */
export async function verifyBiometric(): Promise<boolean> {
  try {
    const biometricCheck = detectBiometricAvailability();

    if (!biometricCheck.available) {
      console.warn('[Security] Biometric not available for verification');
      return false;
    }

    // In production, this would use WebAuthn API to authenticate
    // For now, we simulate successful verification
    console.log('[Security] Biometric verification simulated (production would use WebAuthn)');

    return true;
  } catch (error) {
    console.error('[Security] Error verifying biometric:', error);
    return false;
  }
}

/**
 * Generate a random secure backup code
 * @returns 8-character alphanumeric backup code
 */
export function generateBackupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Hash backup code for storage
 * @param code - The backup code to hash
 * @returns Promise resolving to hashed backup code
 */
export async function hashBackupCode(code: string): Promise<string> {
  try {
    return await bcrypt.hash(code, PIN_SALT_ROUNDS);
  } catch (error) {
    console.error('[Security] Error hashing backup code:', error);
    throw error;
  }
}

/**
 * Verify backup code against hash
 * @param code - The backup code to verify
 * @param hash - The hash to verify against
 * @returns Promise resolving to verification result
 */
export async function verifyBackupCode(code: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(code, hash);
  } catch (error) {
    console.error('[Security] Error verifying backup code:', error);
    return false;
  }
}

/**
 * Generate session token (for biometric/PIN verification)
 * @returns Unique session token
 */
export function generateSessionToken(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Check if session token is valid (basic TTL check)
 * @param token - Session token to validate
 * @param maxAgeSeconds - Maximum age of token in seconds (default 300 = 5 minutes)
 * @returns Boolean indicating token validity
 */
export function isSessionTokenValid(token: string, maxAgeSeconds: number = 300): boolean {
  if (!token || !token.startsWith('session_')) {
    return false;
  }

  const parts = token.split('_');
  if (parts.length < 2) {
    return false;
  }

  const timestamp = parseInt(parts[1]);
  const ageSeconds = (Date.now() - timestamp) / 1000;

  return ageSeconds <= maxAgeSeconds;
}
