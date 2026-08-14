/**
 * Unit tests for wallet.ts service
 * Tests generateNewMnemonic, validateMnemonicPhrase, deriveAddressFromMnemonic,
 * importWalletFromMnemonic, and getWalletInfo.
 */

import { describe, it, expect } from 'vitest';
import {
  generateNewMnemonic,
  validateMnemonicPhrase,
  deriveAddressFromMnemonic,
  importWalletFromMnemonic,
  getWalletInfo,
  isValidMallAddress,
} from './wallet';

// Deterministic fixture: 'mall1...' address derived from this exact mnemonic at
// index 0 via the Cosmos SDK path m/44'/118'/0'/0/0 (same path the backend uses).
const FIXTURE_MNEMONIC =
  'abandon about above absent absorb abstract abuse access accident account accuse achieve';

describe('wallet.ts', () => {
  describe('generateNewMnemonic()', () => {
    it('should generate a 12-word mnemonic', () => {
      const mnemonic = generateNewMnemonic();
      const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
      expect(words).toHaveLength(12);
      expect(mnemonic).toBeTruthy();
    });

    it('should generate different mnemonics on each call', () => {
      const mnemonic1 = generateNewMnemonic();
      const mnemonic2 = generateNewMnemonic();
      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('should contain only lowercase words', () => {
      const mnemonic = generateNewMnemonic();
      const words = mnemonic.split(/\s+/);
      words.forEach(word => {
        expect(word).toBe(word.toLowerCase());
      });
    });

    it('should generate a mnemonic that passes its own validation', () => {
      const mnemonic = generateNewMnemonic();
      expect(validateMnemonicPhrase(mnemonic).valid).toBe(true);
    });
  });

  describe('validateMnemonicPhrase()', () => {
    it('should validate a valid 12-word mnemonic', () => {
      const result = validateMnemonicPhrase(FIXTURE_MNEMONIC);
      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(12);
    });

    it('should reject an empty mnemonic', () => {
      const result = validateMnemonicPhrase('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('cannot be empty');
    });

    it('should reject the wrong word count', () => {
      const result = validateMnemonicPhrase('abandon ability about above absent absorb abstract abuse access accident account');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid word count');
    });

    it('should reject a mnemonic with words outside the BIP39 dictionary', () => {
      const result = validateMnemonicPhrase('invalid words here that are totally not in the bip39 dictionary');
      expect(result.valid).toBe(false);
    });

    it('should accept a mnemonic with extra whitespace', () => {
      const spaced = '  ' + FIXTURE_MNEMONIC.replace(/ /g, '  ') + '  ';
      const result = validateMnemonicPhrase(spaced);
      expect(result.valid).toBe(true);
    });

    it('should be case-insensitive', () => {
      const result = validateMnemonicPhrase(FIXTURE_MNEMONIC.toUpperCase());
      expect(result.valid).toBe(true);
    });
  });

  describe('deriveAddressFromMnemonic()', () => {
    it('should derive a mall1... bech32 address from a valid mnemonic', async () => {
      const derived = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      expect(derived.address).toBeTruthy();
      expect(isValidMallAddress(derived.address)).toBe(true);
    });

    it('should derive a public key', async () => {
      const derived = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      expect(derived.publicKey).toBeTruthy();
    });

    it('should use the Cosmos SDK derivation path for the given index', async () => {
      const derived = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 5);
      expect(derived.derivationPath).toBe("m/44'/118'/0'/0/5");
    });

    it('should derive different addresses for different indices', async () => {
      const address1 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      const address2 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 1);
      expect(address1.address).not.toBe(address2.address);
    });

    it('should derive the same address for the same index', async () => {
      const address1 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      const address2 = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 0);
      expect(address1.address).toBe(address2.address);
    });

    it('should reject an invalid mnemonic', async () => {
      await expect(deriveAddressFromMnemonic('invalid mnemonic phrase', 0)).rejects.toThrow();
    });

    it('should track the requested address index', async () => {
      const derived = await deriveAddressFromMnemonic(FIXTURE_MNEMONIC, 3);
      expect(derived.index).toBe(3);
    });
  });

  describe('importWalletFromMnemonic()', () => {
    it('should successfully import a wallet from a valid mnemonic', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Test Wallet');
      expect(result.success).toBe(true);
      expect(result.wallet).toBeTruthy();
      expect(result.wallet?.name).toBe('Test Wallet');
    });

    it('should create a wallet with a valid mall1... address', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Test Wallet');
      expect(isValidMallAddress(result.wallet!.address)).toBe(true);
    });

    it('should create wallets with unique IDs', async () => {
      const result1 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Wallet 1');
      const result2 = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Wallet 2');
      expect(result1.wallet?.id).not.toBe(result2.wallet?.id);
    });

    it('should reject an import with an invalid mnemonic', async () => {
      const result = await importWalletFromMnemonic('invalid mnemonic phrase', 'Test Wallet');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject an import without a wallet name', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, '');
      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject a wallet name longer than 50 characters', async () => {
      const longName = 'a'.repeat(51);
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, longName);
      expect(result.success).toBe(false);
      expect(result.error).toContain('50 characters');
    });

    it('should set a creation timestamp', async () => {
      const before = Date.now();
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Test Wallet');
      const after = Date.now();

      expect(result.wallet?.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.wallet?.createdAt).toBeLessThanOrEqual(after);
    });

    it('should set the wallet as active by default', async () => {
      const result = await importWalletFromMnemonic(FIXTURE_MNEMONIC, 'Test Wallet');
      expect(result.wallet?.isActive).toBe(true);
    });
  });

  describe('getWalletInfo()', () => {
    it('should retrieve wallet info by address', () => {
      const info = getWalletInfo('mall1nruy4hgm6d8mjx3npnj0eq60kztpmqez9vkf7y');
      expect(info).toBeTruthy();
      expect(info?.address).toBe('mall1nruy4hgm6d8mjx3npnj0eq60kztpmqez9vkf7y');
    });

    it('should return null for an empty address', () => {
      const info = getWalletInfo('');
      expect(info).toBeNull();
    });
  });

  // These describe wallet-list persistence (save/list/delete multiple wallets,
  // auto-naming) that doesn't exist anywhere in this codebase yet — there's no
  // saveWalletToStorage/getAllWalletsFromStorage/deleteWalletFromStorage/
  // generateNextWalletName in wallet.ts or elsewhere. Skipped rather than faked
  // or deleted, as a marker for when that feature actually gets built.
  describe.skip('Storage Functions (not yet implemented)', () => {
    it.todo('should save wallet to storage');
    it.todo('should retrieve saved wallets');
    it.todo('should delete wallet from storage');
    it.todo('should generate next wallet name');
  });
});
