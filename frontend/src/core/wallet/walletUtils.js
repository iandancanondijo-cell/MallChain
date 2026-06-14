/**
 * Wallet Utilities for Mallchain
 * Handles wallet creation, signing, and transaction building
 * All wallet operations are performed client-side for security
 */

import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { bech32 } from 'bech32'
import { sha256 } from '@noble/hashes/sha2.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'

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

import { appConfig, toBaseUnits, fromBaseUnits } from '../../config/app'
import { storeEncryptedPrivateKey, retrievePrivateKey, removePrivateKey } from './secureKeystore'

const API_URL = appConfig.apiUrl
const CHAIN_REST = appConfig.chain.rest
const HRP = appConfig.chain.prefix
const BASE_DENOM = appConfig.chain.baseDenom
const CHAIN_ID = appConfig.chain.id

/**
 * Generate address from public key using bech32
 * @param {Uint8Array} publicKey - Public key bytes
 * @returns {string} Bech32 encoded address
 */
function generateAddressFromPublicKey(publicKey) {
  // Hash public key with SHA256
  const hash = sha256(publicKey)
  // Convert to bech32 words and encode
  const words = bech32.toWords(Buffer.from(hash))
  return bech32.encode(HRP, words)
}

/**
 * Derive wallet keys from mnemonic
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @param {number} accountIndex - Account index (default: 0)
 * @returns {Object} Wallet with address, publicKey, privateKey
 */
function deriveWalletFromMnemonic(mnemonic, accountIndex = 0) {
  // Validate mnemonic
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase')
  }

  // Generate seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  
  // Derive HD key using BIP32 path: m/44'/118'/account'/0/0
  // 118 is the coin type for Cosmos
  const rootKey = HDKey.fromMasterSeed(seed)
  const path = `m/44'/118'/${accountIndex}'/0/0`
  const derivedKey = rootKey.derive(path)
  
  // Get private and public keys
  const privateKey = Buffer.from(derivedKey.privateKey).toString('hex')
  const publicKey = Buffer.from(derivedKey.publicKey).toString('hex')
  
  // Generate address from public key
  const address = generateAddressFromPublicKey(Buffer.from(derivedKey.publicKey))
  
  return {
    address,
    publicKey,
    privateKey
  }
}

/**
 * Generate a new wallet with mnemonic
 * SECURITY: Private key is NOT returned or stored
 * @returns {Object} Wallet object with address, publicKey, mnemonic
 */
export function createWallet() {
  try {
    // Generate mnemonic (24 words)
    const mnemonic = bip39.generateMnemonic(256)
    
    // Derive wallet from mnemonic
    const wallet = deriveWalletFromMnemonic(mnemonic)
    
    console.log('Wallet created successfully:', wallet.address)
    
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      // IMPORTANT: privateKey is NOT returned - it's never exposed after derivation
      mnemonic: mnemonic
    }
  } catch (error) {
    console.error('Wallet creation error:', error)
    throw error
  }
}

/**
 * Import wallet from mnemonic
 * SECURITY: Private key is NOT returned or stored
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @returns {Object} Wallet object (without privateKey)
 */
export function importWallet(mnemonic) {
  try {
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase')
    }
    
    // Derive wallet from mnemonic
    const wallet = deriveWalletFromMnemonic(mnemonic)
    
    console.log('Wallet imported successfully:', wallet.address)
    
    return {
      address: wallet.address,
      publicKey: wallet.publicKey,
      // IMPORTANT: privateKey is NOT returned - it's never exposed after derivation
      mnemonic: mnemonic
    }
  } catch (error) {
    console.error('Wallet import error:', error)
    throw error
  }
}

/**
 * Save wallet to localStorage
 * SECURITY: Only stores address and publicKey; NEVER stores privateKey or mnemonic
 * @param {Object} wallet - Wallet object
 */
export function saveWallet(wallet) {
  // Only save address and publicKey - never save privateKey or mnemonic
  const safeWallet = {
    address: wallet.address,
    publicKey: wallet.publicKey,
    // IMPORTANT: mnemonic and privateKey are NEVER persisted
  }
  localStorage.setItem('wallet', JSON.stringify(safeWallet))
}

// Securely store private key encrypted with a user-supplied password
export async function secureStorePrivateKey(address, privateKeyHex, password) {
  return storeEncryptedPrivateKey(address, privateKeyHex, password)
}

// Retrieve decrypted private key (hex) using password
export async function secureRetrievePrivateKey(address, password) {
  return retrievePrivateKey(address, password)
}

export function secureRemovePrivateKey(address) {
  return removePrivateKey(address)
}

/**
 * Load wallet from localStorage
 * @returns {Object|null} Wallet object or null
 */
export function loadWallet() {
  const saved = localStorage.getItem('wallet')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      return null
    }
  }
  return null
}

/**
 * Clear wallet from localStorage
 */
export function clearWallet() {
  localStorage.removeItem('wallet')
}

/**
 * Build a send transaction
 * @param {Object} params - Transaction parameters
 * @returns {Object} Unsigned transaction
 */
export function buildSendTx({ fromAddress, toAddress, amount, memo = '', accountNumber, sequence }) {
  return {
    messages: [
      {
        typeUrl: '/cosmos.bank.v1beta1.MsgSend',
        value: {
          fromAddress: fromAddress,
          toAddress: toAddress,
          amount: [
            {
              denom: BASE_DENOM,
              amount: toBaseUnits(amount),
            }
          ]
        }
      }
    ],
    fee: {
      amount: [
        {
          denom: BASE_DENOM,
          amount: toBaseUnits(0.001),
        }
      ],
      gas: '200000'
    },
    memo: memo,
    accountNumber: accountNumber.toString(),
    sequence: sequence.toString(),
    chainId: CHAIN_ID
  }
}

/**
 * Get account info from chain
 * @param {string} address - Wallet address
 * @returns {Promise<Object>} Account info
 */
export async function getAccountInfo(address) {
  try {
    const response = await fetch(`${API_URL}/send/account/${address}`)
    const data = await response.json()
    
    if (data.success) {
      return {
        accountNumber: data.accountNumber,
        sequence: data.sequence,
        publicKey: data.pubkey,
        notFound: Boolean(data.notFound)
      }
    }
    
    throw new Error('Failed to get account info')
  } catch (error) {
    console.error('Get account info error:', error)
    throw error
  }
}

/**
 * Get wallet balance
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Array of balances
 */
export async function getBalance(address) {
  try {
    const response = await fetch(`${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`)
    const data = await response.json()
    
    return (data.balances || []).map(balance => ({
      denom: balance.denom,
      amount: fromBaseUnits(balance.amount),
      denomRaw: balance.denom
    }))
  } catch (error) {
    console.error('Get balance error:', error)
    return []
  }
}

/**
 * Broadcast a signed transaction
 * @param {string} signedTx - Signed transaction in base64
 * @returns {Promise<Object>} Broadcast result
 */
export async function broadcastTx(signedTx) {
  try {
    const response = await fetch(`${API_URL}/send/mallcoins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txBytes: signedTx
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      return {
        txHash: data.txHash,
        success: true
      }
    }
    
    throw new Error(data.error || 'Failed to broadcast transaction')
  } catch (error) {
    console.error('Broadcast error:', error)
    throw error
  }
}

/**
 * Sign a transaction with a private key
 * @param {Object} tx - Transaction object
 * @param {string} privateKey - Private key in hex format
 * @returns {Promise<string>} Signed transaction in base64
 */
export async function signTransaction(tx, privateKey) {
  try {
    const privKeyBytes = Buffer.from(privateKey, 'hex')
    
    // Create sign doc
    const signDoc = {
      chain_id: tx.chainId,
      account_number: tx.accountNumber,
      sequence: tx.sequence,
      fee: tx.fee,
      msgs: tx.messages,
      memo: tx.memo
    }
    
    const signDocJson = JSON.stringify(signDoc)
    const signDocBytes = new TextEncoder().encode(signDocJson)
    
    // Hash the sign doc
    const signDocHash = sha256(signDocBytes)
    
    // Sign the hash
    const signature = await secp256k1.sign(signDocHash, privKeyBytes)
    const signatureBytes = signature.toCompactRawBytes()
    
    // Create pubkey
    const pubKey = secp256k1.getPublicKey(privKeyBytes, true)
    
    // Build the signed transaction
    const signedTx = {
      body: {
        messages: tx.messages,
        memo: tx.memo
      },
      authInfo: {
        signerInfos: [{
          publicKey: {
            type: 'tendermint/PubKeySecp256k1',
            value: Buffer.from(pubKey).toString('base64')
          },
          modeInfo: {
            single: {
              mode: 'SIGN_MODE_DIRECT'
            }
          }
        }],
        fee: tx.fee
      },
      signatures: [Buffer.from(signatureBytes).toString('base64')]
    }
    
    return btoa(JSON.stringify(signedTx))
  } catch (error) {
    console.error('Sign transaction error:', error)
    throw new Error('Failed to sign transaction: ' + error.message)
  }
}

export default {
  createWallet,
  importWallet,
  saveWallet,
  loadWallet,
  clearWallet,
  buildSendTx,
  getAccountInfo,
  getBalance,
  broadcastTx,
  signTransaction
}
