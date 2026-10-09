const { normalizePhone, isValidPhone } = require('../utils/phone');

describe('phone.js', () => {
  describe('normalizePhone', () => {
    test('accepts already-E.164 numbers unchanged', () => {
      expect(normalizePhone('+254712345678')).toBe('+254712345678');
      expect(normalizePhone('+14155552671')).toBe('+14155552671');
    });

    test('strips spaces, dashes, parens, dots', () => {
      expect(normalizePhone('+254 712 345 678')).toBe('+254712345678');
      expect(normalizePhone('+254-712-345678')).toBe('+254712345678');
      expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhone('+254.712.345.678')).toBe('+254712345678');
    });

    test('strips a whatsapp: scheme prefix', () => {
      expect(normalizePhone('whatsapp:+254712345678')).toBe('+254712345678');
    });

    test('expands local 0-prefixed numbers with the default country code', () => {
      // Default CC is 254 (Kenya).
      expect(normalizePhone('0712345678')).toBe('+254712345678');
      expect(normalizePhone('0712 345 678')).toBe('+254712345678');
    });

    test('expands bare national numbers with the default country code', () => {
      expect(normalizePhone('712345678')).toBe('+254712345678');
    });

    test('honors an explicit per-call country code override', () => {
      expect(normalizePhone('0712345678', '1')).toBe('+1712345678');
      expect(normalizePhone('712345678', '255')).toBe('+255712345678');
    });

    test('expands the 00 international dialing prefix', () => {
      expect(normalizePhone('00254712345678')).toBe('+254712345678');
    });

    test('rejects empty, non-numeric, and too-short input', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('not-a-phone')).toBeNull();
      expect(normalizePhone('123')).toBeNull();
      expect(normalizePhone('+1')).toBeNull();
    });

    test('rejects a leading-zero country code (invalid E.164)', () => {
      expect(normalizePhone('+0712345678')).toBeNull();
    });

    test('rejects numbers longer than the E.164 15-digit maximum', () => {
      expect(normalizePhone('+1234567890123456')).toBeNull();
    });
  });

  describe('isValidPhone', () => {
    test('is true for deliverable numbers, false otherwise', () => {
      expect(isValidPhone('+254712345678')).toBe(true);
      expect(isValidPhone('0712345678')).toBe(true);
      expect(isValidPhone('abc')).toBe(false);
      expect(isValidPhone('')).toBe(false);
    });
  });
});
