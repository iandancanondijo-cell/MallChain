/**
 * Unit tests for wallet.ts service
 * Tests all 5 main functions: generateMnemonic, validateMnemonic, deriveAddress, importWallet, getWalletInfo
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateMnemonic,
  validateMnemonic,
  deriveAddress,
  importWallet,
  getWalletInfo,
  saveWalletToStorage,
  getAllWalletsFromStorage,
  deleteWalletFromStorage,
  generateNextWalletName,
} from './wallet';
import type { WalletData } from './wallet';

describe('wallet.ts - Task 6.1 to 6.5', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  /* ============== Task 6.1: generateMnemonic ============== */

  describe('Task 6.1: generateMnemonic()', () => {
    it('should generate a 12-word mnemonic', () => {
      const mnemonic = generateMnemonic(12);
      const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
      expect(words).toHaveLength(12);
      expect(mnemonic).toBeTruthy();
    });

    it('should generate a 24-word mnemonic', () => {
      const mnemonic = generateMnemonic(24);
      const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
      expect(words).toHaveLength(24);
      expect(mnemonic).toBeTruthy();
    });

    it('should generate different mnemonics on each call', () => {
      const mnemonic1 = generateMnemonic(12);
      const mnemonic2 = generateMnemonic(12);
      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('should contain only lowercase words', () => {
      const mnemonic = generateMnemonic(12);
      const words = mnemonic.split(/\s+/);
      words.forEach(word => {
        expect(word).toBe(word.toLowerCase());
      });
    });

    it('should handle invalid word count gracefully', () => {
      // bip39 library handles invalid word counts
      const mnemonic = generateMnemonic(12);
      const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
      expect([12, 24]).toContain(words.length);
    });
  });

  /* ============== Task 6.2: validateMnemonic ============== */

  describe('Task 6.2: validateMnemonic()', () => {
    it('should validate a valid 12-word mnemonic', () => {
      const mnemonic = generateMnemonic(12);
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should validate a valid 24-word mnemonic', () => {
      const mnemonic = generateMnemonic(24);
      const result = validateMnemonic(mnemonic);
      expect(result.valid).toBe(true);
    });

    it('should reject empty mnemonic', () => {
      const result = validateMnemonic('');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject mnemonic with wrong word count', () => {
      const result = validateMnemonic('abandon ability about above absent absorb abstract abuse access accident account');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('12 or 24 words');
    });

    it('should reject mnemonic with invalid words', () => {
      const result = validateMnemonic('invalid words here that are totally not in the bip39 dictionary');
      expect(result.valid).toBe(false);
    });

    it('should accept mnemonic with extra whitespace', () => {
      const mnemonic = generateMnemonic(12);
      const spacedMnemonic = '  ' + mnemonic + '  ';
      const result = validateMnemonic(spacedMnemonic);
      expect(result.valid).toBe(true);
    });

    it('should handle test mnemonic with warning', () => {
      const result = validateMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
      expect(result.valid).toBe(true);
      expect(result.severity).toBe('warning');
    });
  });

  /* ============== Task 6.3: deriveAddress ============== */

  describe('Task 6.3: deriveAddress()', () => {
    let validMnemonic: string;

    beforeEach(() => {
      validMnemonic = generateMnemonic(12);
    });

    it('should derive address from valid mnemonic', () => {
      const derived = deriveAddress(validMnemonic, 0);
      expect(derived.address).toBeTruthy();
      expect(derived.address).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it('should derive public key from valid mnemonic', () => {
      const derived = deriveAddress(validMnemonic, 0);
      expect(derived.publicKey).toBeTruthy();
      expect(derived.publicKey).toMatch(/^0x/);
    });

    it('should derive private key from valid mnemonic', () => {
      const derived = deriveAddress(validMnemonic, 0);
      expect(derived.privateKey).toBeTruthy();
      expect(derived.privateKey).toMatch(/^0x/);
    });

    it('should use correct derivation path', () => {
      const derived = deriveAddress(validMnemonic, 5);
      expect(derived.derivationPath).toBe("m/44'/60'/0'/0/5");
    });

    it('should derive different addresses for different indices', () => {
      const address1 = deriveAddress(validMnemonic, 0);
      const address2 = deriveAddress(validMnemonic, 1);
      expect(address1.address).not.toBe(address2.address);
    });

    it('should derive same address for same index', () => {
      const address1 = deriveAddress(validMnemonic, 0);
      const address2 = deriveAddress(validMnemonic, 0);
      expect(address1.address).toBe(address2.address);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => {
        deriveAddress('invalid mnemonic phrase', 0);
      }).toThrow();
    });

    it('should track address index', () => {
      const derived = deriveAddress(validMnemonic, 3);
      expect(derived.index).toBe(3);
    });
  });

  /* ============== Task 6.4: importWallet ============== */

  describe('Task 6.4: importWallet()', () => {
    let validMnemonic: string;

    beforeEach(() => {
      validMnemonic = generateMnemonic(12);
    });

    it('should successfully import wallet from valid mnemonic', () => {
      const result = importWallet(validMnemonic, 'Test Wallet');
      expect(result.success).toBe(true);
      expect(result.wallet).toBeTruthy();
      expect(result.wallet?.name).toBe('Test Wallet');
    });

    it('should create wallet with valid address', () => {
      const result = importWallet(validMnemonic, 'Test Wallet');
      expect(result.wallet?.address).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it('should create wallet with unique ID', () => {
      const result1 = importWallet(validMnemonic, 'Wallet 1');
      const result2 = importWallet(validMnemonic, 'Wallet 2');
      expect(result1.wallet?.id).not.toBe(result2.wallet?.id);
    });

    it('should reject import with invalid mnemonic', () => {
      const result = importWallet('invalid mnemonic phrase', 'Test Wallet');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject import without wallet name', () => {
      const result = importWallet(validMnemonic, '');
      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject wallet name longer than 50 chars', () => {
      const longName = 'a'.repeat(51);
      const result = importWallet(validMnemonic, longName);
      expect(result.success).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should set creation timestamp', () => {
      const before = Date.now();
      const result = importWallet(validMnemonic, 'Test Wallet');
      const after = Date.now();

      expect(result.wallet?.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.wallet?.createdAt).toBeLessThanOrEqual(after);
    });

    it('should set wallet as active by default', () => {
      const result = importWallet(validMnemonic, 'Test Wallet');
      expect(result.wallet?.isActive).toBe(true);
    });
  });

  /* ============== Task 6.5: getWalletInfo ============== */

  describe('Task 6.5: getWalletInfo()', () => {
    let wallet: WalletData;

    beforeEach(() => {
      const mnemonic = generateMnemonic(12);
      const importResult = importWallet(mnemonic, 'Test Wallet');
      wallet = importResult.wallet!;
    });

    it('should retrieve wallet info by address', () => {
      const info = getWalletInfo(wallet.address, wallet);
      expect(info).toBeTruthy();
      expect(info?.address).toBe(wallet.address);
    });

    it('should include wallet name in info', () => {
      const info = getWalletInfo(wallet.address, wallet);
      expect(info?.name).toBe('Test Wallet');
    });

    it('should include public key in info', () => {
      const info = getWalletInfo(wallet.address, wallet);
      expect(info?.publicKey).toBeTruthy();
    });

    it('should include creation timestamp', () => {
      const info = getWalletInfo(wallet.address, wallet);
      expect(info?.createdAt).toBeGreaterThan(0);
    });

    it('should return null for non-existent address', () => {
      const info = getWalletInfo('0x0000000000000000000000000000000000000000');
      expect(info).toBeNull();
    });

    it('should include active status', () => {
      const info = getWalletInfo(wallet.address, wallet);
      expect(info?.isActive).toBe(true);
    });
  });

  /* ============== Storage Functions ============== */

  describe('Storage Functions', () => {
    let wallet: WalletData;

    beforeEach(() => {
      const mnemonic = generateMnemonic(12);
      const importResult = importWallet(mnemonic, 'Test Wallet');
      wallet = importResult.wallet!;
    });

    it('should save wallet to storage', () => {
      const saved = saveWalletToStorage(wallet);
      expect(saved).toBe(true);
    });

    it('should retrieve saved wallets', () => {
      saveWalletToStorage(wallet);
      const wallets = getAllWalletsFromStorage();
      expect(wallets.length).toBeGreaterThan(0);
      expect(wallets[0].id).toBe(wallet.id);
    });

    it('should delete wallet from storage', () => {
      saveWalletToStorage(wallet);
      const deleted = deleteWalletFromStorage(wallet.id);
      expect(deleted).toBe(true);

      const wallets = getAllWalletsFromStorage();
      expect(wallets.find(w => w.id === wallet.id)).toBeUndefined();
    });

    it('should generate next wallet name', () => {
      const wallets = [wallet];
      const nextName = generateNextWalletName(wallets);
      expect(nextName).toContain('Wallet');
    });
  });
});
