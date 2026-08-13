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
  isValidSolanaAddress,
  countMnemonicWords,
} from '../../services/wallet';

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
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = validateMnemonicPhrase(mnemonic);

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
      const mnemonic = 'ABANDON ABOUT ABOVE ABSENT ABSORB ABSTRACT ABUSE ACCESS ACCIDENT ACCOUNT ACCUSE ACHIEVE';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(true);
    });

    it('should handle extra whitespace', () => {
      const mnemonic = 'abandon  about   above  absent absorb abstract abuse access accident account accuse achieve';
      const result = validateMnemonicPhrase(mnemonic);

      expect(result.valid).toBe(true);
    });
  });

  describe('Address Derivation', () => {
    it('should derive address from 12-word mnemonic', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = deriveAddressFromMnemonic(mnemonic, 0);

      expect(result.address).toBeTruthy();
      expect(result.publicKey).toBeTruthy();
      expect(result.derivationPath).toMatch(/m\/44'/);
      expect(result.index).toBe(0);
    });

    it('should use Solana BIP44 derivation path', () => {
      const mnemonic = generateNewMnemonic();
      const result = deriveAddressFromMnemonic(mnemonic, 0);

      expect(result.derivationPath).toBe("m/44'/501'/0'/0'/0'");
    });

    it('should derive different addresses with different indices', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';

      const address0 = deriveAddressFromMnemonic(mnemonic, 0);
      const address1 = deriveAddressFromMnemonic(mnemonic, 1);

      expect(address0.address).not.toBe(address1.address);
      expect(address0.index).toBe(0);
      expect(address1.index).toBe(1);
    });

    it('should derive same address for same mnemonic and index', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';

      const address1 = deriveAddressFromMnemonic(mnemonic, 0);
      const address2 = deriveAddressFromMnemonic(mnemonic, 0);

      expect(address1.address).toBe(address2.address);
    });

    it('should throw error for invalid mnemonic', () => {
      const invalidMnemonic = 'invalid words here that are not valid bip39 words at all';

      expect(() => {
        deriveAddressFromMnemonic(invalidMnemonic, 0);
      }).toThrow();
    });

    it('should validate mnemonic before deriving address', () => {
      const invalidMnemonic = 'test test test';
      const result = deriveAddressFromMnemonic.bind(null, invalidMnemonic, 0);

      expect(result).toThrow();
    });
  });

  describe('Wallet Import', () => {
    it('should import wallet from valid mnemonic', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = importWalletFromMnemonic(mnemonic, 'My Wallet');

      expect(result.success).toBe(true);
      expect(result.wallet).toBeTruthy();
      expect(result.wallet?.name).toBe('My Wallet');
      expect(result.wallet?.address).toBeTruthy();
      expect(result.wallet?.id).toBeTruthy();
    });

    it('should validate wallet name (1-50 characters)', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';

      // Valid name
      const result1 = importWalletFromMnemonic(mnemonic, 'Valid Name');
      expect(result1.success).toBe(true);

      // Too long name
      const result2 = importWalletFromMnemonic(mnemonic, 'a'.repeat(51));
      expect(result2.success).toBe(false);
      expect(result2.error).toMatch(/50 characters/i);

      // Empty name
      const result3 = importWalletFromMnemonic(mnemonic, '');
      expect(result3.success).toBe(false);
      expect(result3.error).toMatch(/cannot be empty/i);
    });

    it('should generate unique wallet ID', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';

      const wallet1 = importWalletFromMnemonic(mnemonic, 'Wallet 1');
      const wallet2 = importWalletFromMnemonic(mnemonic, 'Wallet 2');

      expect(wallet1.wallet?.id).not.toBe(wallet2.wallet?.id);
    });

    it('should reject invalid mnemonic', () => {
      const invalidMnemonic = 'invalid words here';
      const result = importWalletFromMnemonic(invalidMnemonic, 'Wallet');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should set isActive to true for new wallets', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = importWalletFromMnemonic(mnemonic, 'My Wallet');

      expect(result.wallet?.isActive).toBe(true);
    });

    it('should store creation timestamp', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const before = Date.now();
      const result = importWalletFromMnemonic(mnemonic, 'My Wallet');
      const after = Date.now();

      expect(result.wallet?.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.wallet?.createdAt).toBeLessThanOrEqual(after);
    });

    it('should include derivation path in wallet', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const result = importWalletFromMnemonic(mnemonic, 'My Wallet');

      expect(result.wallet?.derivationPath).toMatch(/m\/44'/);
    });
  });

  describe('Address Formatting', () => {
    it('should format address as first-6...last-6', () => {
      const address = 'SomeVeryLongWalletAddressThatIsFullOfCharacters12345';
      const formatted = formatAddressForDisplay(address);

      expect(formatted).toMatch(/^.{6}\.\.\..{6}$/);
      expect(formatted).toBe('SomeVe...67345');
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

  describe('Solana Address Validation', () => {
    it('should validate correct Solana address format', () => {
      const validAddress = 'So1111111111111111111111111111111111111111111';
      const result = isValidSolanaAddress(validAddress);

      expect(result).toBe(true);
    });

    it('should reject address with invalid characters', () => {
      const invalidAddress = 'So111111111111111111111111111111111111111110'; // '0' is invalid in base58
      const result = isValidSolanaAddress(invalidAddress);

      expect(result).toBe(false);
    });

    it('should reject address that is too short', () => {
      const shortAddress = 'So11111111';
      const result = isValidSolanaAddress(shortAddress);

      expect(result).toBe(false);
    });

    it('should reject address that is too long', () => {
      const longAddress = 'So' + '1'.repeat(50);
      const result = isValidSolanaAddress(longAddress);

      expect(result).toBe(false);
    });

    it('should reject empty address', () => {
      const result = isValidSolanaAddress('');
      expect(result).toBe(false);
    });

    it('should reject null/undefined', () => {
      const result1 = isValidSolanaAddress(null as any);
      const result2 = isValidSolanaAddress(undefined as any);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should validate base58 characters only', () => {
      // Invalid: contains 0, O, I, l
      const invalid1 = 'So1111110111111111111111111111111111111111111'; // Contains '0'
      const result1 = isValidSolanaAddress(invalid1);

      expect(result1).toBe(false);
    });
  });

  describe('Mnemonic Word Counting', () => {
    it('should count 12 words', () => {
      const mnemonic = 'abandon about above absent absorb abstract abuse access accident account accuse achieve';
      const count = countMnemonicWords(mnemonic);

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
    it('should provide error message for invalid mnemonic', () => {
      const result = importWalletFromMnemonic('invalid', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    });

    it('should not expose sensitive data in error messages', () => {
      const mnemonic = 'some sensitive secret phrase here';
      const result = importWalletFromMnemonic(mnemonic, 'Test');

      expect(result.error).not.toContain(mnemonic);
    });
  });
});
