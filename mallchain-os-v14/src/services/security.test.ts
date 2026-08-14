/**
 * Unit tests for security.ts service
 * Tests hashPin, verifyPin, encryptMnemonic, decryptMnemonic,
 * detectBiometricAvailability, enrollBiometric, verifyBiometric
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hashPin,
  verifyPin,
  encryptMnemonic,
  decryptMnemonic,
  detectBiometricAvailability,
  enrollBiometric,
  verifyBiometric,
} from './security';
import { generateMnemonic } from 'bip39';

describe('security.ts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('hashPin()', () => {
    it('should hash a valid 4-digit PIN', async () => {
      const result = await hashPin('1357');
      expect(result.success).toBe(true);
      expect(result.hash).toBeTruthy();
    });

    it('should hash a valid 8-digit PIN', async () => {
      const result = await hashPin('13579246');
      expect(result.success).toBe(true);
      expect(result.hash).toBeTruthy();
    });

    it('should produce different hashes for the same PIN (bcrypt salt)', async () => {
      const result1 = await hashPin('1357');
      const result2 = await hashPin('1357');
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should reject a PIN shorter than 4 digits', async () => {
      const result = await hashPin('123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('4');
    });

    it('should reject a PIN longer than 8 digits', async () => {
      const result = await hashPin('123456789');
      expect(result.success).toBe(false);
      expect(result.error).toContain('8');
    });

    it('should reject a PIN with non-digit characters', async () => {
      const result = await hashPin('12a4');
      expect(result.success).toBe(false);
    });

    it('should reject an empty PIN', async () => {
      const result = await hashPin('');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should accept configurable bcrypt rounds', async () => {
      const result = await hashPin('1357', 10);
      expect(result.success).toBe(true);
    });
  });

  describe('verifyPin()', () => {
    let pinHash: string;
    const testPin = '1357';

    beforeEach(async () => {
      const result = await hashPin(testPin);
      pinHash = result.hash!;
    });

    it('should verify a correct PIN', async () => {
      const result = await verifyPin(testPin, pinHash);
      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
    });

    it('should reject an incorrect PIN', async () => {
      const result = await verifyPin('9999', pinHash);
      expect(result.success).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should fail gracefully when PIN or hash is missing', async () => {
      const result = await verifyPin('', '');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('encryptMnemonic()', () => {
    const mnemonic = generateMnemonic(128);
    const pin = '1357';

    it('should encrypt a valid mnemonic with a PIN', async () => {
      const result = await encryptMnemonic(mnemonic, pin);
      expect(result.success).toBe(true);
      expect(result.encrypted).toBeTruthy();
    });

    it('should produce different ciphertext each time (AES IV/salt)', async () => {
      const result1 = await encryptMnemonic(mnemonic, pin);
      const result2 = await encryptMnemonic(mnemonic, pin);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should reject an empty mnemonic', async () => {
      const result = await encryptMnemonic('', pin);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject an empty PIN', async () => {
      const result = await encryptMnemonic(mnemonic, '');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject an invalid PIN format', async () => {
      const result = await encryptMnemonic(mnemonic, '12a4');
      expect(result.success).toBe(false);
    });

    it('should handle a mnemonic with extra whitespace', async () => {
      const mnemonicWithSpace = '  ' + mnemonic + '  ';
      const result = await encryptMnemonic(mnemonicWithSpace, pin);
      expect(result.success).toBe(true);
    });

    it('should encrypt a 24-word mnemonic', async () => {
      const mnemonic24 = generateMnemonic(256);
      const result = await encryptMnemonic(mnemonic24, pin);
      expect(result.success).toBe(true);
    });
  });

  describe('decryptMnemonic()', () => {
    const mnemonic = generateMnemonic(128);
    const pin = '1357';
    let encrypted: string;

    beforeEach(async () => {
      const result = await encryptMnemonic(mnemonic, pin);
      encrypted = result.encrypted!;
    });

    it('should decrypt a mnemonic with the correct PIN', async () => {
      const result = await decryptMnemonic(encrypted, pin);
      expect(result.success).toBe(true);
      expect(result.decrypted).toBe(mnemonic);
    });

    it('should reject decryption with the wrong PIN', async () => {
      const result = await decryptMnemonic(encrypted, '9999');
      expect(result.success).toBe(false);
    });

    it('should reject empty encrypted data', async () => {
      const result = await decryptMnemonic('', pin);
      expect(result.success).toBe(false);
    });

    it('should reject an empty PIN', async () => {
      const result = await decryptMnemonic(encrypted, '');
      expect(result.success).toBe(false);
    });

    it('should reject corrupted encrypted data', async () => {
      const result = await decryptMnemonic('corrupted_data_1357', pin);
      expect(result.success).toBe(false);
    });

    it('should round-trip mnemonic encryption/decryption', async () => {
      const result = await decryptMnemonic(encrypted, pin);
      expect(result.decrypted).toBe(mnemonic);

      const reencrypted = await encryptMnemonic(result.decrypted!, pin);
      expect(reencrypted.success).toBe(true);
    });
  });

  describe('detectBiometricAvailability()', () => {
    it('should report unavailable when WebAuthn is not present (default test environment)', () => {
      const result = detectBiometricAvailability();
      expect(result.available).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should report available when WebAuthn APIs are present', () => {
      const original = window.PublicKeyCredential;
      (window as any).PublicKeyCredential = function () {};

      const result = detectBiometricAvailability();
      expect(result.available).toBe(true);

      (window as any).PublicKeyCredential = original;
    });
  });

  describe('enrollBiometric()', () => {
    it('should report not enrolled when biometrics are unavailable', async () => {
      const result = await enrollBiometric();
      expect(result.enrolled).toBe(false);
      expect(result.type).toBe('none');
    });

    it('should enroll and set a creation timestamp when biometrics are available', async () => {
      const original = window.PublicKeyCredential;
      (window as any).PublicKeyCredential = function () {};

      const before = Date.now();
      const result = await enrollBiometric();
      const after = Date.now();

      expect(result.enrolled).toBe(true);
      expect(result.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.createdAt).toBeLessThanOrEqual(after);

      (window as any).PublicKeyCredential = original;
    });
  });

  describe('verifyBiometric()', () => {
    it('should return false when biometrics are unavailable', async () => {
      const result = await verifyBiometric();
      expect(result).toBe(false);
    });

    it('should return true when biometrics are available (simulated WebAuthn)', async () => {
      const original = window.PublicKeyCredential;
      (window as any).PublicKeyCredential = function () {};

      const result = await verifyBiometric();
      expect(result).toBe(true);

      (window as any).PublicKeyCredential = original;
    });
  });

  describe('Integration', () => {
    it('should hash a PIN and verify it', async () => {
      const pin = '2468';
      const hashResult = await hashPin(pin);
      const verifyResult = await verifyPin(pin, hashResult.hash!);
      expect(verifyResult.valid).toBe(true);
    });

    it('should encrypt and decrypt a mnemonic with a PIN', async () => {
      const mnemonic = generateMnemonic(128);
      const pin = '1357';

      const encResult = await encryptMnemonic(mnemonic, pin);
      expect(encResult.success).toBe(true);

      const decResult = await decryptMnemonic(encResult.encrypted!, pin);
      expect(decResult.success).toBe(true);
      expect(decResult.decrypted).toBe(mnemonic);
    });

    it('should not decrypt with the wrong PIN', async () => {
      const mnemonic = generateMnemonic(128);
      const pin = '1357';
      const wrongPin = '9999';

      const encResult = await encryptMnemonic(mnemonic, pin);
      const decResult = await decryptMnemonic(encResult.encrypted!, wrongPin);
      expect(decResult.success).toBe(false);
    });

    it('should run a full PIN + mnemonic security flow', async () => {
      const pin = '1357';
      const hashResult = await hashPin(pin);

      const mnemonic = generateMnemonic(128);
      const encResult = await encryptMnemonic(mnemonic, pin);

      const verifyResult = await verifyPin(pin, hashResult.hash!);
      expect(verifyResult.valid).toBe(true);

      const decResult = await decryptMnemonic(encResult.encrypted!, pin);
      expect(decResult.decrypted).toBe(mnemonic);
    });
  });

  // The original version of this suite assumed a PIN-attempt-lockout feature
  // (attempts counter, "N remaining" messaging, lockout after 5 failures) that
  // doesn't exist in verifyPin() — PinVerifyResult is just {success, valid,
  // error}, with no attempt tracking at all. Skipped rather than faked, since
  // adding real lockout tracking is a security-relevant product decision
  // (where is attempt state kept? is it enforced server-side, since a
  // client-only lockout is trivially bypassed by clearing localStorage?).
  describe.skip('PIN attempt lockout (not yet implemented)', () => {
    it.todo('should track failed PIN attempts');
    it.todo('should show remaining attempts');
    it.todo('should lock account after max attempts');
    it.todo('should clear attempts on successful verification');
  });
});
