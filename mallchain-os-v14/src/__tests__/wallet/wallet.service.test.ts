/**
 * Wallet Service Tests
 * Tests mnemonic generation, address derivation, wallet import, and validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateNewMnemonic,
  validateMnemonicPhrase,
  deriveAddressFromMnemonic,
  importWalletFromMnemonic,
  formatAddressForDisplay,
  isValidMallAddress,
  countMnemonicWords,
} from '../../services/wallet';

// Deterministic fixture: 'mall1...' address derived from this exact mnemonic at
// index 0 via the Cosmos SDK path m/44'/118'/0'/0/0 (same path the backend uses).
const FIXTURE_MNEMONIC =
  'abandon about above absent absorb abstract abuse access accident account accuse achieve';
const FIXTURE_ADDRESS = 'mall1nruy4hgm6d8mjx3npnj0eq60kztpmqez9vkf7y';

describe('Wallet Service', () => {
  describe('Mnemonic Generation', () => {
    it('should generate a 12-word BIP39 mnemonic', () => {
      const mnemonic = generateNewMnemonic();
      const words = mnemonic.split(' ');

      expect(words.length).toBe(12);
      expect(words.every(w => w.length > 0)).toBe(true);
    });

    it('should generate valid BIP39 mnemonics', () => {
      for (let i = 0; i < 5; i++) {
        const mnemonic = generateNewMnemonic();
        const validation = validateMnemonicPhrase(mnemonic);
        expect(validation.valid).toBe(true);
      }
    });

    it('should generate different mnemonics each time', () => {
      const mnemonic1 = generateNewMnemonic();
      const mnemonic2 = generateNewMnemonic();

      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('should generate mnemonics with common BIP39 words', () => {
      const mnemonic = generateNewMnemonic();
      // Should not throw or return invalid
      const validation = validateMnemonicPhrase(mnemonic);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Mnemonic Validation', () => {
    it('should validate correct 12-word mnemonic', () => {
      const result = validateMnemonicPhrase(FIXTURE_MNEMONIC);

      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(12);
    });

    it('should validate correct 24-word mnemonic', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(24);
    });

    it('should reject invalid word count', () => {
      const mnemonic = 'abandon about above';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/word count/i);
    });

    it('should reject invalid BIP39 words', () => {
      const mnemonic = 'invalid notaword fakeword one two three four five six seven eight';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/invalid|not in/i);
    });

    it('should handle empty mnemonic', () => {
      const result = validateMnemonicPhrase('');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/cannot be empty/i);
    });

    it('should normalize to lowercase', () => {
      const result = validateMnemonicPhrase(FIXTURE_MNEMONIC.toUpperCase());

      expect(result.valid).toBe(true);
    });

    it('should handle extra whitespace', () => {
      const mnemonic = 'abandon  about   above  absent absorb abstract abuse access accident account accuse achieve';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(true);
    });
  });

  describe('Address Derivation', () => {
    it('should derive address from 12-word mnemonic', async () => {
      const result = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);

      expect(result.address).toBeTruthy();
      expect(result.publicKey).toBeTruthy();
      expect(result.derivationPath).toMatch(/m\/44'/);
      expect(result.index).toBe(0);
    });

    it('should derive the same mall1... address the backend would derive for this mnemonic', async () => {
      const result = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);

      expect(result.address).toBe(FIXTURE_ADDRESS);
      expect(isValidMallAddress(result.address)).toBe(true);
    });

    it('should use the Cosmos SDK BIP44 derivation path (coin type 118)', async () => {
      const mnemonic = generateNewMnemonic();
      const result = await deriveAddressFromMnemonic(mnemonic, 0);

      expect(result.derivationPath).toBe("m/44'/118'/0'/0/0");
    });

    it('should derive different addresses with different indices', async () => {
      const address0 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      const address1 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 1);

      expect(address0.address).not.toBe(address1.address);
      expect(address0.index).toBe(0);
      expect(address1.index).toBe(1);
    });

    it('should derive same address for same mnemonic and index', async () => {
      const address1 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      const address2 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);

      expect(address1.address).toBe(address2.address);
    });

    it('should throw error for invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid words here that are not valid bip39 words at all';

      await expect(deriveAddressFromMnemonic(invalidMnemonic, 0)).rejects.toThrow();
    });

    it('should validate mnemonic before deriving address', async () => {
      const invalidMnemonic = 'test test test';

      await expect(deriveAddressFromMnemonic(invalidMnemonic, 0)).rejects.toThrow();
    });
  });

  describe('Wallet Import', () => {
    it('should import wallet from valid mnemonic', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'My Wallet');

      expect(result.success).toBe(true);
      expect(result.wallet).toBeTruthy();
      expect(result.wallet?.name).toBe('My Wallet');
      expect(result.wallet?.address).toBeTruthy();
      expect(result.wallet?.id).toBeTruthy();
    });

    it('should validate wallet name (1-50 characters)', async () => {
      // Valid name
      const result1 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Valid Name');
      expect(result1.success).toBe(true);

      // Too long name
      const result2 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'a'.repeat(51));
      expect(result2.success).toBe(false);
      expect(result2.error).toMatch(/50 characters/i);

      // Empty name
      const result3 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, '');
      expect(result3.success).toBe(false);
      expect(result3.error).toMatch(/cannot be empty/i);
    });

    it('should generate unique wallet ID', async () => {
      const wallet1 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Wallet 1');
      const wallet2 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Wallet 2');

      expect(wallet1.wallet?.id).not.toBe(wallet2.wallet?.id);
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid words here';
      const result = await importWalletFromMnemonic(invalidMnemonic, 'Wallet');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should set isActive to true for new wallets', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'My Wallet');

      expect(result.wallet?.isActive).toBe(true);
    });

    it('should store creation timestamp', async () => {
      const before = Date.now();
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'My Wallet');
      const after = Date.now();

      expect(result.wallet?.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.wallet?.createdAt).toBeLessThanOrEqual(after);
    });

    it('should include derivation path in wallet', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'My Wallet');

      expect(result.wallet?.derivationPath).toMatch(/m\/44'/);
    });
  });

  describe('Address Formatting', () => {
    it('should format address as first-6...last-6', () => {
      const address = 'SomeVeryLongWalletAddressThatIsFullOfCharacters12345';
      const formatted = formatAddressForDisplay(address);

      expect(formatted).toMatch(/^.{6}\.\.\..{6}$/);
      expect(formatted).toBe('SomeVe...s12345');
    });

    it('should not truncate short addresses', () => {
      const address = 'short';
      const formatted = formatAddressForDisplay(address);

      expect(formatted).toBe(address);
    });

    it('should handle 12-character address', () => {
      const address = '123456789012';
      const formatted = formatAddressForDisplay(address);

      expect(formatted).toBe(address); // Exactly 12, so not truncated
    });

    it('should handle null/empty address gracefully', () => {
      const formatted1 = formatAddressForDisplay('');
      const formatted2 = formatAddressForDisplay(null as any);

      expect(formatted1).toBe('');
      // formatted2 will depend on implementation
    });
  });

  describe('mall1... Address Validation', () => {
    it('should validate a correctly derived mall1... address', () => {
      expect(isValidMallAddress(FIXTURE_ADDRESS)).toBe(true);
    });

    it('should reject an address with a bad checksum', () => {
      const corrupted = FIXTURE_ADDRESS.slice(0, -1) + (FIXTURE_ADDRESS.endsWith('y') ? 'x' : 'y');
      expect(isValidMallAddress(corrupted)).toBe(false);
    });

    it('should reject an address with the wrong prefix', () => {
      // A validly-encoded (checksum-correct) bech32 address, but for a
      // different chain prefix — must fail on the prefix check, not decoding.
      expect(isValidMallAddress('cosmos1nruy4hgm6d8mjx3npnj0eq60kztpmqezwlrjuv')).toBe(false);
    });

    it('should reject a truncated address', () => {
      expect(isValidMallAddress(FIXTURE_ADDRESS.slice(0, 10))).toBe(false);
    });

    it('should reject empty address', () => {
      expect(isValidMallAddress('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidMallAddress(null as any)).toBe(false);
      expect(isValidMallAddress(undefined as any)).toBe(false);
    });

    it('should reject a plausible-looking but non-bech32 string', () => {
      expect(isValidMallAddress('mall1_not_a_real_bech32_address')).toBe(false);
    });
  });

  describe('Mnemonic Word Counting', () => {
    it('should count 12 words', () => {
      const count = countMnemonicWords(FIXTURE_MNEMONIC);

      expect(count).toBe(12);
    });

    it('should count 24 words', () => {
      const mnemonic = 'abandon '.repeat(23) + 'art';
      const count = countMnemonicWords(mnemonic);

      expect(count).toBe(24);
    });

    it('should ignore extra whitespace', () => {
      const mnemonic = 'abandon  about   above  absent absorb abstract abuse access accident account accuse achieve';
      const count = countMnemonicWords(mnemonic);

      expect(count).toBe(12);
    });

    it('should return 0 for empty string', () => {
      const count = countMnemonicWords('');
      expect(count).toBe(0);
    });

    it('should handle whitespace-only input', () => {
      const count = countMnemonicWords('   ');
      expect(count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should provide error message for invalid mnemonic', async () => {
      const result = await importWalletFromMnemonic('invalid', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    });

    it('should not expose sensitive data in error messages', async () => {
      const mnemonic = 'some sensitive secret phrase here';
      const result = await importWalletFromMnemonic(mnemonic, 'Test');

      expect(result.error).not.toContain(mnemonic);
    });
  });
});
