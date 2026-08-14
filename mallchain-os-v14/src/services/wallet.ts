/**
 * Wallet Service
 * Handles wallet creation, import, mnemonic generation, and address derivation
 * Uses BIP39 for mnemonic handling and the Cosmos SDK HD path (coin type 118)
 * for derivation, matching the backend/chain's address scheme (bech32 "mall1..."
 * addresses — see backend/src/config, which derives with the same
 * DirectSecp256k1HdWallet + "mall" prefix).
 */

import { generateMnemonic, validateMnemonic, wordlists } from 'bip39';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { stringToPath } from '@cosmjs/crypto';
import { fromBech32, toHex } from '@cosmjs/encoding';

const ADDRESS_PREFIX = 'mall';
const COIN_TYPE = 118; // Cosmos SDK standard coin type

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

  // Normalize case and collapse whitespace before checksum validation — the
  // underlying bip39 library's validateMnemonic() is case-sensitive and does
  // not tolerate irregular whitespace between words on its own.
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  const wordCount = words.length;
  const normalized = words.join(' ');

  // BIP39 standard supports 12, 15, 18, 21, or 24 words
  if (![12, 15, 18, 21, 24].includes(wordCount)) {
    return {
      valid: false,
      wordCount,
      message: `Invalid word count. Expected 12, 15, 18, 21, or 24 words, got ${wordCount}`,
    };
  }

  try {
    const isValid = validateMnemonic(normalized);
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
 * Derive a wallet address from mnemonic using the Cosmos SDK HD path
 * (m/44'/118'/0'/0/{index}), matching the backend's derivation so the
 * same mnemonic yields the same "mall1..." address on both sides.
 * @param mnemonic - The BIP39 mnemonic
 * @param index - Account index (default 0)
 * @returns Wallet info with address and public key
 */
export async function deriveAddressFromMnemonic(
  mnemonic: string,
  index: number = 0
): Promise<WalletInfo> {
  try {
    // Validate mnemonic first
    const validation = validateMnemonicPhrase(mnemonic);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const normalizedMnemonic = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
    const path = `m/44'/${COIN_TYPE}'/0'/0/${index}`;
    const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(normalizedMnemonic, {
      prefix: ADDRESS_PREFIX,
      hdPaths: [stringToPath(path)],
    });

    const [account] = await hdWallet.getAccounts();

    return {
      address: account.address,
      publicKey: toHex(account.pubkey),
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
export async function importWalletFromMnemonic(
  mnemonic: string,
  walletName: string = 'Imported Wallet'
): Promise<ImportWalletResult> {
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
    const walletInfo = await deriveAddressFromMnemonic(mnemonic, 0);

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
      derivationPath: `m/44'/${COIN_TYPE}'/0'/0/0`,
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
 * @returns Formatted address (e.g., "mall1ab...xyz789")
 */
export function formatAddressForDisplay(address: string): string {
  if (!address || address.length <= 12) {
    return address;
  }
  return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}

/**
 * Check if address is a valid "mall1..." bech32 address for this chain
 * @param address - Address to validate
 * @returns Boolean validity
 */
export function isValidMallAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  try {
    const { prefix } = fromBech32(address);
    return prefix === ADDRESS_PREFIX;
  } catch {
    return false;
  }
}

/**
 * Get mnemonic word list for validation
 * Returns the standard BIP39 English word list
 * @returns Array of valid BIP39 words
 */
export function getBip39WordList(): string[] {
  return wordlists.english;
}

/**
 * Count words in mnemonic string
 * @param mnemonic - Mnemonic string
 * @returns Word count
 */
export function countMnemonicWords(mnemonic: string): number {
  const trimmed = mnemonic ? mnemonic.trim() : '';
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
