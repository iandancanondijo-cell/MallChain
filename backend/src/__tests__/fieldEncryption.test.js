// Regression coverage for utils/fieldEncryption.js — field-level PII
// encryption at rest (production-readiness E2/E1).
const { encryptField, decryptField, blindIndex, isEncrypted } = require('../utils/fieldEncryption');

describe('fieldEncryption', () => {
  test('round-trips a plaintext value through encrypt/decrypt', () => {
    const ciphertext = encryptField('254712345678');
    expect(ciphertext).not.toBe('254712345678');
    expect(isEncrypted(ciphertext)).toBe(true);
    expect(decryptField(ciphertext)).toBe('254712345678');
  });

  test('the same plaintext encrypts to a different ciphertext each time (random IV)', () => {
    const a = encryptField('same-value');
    const b = encryptField('same-value');
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe('same-value');
    expect(decryptField(b)).toBe('same-value');
  });

  test('passes null/undefined through unchanged', () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeUndefined();
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeUndefined();
  });

  test('decrypting an already-plaintext (un-migrated) value returns it unchanged rather than throwing', () => {
    expect(decryptField('foo@example.com')).toBe('foo@example.com');
    expect(isEncrypted('foo@example.com')).toBe(false);
  });

  test('tampering with the ciphertext is detected (GCM auth tag fails)', () => {
    const ciphertext = encryptField('secret-value');
    const tampered = ciphertext.slice(0, -4) + 'abcd';
    expect(() => decryptField(tampered)).toThrow();
  });

  describe('blindIndex', () => {
    test('is deterministic for the same input', () => {
      expect(blindIndex('foo@example.com')).toBe(blindIndex('foo@example.com'));
    });

    test('differs for different inputs', () => {
      expect(blindIndex('foo@example.com')).not.toBe(blindIndex('bar@example.com'));
    });

    test('trims whitespace but does not force case (callers normalize case themselves)', () => {
      expect(blindIndex('  foo@example.com  ')).toBe(blindIndex('foo@example.com'));
      expect(blindIndex('Foo@example.com')).not.toBe(blindIndex('foo@example.com'));
    });

    test('returns undefined for empty/null/undefined input', () => {
      expect(blindIndex('')).toBeUndefined();
      expect(blindIndex(null)).toBeUndefined();
      expect(blindIndex(undefined)).toBeUndefined();
    });
  });

  test('encryption key and blind-index key produce unrelated outputs for the same input', () => {
    // Not a rigorous cryptographic proof, just a sanity check that we
    // didn't accidentally derive one from the other or reuse a key.
    const enc = encryptField('254712345678');
    const idx = blindIndex('254712345678');
    expect(enc).not.toContain(idx);
  });
});
