/**
 * Security Service
 * Handles PIN hashing/verification, mnemonic encryption/decryption, and biometric operations
 * Uses bcryptjs for PIN hashing and the Web Crypto API (PBKDF2 + AES-GCM) for mnemonic encryption
 */

import bcrypt from 'bcryptjs';

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

// Constants
const PIN_SALT_ROUNDS = 10;
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
// PBKDF2 iterations for PIN-based key derivation. OWASP recommends >=100k
// for PBKDF2-SHA256; this used to be 100 (a hardcoded, non-random salt made
// it worse — every user shared the same salt, so a single precomputed table
// covered every account). Matches the iteration count WalletFlow.tsx's own
// vault encryption already used.
const PBKDF2_ITERATIONS = 250_000;

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

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

    // Fresh random salt + IV every call (unlike the old hardcoded
    // 'mallchain_salt_v1' shared by every user/every encryption) via
    // AES-GCM, which also authenticates the ciphertext instead of just
    // encrypting it. Encoded as saltB64.ivB64.cipherB64 so the single
    // `encrypted` string this function has always returned still round-trips
    // through decryptMnemonic below.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(pin, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(mnemonic));

    return {
      success: true,
      encrypted: `${bufToB64(salt)}.${bufToB64(iv)}.${bufToB64(cipherBuf)}`,
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

    const parts = encrypted.split('.');
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'Failed to decrypt mnemonic. Verify PIN is correct.',
      };
    }
    const [saltB64, ivB64, cipherB64] = parts;
    const key = await deriveAesKey(pin, b64ToBuf(saltB64));

    try {
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBuf(ivB64) as BufferSource },
        key,
        b64ToBuf(cipherB64) as BufferSource
      );
      return {
        success: true,
        decrypted: new TextDecoder().decode(plainBuf),
      };
    } catch {
      // AES-GCM's authentication tag check fails (throws) on a wrong PIN or
      // tampered ciphertext — this is the expected "wrong PIN" path, not an
      // unexpected error.
      return {
        success: false,
        error: 'Failed to decrypt mnemonic. Verify PIN is correct.',
      };
    }
  } catch (error) {
    console.error('[Security] Error decrypting mnemonic:', error);
    return {
      success: false,
      error: `Failed to decrypt mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate a random secure backup code
 * @returns 8-character alphanumeric backup code
 */
export function generateBackupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomBytes[i] % chars.length);
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
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `session_${Date.now()}_${randomHex}`;
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
