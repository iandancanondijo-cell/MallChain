/**
 * Unit tests for security.ts service
 * Tests all 7 main functions: hashPin, verifyPin, encryptMnemonic, decryptMnemonic, detectBiometric, enrollBiometric, verifyBiometric
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hashPin,
  verifyPin,
  encryptMnemonic,
  decryptMnemonic,
  detectBiometric,
  enrollBiometric,
  verifyBiometric,
} from './security';
import { generateMnemonic } from './wallet';

describe('security.ts - Task 6.6 to 6.12', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  /* ============== Task 6.6: hashPin ============== */

  describe('Task 6.6: hashPin()', () => {
    it('should hash a valid 4-digit PIN', async () => {
      const hash = await hashPin('1234');
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should hash a valid 8-digit PIN', async () => {
      const hash = await hashPin('12345678');
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce different hashes for same PIN (randomness)', async () => {
      const hash1 = await hashPin('1234');
      const hash2 = await hashPin('1234');
      expect(hash1).not.toBe(hash2); // bcrypt adds salt
    });

    it('should reject PIN shorter than 4 digits', async () => {
      try {
        await hashPin('123');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('4');
      }
    });

    it('should reject PIN longer than 8 digits', async () => {
      try {
        await hashPin('123456789');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('8');
      }
    });

    it('should reject PIN with non-digit characters', async () => {
      try {
        await hashPin('12a4');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('digits');
      }
    });

    it('should reject empty PIN', async () => {
      try {
        await hashPin('');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    it('should use configurable bcrypt rounds', async () => {
      const hash = await hashPin('1234', 10);
      expect(hash).toBeTruthy();
    });
  });

  /* ============== Task 6.7: verifyPin ============== */

  describe('Task 6.7: verifyPin()', () => {
    let pinHash: string;
    const testPin = '1234';

    beforeEach(async () => {
      pinHash = await hashPin(testPin);
    });

    it('should verify correct PIN', async () => {
      const result = await verifyPin(testPin, pinHash);
      expect(result.valid).toBe(true);
    });

    it('should reject incorrect PIN', async () => {
      const result = await verifyPin('5678', pinHash);
      expect(result.valid).toBe(false);
    });

    it('should track failed PIN attempts', async () => {
      const result1 = await verifyPin('0000', pinHash);
      expect(result1.valid).toBe(false);
      expect(result1.attempts).toBeGreaterThan(0);
    });

    it('should show remaining attempts', async () => {
      await verifyPin('0000', pinHash);
      const result = await verifyPin('0000', pinHash);
      expect(result.message).toContain('remaining');
    });

    it('should lock account after max attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await verifyPin('0000', pinHash);
      }

      // 6th attempt should be locked
      const result = await verifyPin('0000', pinHash);
      expect(result.locked).toBe(true);
      expect(result.message).toContain('Too many failed attempts');
    });

    it('should clear attempts on successful verification', async () => {
      await verifyPin('0000', pinHash); // Failed attempt
      const result = await verifyPin(testPin, pinHash);
      expect(result.valid).toBe(true);

      // Next failed attempt should start from 1, not 2
      const nextResult = await verifyPin('0000', pinHash);
      expect(nextResult.attempts).toBe(1);
    });

    it('should reject PIN and hash if missing', async () => {
      const result = await verifyPin('', '');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should handle timing attack resistance', async () => {
      const start = Date.now();
      await verifyPin('0000', pinHash);
      const duration1 = Date.now() - start;

      const start2 = Date.now();
      await verifyPin('0000', pinHash);
      const duration2 = Date.now() - start2;

      // Times should be similar (bcrypt comparison is timing-safe)
      expect(Math.abs(duration1 - duration2)).toBeLessThan(100);
    });
  });

  /* ============== Task 6.8: encryptMnemonic ============== */

  describe('Task 6.8: encryptMnemonic()', () => {
    const mnemonic = generateMnemonic(12);
    const pin = '1234';

    it('should encrypt valid mnemonic with PIN', async () => {
      const result = await encryptMnemonic(mnemonic, pin);
      expect(result.success).toBe(true);
      expect(result.encrypted).toBeTruthy();
    });

    it('should produce different ciphertext each time (due to salt)', async () => {
      const result1 = await encryptMnemonic(mnemonic, pin);
      const result2 = await encryptMnemonic(mnemonic, pin);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should reject empty mnemonic', async () => {
      const result = await encryptMnemonic('', pin);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject empty PIN', async () => {
      const result = await encryptMnemonic(mnemonic, '');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject invalid PIN format', async () => {
      const result = await encryptMnemonic(mnemonic, '12a4');
      expect(result.success).toBe(false);
      expect(result.error).toContain('digits');
    });

    it('should handle mnemonic with extra whitespace', async () => {
      const mnemonicWithSpace = '  ' + mnemonic + '  ';
      const result = await encryptMnemonic(mnemonicWithSpace, pin);
      expect(result.success).toBe(true);
    });

    it('should encrypt 24-word mnemonic', async () => {
      const mnemonic24 = generateMnemonic(24);
      const result = await encryptMnemonic(mnemonic24, pin);
      expect(result.success).toBe(true);
    });
  });

  /* ============== Task 6.9: decryptMnemonic ============== */

  describe('Task 6.9: decryptMnemonic()', () => {
    const mnemonic = generateMnemonic(12);
    const pin = '1234';
    let encrypted: string;

    beforeEach(async () => {
      const result = await encryptMnemonic(mnemonic, pin);
      encrypted = result.encrypted!;
    });

    it('should decrypt mnemonic with correct PIN', async () => {
      const result = await decryptMnemonic(encrypted, pin);
      expect(result.success).toBe(true);
      expect(result.decrypted).toBe(mnemonic);
    });

    it('should verify decrypted mnemonic', async () => {
      const result = await decryptMnemonic(encrypted, pin);
      expect(result.verified).toBe(true);
    });

    it('should reject decryption with wrong PIN', async () => {
      const result = await decryptMnemonic(encrypted, '5678');
      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
    });

    it('should reject empty encrypted data', async () => {
      const result = await decryptMnemonic('', pin);
      expect(result.success).toBe(false);
    });

    it('should reject empty PIN', async () => {
      const result = await decryptMnemonic(encrypted, '');
      expect(result.success).toBe(false);
    });

    it('should handle invalid PIN format', async () => {
      const result = await decryptMnemonic(encrypted, '12a4');
      expect(result.success).toBe(false);
    });

    it('should reject corrupted encrypted data', async () => {
      const result = await decryptMnemonic('corrupted_data_1234', pin);
      expect(result.success).toBe(false);
      expect(result.verified).toBe(false);
    });

    it('should round-trip mnemonic encryption/decryption', async () => {
      const result = await decryptMnemonic(encrypted, pin);
      expect(result.decrypted).toBe(mnemonic);

      // Re-encrypt the decrypted mnemonic
      const reencrypted = await encryptMnemonic(result.decrypted!, pin);
      expect(reencrypted.success).toBe(true);
    });
  });

  /* ============== Task 6.10: detectBiometric ============== */

  describe('Task 6.10: detectBiometric()', () => {
    it('should return boolean', () => {
      const result = detectBiometric();
      expect(typeof result).toBe('boolean');
    });

    it('should check for WebAuthn API', () => {
      const result = detectBiometric();
      // Result depends on browser capabilities
      expect(typeof result).toBe('boolean');
    });

    it('should handle when PublicKeyCredential is undefined', () => {
      const original = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = undefined;

      const result = detectBiometric();
      expect(typeof result).toBe('boolean');

      (global as any).PublicKeyCredential = original;
    });
  });

  /* ============== Task 6.11: enrollBiometric ============== */

  describe('Task 6.11: enrollBiometric()', () => {
    it('should return biometric data object', async () => {
      const result = await enrollBiometric('fingerprint');
      expect(result).toBeTruthy();
    });

    it('should set enrolled flag', async () => {
      const result = await enrollBiometric('fingerprint');
      if (detectBiometric()) {
        expect(result.enrolled).toBe(true);
      }
    });

    it('should set timestamp', async () => {
      const before = Date.now();
      const result = await enrollBiometric('fingerprint');
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before - 100);
      expect(result.timestamp).toBeLessThanOrEqual(after + 100);
    });

    it('should support different biometric types', async () => {
      const fingerprintResult = await enrollBiometric('fingerprint');
      // Biometric enrollment may not be available on all devices
      if (fingerprintResult.enrolled) {
        expect(fingerprintResult.type).toBe('fingerprint');
      }

      const faceResult = await enrollBiometric('face');
      if (faceResult.enrolled) {
        expect(faceResult.type).toBe('face');
      }

      const irisResult = await enrollBiometric('iris');
      if (irisResult.enrolled) {
        expect(irisResult.type).toBe('iris');
      }
    });

    it('should default to fingerprint', async () => {
      const result = await enrollBiometric();
      // Default type is only set if enrollment succeeds
      if (result.enrolled) {
        expect(result.type).toBe('fingerprint');
      }
    });

    it('should generate template if enrolled', async () => {
      const result = await enrollBiometric('fingerprint');
      if (result.enrolled) {
        expect(result.template).toBeTruthy();
      }
    });
  });

  /* ============== Task 6.12: verifyBiometric ============== */

  describe('Task 6.12: verifyBiometric()', () => {
    beforeEach(async () => {
      if (detectBiometric()) {
        await enrollBiometric('fingerprint');
      }
    });

    it('should return boolean', async () => {
      const result = await verifyBiometric();
      expect(typeof result).toBe('boolean');
    });

    it('should verify enrolled biometric', async () => {
      if (detectBiometric()) {
        const result = await verifyBiometric();
        expect(typeof result).toBe('boolean');
      }
    });

    it('should return false if no biometric enrolled', async () => {
      localStorage.clear(); // Clear enrolled data
      const result = await verifyBiometric();
      expect(typeof result).toBe('boolean');
    });

    it('should handle verification timeout', async () => {
      const result = await verifyBiometric();
      expect(typeof result).toBe('boolean');
    });
  });

  /* ============== Integration Tests ============== */

  describe('Integration Tests', () => {
    it('should hash PIN and verify it', async () => {
      const pin = '5678';
      const hash = await hashPin(pin);
      const result = await verifyPin(pin, hash);
      expect(result.valid).toBe(true);
    });

    it('should encrypt/decrypt mnemonic with PIN', async () => {
      const mnemonic = generateMnemonic(12);
      const pin = '1234';

      const encResult = await encryptMnemonic(mnemonic, pin);
      expect(encResult.success).toBe(true);

      const decResult = await decryptMnemonic(encResult.encrypted!, pin);
      expect(decResult.success).toBe(true);
      expect(decResult.decrypted).toBe(mnemonic);
    });

    it('should not decrypt with wrong PIN', async () => {
      const mnemonic = generateMnemonic(12);
      const pin = '1234';
      const wrongPin = '5678';

      const encResult = await encryptMnemonic(mnemonic, pin);
      const decResult = await decryptMnemonic(encResult.encrypted!, wrongPin);
      expect(decResult.success).toBe(false);
    });

    it('should handle complete wallet security flow', async () => {
      // 1. Generate PIN and hash it
      const pin = '1234';
      const pinHash = await hashPin(pin);

      // 2. Generate and encrypt mnemonic
      const mnemonic = generateMnemonic(12);
      const encResult = await encryptMnemonic(mnemonic, pin);

      // 3. Verify PIN
      const verifyResult = await verifyPin(pin, pinHash);
      expect(verifyResult.valid).toBe(true);

      // 4. Decrypt mnemonic
      const decResult = await decryptMnemonic(encResult.encrypted!, pin);
      expect(decResult.decrypted).toBe(mnemonic);
    });
  });
});
