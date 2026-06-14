// WebCrypto-based secure keystore
// Provides PBKDF2 -> AES-GCM encryption for private keys stored in localStorage

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(b64) {
  const str = atob(b64)
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i)
  return arr.buffer
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  return bytes.buffer
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password, salt, iterations = 150000) {
  const passKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  return key
}

function randomBytes(len) {
  const b = new Uint8Array(len)
  crypto.getRandomValues(b)
  return b.buffer
}

async function encryptPrivateKeyHex(privateKeyHex, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(password, salt)
  const data = hexToBytes(privateKeyHex)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, data)
  return JSON.stringify({ v: 1, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) })
}

async function decryptPrivateKeyJson(payloadJson, password) {
  const obj = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson
  if (!obj || !obj.ct || !obj.iv || !obj.salt) throw new Error('Invalid payload')
  const salt = fromBase64(obj.salt)
  const iv = new Uint8Array(fromBase64(obj.iv))
  const ct = fromBase64(obj.ct)
  const key = await deriveKey(password, salt)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return bytesToHex(pt)
}

function storageKeyFor(address) {
  return `secure_keystore_v1:${address}`
}

async function storeEncryptedPrivateKey(address, privateKeyHex, password) {
  if (!address || !privateKeyHex || !password) throw new Error('address, privateKeyHex and password required')
  const payload = await encryptPrivateKeyHex(privateKeyHex, password)
  localStorage.setItem(storageKeyFor(address), payload)
  return true
}

async function retrievePrivateKey(address, password) {
  const payload = localStorage.getItem(storageKeyFor(address))
  if (!payload) return null
  const privHex = await decryptPrivateKeyJson(payload, password)
  return privHex
}

function removePrivateKey(address) {
  localStorage.removeItem(storageKeyFor(address))
}

// Attempt to migrate simple legacy encrypted payloads encrypted with CryptoJS.AES with an empty password
// This is best-effort and must be initiated by the user (they supply a new password)
async function migrateLegacyKey(address, legacyPayloadString, newPassword) {
  // legacyPayloadString expected to be base64 string from CryptoJS.AES.encrypt(str, '')
  try {
    // Try to decode assuming the legacy string is plaintext hex or JSON
    // We cannot reliably decrypt arbitrary legacy formats here; caller should provide decrypted private key if possible
    throw new Error('Automatic legacy migration not supported without plaintext key')
  } catch (e) {
    throw new Error('Legacy migration requires supplying the plaintext private key to re-encrypt')
  }
}

export {
  storeEncryptedPrivateKey,
  retrievePrivateKey,
  removePrivateKey,
  migrateLegacyKey,
}
