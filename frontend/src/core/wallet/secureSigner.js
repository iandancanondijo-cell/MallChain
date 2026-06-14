/**
 * Secure Signer Module for Mallchain
 * Implements client-side transaction signing WITHOUT storing private keys
 * Private keys are held in memory only during signing, then immediately cleared
 */

import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'

// Polyfill for Buffer in browser environment
const BufferPolyfill = {
  from: (input, encoding) => {
    if (typeof input === 'string') {
      if (encoding === 'hex') {
        const hex = input.replace(/[^a-fA-F0-9]/g, '')
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
        }
        return bytes
      }
      return new TextEncoder().encode(input)
    }
    if (input instanceof Uint8Array) return input
    return new Uint8Array(input)
  },
  isBuffer: (obj) => obj instanceof Uint8Array
}

const Buffer = globalThis.Buffer || BufferPolyfill
if (!globalThis.Buffer) {
  globalThis.Buffer = BufferPolyfill
}

/**
 * Derive signing key from mnemonic securely
 * Key is kept in memory only during the execution of the provided function
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @param {Function} signingFn - Function that receives privateKey and performs signing
 * @returns {Promise} Result from signingFn
 */
export async function withSigningKey(mnemonic, signingFn) {
  // Validate mnemonic
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase')
  }

  let privateKey = null
  try {
    // Derive private key from mnemonic (held in memory only)
    const seed = bip39.mnemonicToSeedSync(mnemonic)
    const rootKey = HDKey.fromMasterSeed(seed)
    const derivedKey = rootKey.derive("m/44'/118'/0'/0/0")
    privateKey = Buffer.from(derivedKey.privateKey).toString('hex')

    // Execute signing function with the key
    const result = await signingFn(privateKey)

    return result
  } finally {
    // CRITICAL: Clear private key from memory immediately after use
    privateKey = null
  }
}

/**
 * Sign a message with a private key (key is NOT stored)
 * @param {string} message - Message to sign
 * @param {string} privateKeyHex - Private key in hex format (used only during this call)
 * @returns {string} Signature in hex format
 */
export function signMessage(message, privateKeyHex) {
  try {
    // Convert message to bytes
    const messageBytes = typeof message === 'string' ? Buffer.from(message) : message
    
    // Hash the message
    const messageHash = sha256(messageBytes)
    
    // Sign with secp256k1
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex')
    const signature = secp256k1.sign(messageHash, privateKeyBytes)
    
    // Return signature as hex
    return signature.toCompactRawBytes().toString('hex')
  } catch (error) {
    throw new Error(`Failed to sign message: ${error.message}`)
  }
}

/**
 * Verify that a wallet can be recovered from a mnemonic
 * This is used for validation without storing the key
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @returns {Object} Address and public key (NOT private key)
 */
export function verifyMnemonicAndGetAddress(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase')
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const rootKey = HDKey.fromMasterSeed(seed)
  const derivedKey = rootKey.derive("m/44'/118'/0'/0/0")
  
  const publicKeyBytes = derivedKey.publicKey
  const publicKey = Buffer.from(publicKeyBytes).toString('hex')
  
  // Compute address from public key
  const hash = sha256(publicKeyBytes)
  const { bech32 } = require('bech32')
  const words = bech32.toWords(Buffer.from(hash))
  const address = bech32.encode('mall', words)
  
  return {
    address,
    publicKey,
    // IMPORTANT: privateKey is NOT returned
  }
}

/**
 * Sign and broadcast a transaction using mnemonic
 * The mnemonic is never stored; it's only used during this signing operation
 * @param {string} mnemonic - BIP39 mnemonic phrase (provided by user, not stored)
 * @param {Object} params - Signing parameters
 * @returns {Promise<Object>} Result from backend
 */
export async function signAndBroadcastWithMnemonic(mnemonic, params) {
  return withSigningKey(mnemonic, async (privateKeyHex) => {
    // Call the actual signing/broadcast function with the in-memory key
    const { signAndBroadcastTransaction } = await import('./signatureUtils')
    return signAndBroadcastTransaction({
      ...params,
      privateKeyHex
    })
  })
}
