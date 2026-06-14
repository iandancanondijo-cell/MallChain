import * as bip39 from 'bip39'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'

export const MALL_PREFIX = 'mall'
export const DERIVATION_PATH = "m/44'/118'/0'/0/0"

function _require(name) {
  if (typeof require !== 'undefined') return require(name)
  throw new Error('require not available')
}

export function generateEntropy(bits = 256) {
  const bytes = Math.ceil(bits / 8)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(bytes)
    globalThis.crypto.getRandomValues(arr)
    return arr
  }
  try {
    const crypto = _require('crypto')
    return new Uint8Array(crypto.randomBytes(bytes))
  } catch (e) {
    throw new Error('No secure RNG available')
  }
}

export function generateRandomBytes(lenBytes = 32) {
  // Convenience to request a byte-length buffer
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(lenBytes)
    globalThis.crypto.getRandomValues(arr)
    return arr
  }
  try {
    const crypto = _require('crypto')
    return new Uint8Array(crypto.randomBytes(lenBytes))
  } catch (e) {
    throw new Error('No secure RNG available')
  }
}

// generate mnemonic from entropy (BIP39)
export async function generateMnemonic(bits = 256) {
  // Prefer the library generator which handles entropy generation cross-platform.
  try {
    if (typeof bip39.generateMnemonic === 'function') {
      return bip39.generateMnemonic(bits)
    }
  } catch (e) {
    // fall back to manual entropy path below
    console.debug('bip39.generateMnemonic failed, falling back to manual entropy:', e && e.message)
  }

  const entropy = generateEntropy(bits)
  let hex
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    hex = Buffer.from(entropy).toString('hex')
  } else {
    // Fallback for environments without Buffer
    hex = Array.from(entropy).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const expectedLen = (bits / 8) * 2
  if (!hex || hex.length !== expectedLen) {
    console.debug('generateMnemonic: unexpected entropy hex length', { expectedLen, got: hex ? hex.length : 0 })
    throw new Error('Invalid entropy length')
  }
  return bip39.entropyToMnemonic(hex)
}

export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic)
}

export async function mnemonicToSeed(mnemonic, passphrase = '') {
  return await bip39.mnemonicToSeed(mnemonic, passphrase)
}

export async function walletFromMnemonic(mnemonic, options = {}) {
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid mnemonic')
  const prefix = options.prefix || MALL_PREFIX
  const bip39Password = options.bip39Password || ''
  // Let cosmjs use its default hdPaths (makeCosmoshubPath)
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
    bip39Password,
  })
  const accounts = await wallet.getAccounts()
  return {
    mnemonic,
    wallet,
    accounts,
  }
}

export function zeroizeUint8Array(arr) {
  if (!arr) return
  if (arr.fill) arr.fill(0)
}

// --- Keystore: AES-GCM + PBKDF2 (fallback to PBKDF2 if Argon2 not available) ---
function toBase64(u8) {
  return Buffer.from(u8).toString('base64')
}

function fromBase64(s) {
  return new Uint8Array(Buffer.from(s, 'base64'))
}

async function deriveKeyPBKDF2(password, salt, iterations = 200000, keyLen = 32) {
  // Node.js path
  try {
    const crypto = _require('crypto')
    return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt), iterations, keyLen, 'sha256')
  } catch (e) {
    // Browser WebCrypto path
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      const enc = new TextEncoder()
      const pwKey = await globalThis.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
      const derived = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' }, pwKey, keyLen * 8)
      return new Uint8Array(derived)
    }
    throw new Error('No KDF available')
  }
}

async function encryptAesGcmRaw(keyBytes, plaintext, iv) {
  // Prefer Node.js crypto when available
  if (typeof _require === 'function') {
    try {
      const crypto = _require('crypto')
      if (crypto && typeof crypto.createCipheriv === 'function') {
        const keyBuf = Buffer.from(keyBytes)
        const ivBuf = Buffer.from(iv)
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, ivBuf)
        const ct1 = cipher.update(Buffer.from(plaintext))
        const ct2 = cipher.final()
        const tag = cipher.getAuthTag()
        return Buffer.concat([ct1, ct2, tag])
      }
    } catch (e) {
      // fall through to webcrypto
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const alg = { name: 'AES-GCM', iv, tagLength: 128 }
    const cryptoKey = await globalThis.crypto.subtle.importKey('raw', keyBytes, alg, false, ['encrypt'])
    const ct = await globalThis.crypto.subtle.encrypt(alg, cryptoKey, plaintext)
    return new Uint8Array(ct)
  }
  throw new Error('No crypto available for AES-GCM')
}

async function decryptAesGcmRaw(keyBytes, ciphertextWithTag, iv) {
  // Prefer Node.js crypto when available
  if (typeof _require === 'function') {
    try {
      const crypto = _require('crypto')
      if (crypto && typeof crypto.createDecipheriv === 'function') {
        const tagLen = 16
        const tag = ciphertextWithTag.slice(ciphertextWithTag.length - tagLen)
        const ct = ciphertextWithTag.slice(0, ciphertextWithTag.length - tagLen)
        const keyBuf = Buffer.from(keyBytes)
        const ivBuf = Buffer.from(iv)
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, ivBuf)
        decipher.setAuthTag(tag)
        const pt1 = decipher.update(ct)
        const pt2 = decipher.final()
        return Buffer.concat([pt1, pt2])
      }
    } catch (e) {
      // fall through to webcrypto
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const alg = { name: 'AES-GCM', iv, tagLength: 128 }
    const cryptoKey = await globalThis.crypto.subtle.importKey('raw', keyBytes, alg, false, ['decrypt'])
    const pt = await globalThis.crypto.subtle.decrypt(alg, cryptoKey, ciphertextWithTag)
    return new Uint8Array(pt)
  }
  throw new Error('No crypto available for AES-GCM')
}

export async function encryptKeystore(mnemonic, password, opts = {}) {
  if (!mnemonic) throw new Error('mnemonic required')
  const saltLen = opts.saltLen || 16
  const ivLen = opts.ivLen || 12
  const iterations = opts.iterations || 200000
  const salt = generateRandomBytes(saltLen)
  const iv = generateRandomBytes(ivLen)
  const key = await deriveKeyPBKDF2(password, salt, iterations, 32)
  const plaintext = Buffer.from(JSON.stringify({ mnemonic }))
  const ct = await encryptAesGcmRaw(key, plaintext, Buffer.from(iv))
  return JSON.stringify({
    version: 1,
    kdf: 'pbkdf2',
    kdfparams: { salt: toBase64(salt), iterations },
    cipher: 'aes-256-gcm',
    iv: toBase64(iv),
    ciphertext: toBase64(ct),
  })
}

export async function decryptKeystore(serialized, password) {
  const doc = JSON.parse(serialized)
  if (!doc || doc.version !== 1) throw new Error('unsupported keystore')
  if (doc.kdf !== 'pbkdf2') throw new Error('unsupported kdf')
  const salt = fromBase64(doc.kdfparams.salt)
  const iterations = doc.kdfparams.iterations
  const iv = fromBase64(doc.iv)
  const ct = fromBase64(doc.ciphertext)
  const key = await deriveKeyPBKDF2(password, salt, iterations, 32)
  const pt = await decryptAesGcmRaw(key, Buffer.from(ct), Buffer.from(iv))
  const parsed = JSON.parse(Buffer.from(pt).toString('utf8'))
  return parsed
}
