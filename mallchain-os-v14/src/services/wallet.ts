/**
 * Wallet Service
 * Handles wallet creation, import, mnemonic generation, and address derivation
 * Uses BIP39 for mnemonic handling and BIP44 for derivation
 */

import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';

/**
 * Type definitions for wallet operations
 */

export interface WalletInfo {
  address: string;
  publicKey: string;
  derivationPath: string;
  index: number;
}

export interface WalletData {
  id: string;
  name: string;
  mnemonic: string; // encrypted
  address: string;
  publicKey: string;
  createdAt: number;
  derivationPath: string;
  isActive: boolean;
}

export interface ImportWalletResult {
  success: boolean;
  wallet?: WalletData;
  error?: string;
}

export interface MnemonicValidationResult {
  valid: boolean;
  wordCount: number;
  message?: string;
}

/**
 * Simple base58 encoding for wallet addresses
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buf: Buffer): string {
  let carry;
  let digits = [0];
  for (let i = 0; i < buf.length; ++i) {
    carry = buf[i];
    for (let j = 0; j < digits.length; ++j) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (let k = buf.length - 1; k >= 0 && buf[k] === 0; --k) result += '1';
  for (let q = digits.length - 1; q >= 0; --q) result += BASE58_ALPHABET[digits[q]];
  return result;
}

/**
 * Generate a new 12-word BIP39 mnemonic
 * @returns 12-word mnemonic string
 */
export function generateNewMnemonic(): string {
  try {
    return generateMnemonic(128); // 128 bits = 12 words
  } catch (error) {
    console.error('[Wallet] Error generating mnemonic:', error);
    throw new Error('Failed to generate mnemonic. Please try again.');
  }
}

/**
 * Validate a BIP39 mnemonic
 * @param mnemonic - The mnemonic string to validate
 * @returns Validation result with word count and validity
 */
export function validateMnemonicPhrase(mnemonic: string): MnemonicValidationResult {
  if (!mnemonic) {
    return {
      valid: false,
      wordCount: 0,
      message: 'Mnemonic cannot be empty',
    };
  }

  const words = mnemonic.trim().split(/\s+/);
  const wordCount = words.length;

  // BIP39 standard supports 12, 15, 18, 21, or 24 words
  if (![12, 15, 18, 21, 24].includes(wordCount)) {
    return {
      valid: false,
      wordCount,
      message: `Invalid word count. Expected 12, 15, 18, 21, or 24 words, got ${wordCount}`,
    };
  }

  try {
    const isValid = validateMnemonic(mnemonic);
    if (!isValid) {
      return {
        valid: false,
        wordCount,
        message: 'Invalid mnemonic. One or more words are not in the BIP39 word list.',
      };
    }

    return {
      valid: true,
      wordCount,
      message: 'Valid mnemonic',
    };
  } catch (error) {
    console.error('[Wallet] Error validating mnemonic:', error);
    return {
      valid: false,
      wordCount,
      message: 'Error validating mnemonic. Please check and try again.',
    };
  }
}

/**
 * Derive a wallet address from mnemonic using BIP44 standard
 * Solana derivation path: m/44'/501'/0'/0'/0'
 * @param mnemonic - The BIP39 mnemonic
 * @param index - Account index (default 0)
 * @returns Wallet info with address and public key
 */
export function deriveAddressFromMnemonic(
  mnemonic: string,
  index: number = 0
): WalletInfo {
  try {
    // Validate mnemonic first
    const validation = validateMnemonicPhrase(mnemonic);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // Get seed from mnemonic
    const seed = mnemonicToSeedSync(mnemonic);

    // Solana BIP44 path
    const path = `m/44'/501'/0'/0'/${index}'`;

    // Derive key pair
    const derivedSeed = derivePath(path, seed.toString('hex')).key;
    
    // Encode as base58 for address
    const publicKey = encodeBase58(Buffer.from(derivedSeed));

    return {
      address: publicKey,
      publicKey: publicKey,
      derivationPath: path,
      index,
    };
  } catch (error) {
    console.error('[Wallet] Error deriving address:', error);
    throw new Error(`Failed to derive address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Import a wallet from a mnemonic
 * @param mnemonic - The BIP39 mnemonic
 * @param walletName - User-provided wallet name
 * @returns Import result with wallet data or error
 */
export function importWalletFromMnemonic(
  mnemonic: string,
  walletName: string = 'Imported Wallet'
): ImportWalletResult {
  try {
    // Validate mnemonic
    const validation = validateMnemonicPhrase(mnemonic);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.message,
      };
    }

    // Validate wallet name
    if (!walletName || walletName.trim().length === 0) {
      return {
        success: false,
        error: 'Wallet name cannot be empty',
      };
    }

    if (walletName.length > 50) {
      return {
        success: false,
        error: 'Wallet name cannot exceed 50 characters',
      };
    }

    // Derive address from mnemonic
    const walletInfo = deriveAddressFromMnemonic(mnemonic, 0);

    // Create wallet data (mnemonic will be encrypted separately)
    const wallet: WalletData = {
      id: generateWalletId(),
      name: walletName.trim(),
      mnemonic: mnemonic, // Will be encrypted by security service
      address: walletInfo.address,
      publicKey: walletInfo.publicKey,
      createdAt: Date.now(),
      derivationPath: walletInfo.derivationPath,
      isActive: true,
    };

    return {
      success: true,
      wallet,
    };
  } catch (error) {
    console.error('[Wallet] Error importing wallet:', error);
    return {
      success: false,
      error: `Failed to import wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get wallet info from an address
 * Note: This would typically fetch from backend in production
 * @param address - The wallet address
 * @returns Wallet info
 */
export function getWalletInfo(address: string): WalletInfo | null {
  try {
    if (!address || address.length === 0) {
      console.warn('[Wallet] Invalid address provided');
      return null;
    }

    return {
      address,
      publicKey: address,
      derivationPath: "m/44'/501'/0'/0'/0'",
      index: 0,
    };
  } catch (error) {
    console.error('[Wallet] Error getting wallet info:', error);
    return null;
  }
}

/**
 * Generate a unique wallet ID
 * @returns UUID-like string
 */
function generateWalletId(): string {
  return `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Format address for display (show first and last 6 characters)
 * @param address - Full address string
 * @returns Formatted address (e.g., "abc123...xyz789")
 */
export function formatAddressForDisplay(address: string): string {
  if (!address || address.length < 12) {
    return address;
  }
  return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}

/**
 * Check if address is valid Solana format
 * @param address - Address to validate
 * @returns Boolean validity
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    if (!address || typeof address !== 'string') {
      return false;
    }

    // Solana addresses are base58 encoded, typically 44 characters long
    if (address.length < 32 || address.length > 44) {
      return false;
    }

    // Check if all characters are valid base58
    for (const char of address) {
      if (!BASE58_ALPHABET.includes(char)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get mnemonic word list for validation
 * Returns the standard BIP39 English word list
 * @returns Array of valid BIP39 words
 */
export function getBip39WordList(): string[] {
  // This would typically be imported from bip39 library
  // For now, we return empty array as bip39 provides this internally
  return [];
}

/**
 * Count words in mnemonic string
 * @param mnemonic - Mnemonic string
 * @returns Word count
 */
export function countMnemonicWords(mnemonic: string): number {
  if (!mnemonic) return 0;
  return mnemonic.trim().split(/\s+/).length;
}
