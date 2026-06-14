import * as bip39 from 'bip39'
import * as ed from '@noble/ed25519'

// Generate mnemonic (BIP39)
export function generateMnemonic(){
  return bip39.generateMnemonic()
}

// Convert mnemonic -> 32-byte seed hex (use first 32 bytes as Ed25519 seed)
export async function mnemonicToSeedHex(mnemonic){
  const seed = await bip39.mnemonicToSeed(mnemonic)
  return Buffer.from(seed).slice(0,32).toString('hex')
}

// Derive keypair (priv hex = 32-byte seed hex; pub hex computed via noble)
export async function genKeypairFromMnemonic(mnemonic){
  const privHex = await mnemonicToSeedHex(mnemonic)
  const pub = await ed.getPublicKey(privHex)
  return { priv: privHex, pub: Buffer.from(pub).toString('hex') }
}

function hexToBytes(hex){
  if(!hex) return new Uint8Array()
  const bytes = new Uint8Array(hex.length/2)
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2),16)
  return bytes
}

function bytesToHex(bytes){
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
}

function randomBytes(n){
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return b
}

async function deriveAesKey(password, salt){
  const enc = new TextEncoder()
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), {name: 'PBKDF2'}, false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  )
  return key
}

// Encrypt private key bytes (AES-GCM) with password-derived key (PBKDF2). Returns hex strings.
export async function encryptPrivateKey(privHex, password){
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveAesKey(password, salt)
  const privBytes = hexToBytes(privHex)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, privBytes)
  return {
    ciphertext: bytesToHex(new Uint8Array(ct)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt)
  }
}

// Decrypt private key (returns privHex) given ciphertext object and password
export async function decryptPrivateKey(ciphertextHex, ivHex, saltHex, password){
  const salt = hexToBytes(saltHex)
  const iv = hexToBytes(ivHex)
  const key = await deriveAesKey(password, salt)
  const ct = hexToBytes(ciphertextHex)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return bytesToHex(new Uint8Array(plain))
}

// Stable JSON stringify with sorted object keys (deterministic canonicalization)
function stableStringify(value){
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(v => stableStringify(v)).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

// Sign a JS object payload (canonical JSON) using Ed25519 seed (privHex)
export async function signPayload(privHex, payload){
  const msg = stableStringify(payload)
  const msgBytes = new TextEncoder().encode(msg)
  const sig = await ed.sign(msgBytes, privHex)
  return bytesToHex(sig)
}

// Sign arbitrary bytes (hex input)
export async function signHexMessage(privHex, messageHex){
  const msgBytes = hexToBytes(messageHex)
  const sig = await ed.sign(msgBytes, privHex)
  return bytesToHex(sig)
}

// Utility: get public key hex from privHex
export async function pubFromPrivHex(privHex){
  const pub = await ed.getPublicKey(privHex)
  return bytesToHex(pub)
}

// --- Cosmos / secp256k1 helpers (dynamic import of CosmJS) ---
// Derive account info (address, pubkey) using DirectSecp256k1HdWallet from @cosmjs/proto-signing
export async function deriveCosmosAccountFromMnemonic(mnemonic, prefix = 'mall'){
  try{
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing')
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix })
    const accounts = await wallet.getAccounts()
    if(accounts && accounts.length>0) {
      // Normalize pubkey to hex string for safe JSON serialization/storage
      const a = accounts[0]
      return { address: a.address, algo: a.algo, pubkey: bytesToHex(a.pubkey) }
    }
    return null
  }catch(e){
    console.error('deriveCosmosAccountFromMnemonic:', e)
    throw new Error('CosmJS not available in browser. Please install @cosmjs/proto-signing in the frontend.')
  }
}

// Create an encrypted keystore that holds the mnemonic (AES-GCM). Returns JSON-ready object.
export async function createKeystoreFromMnemonic(mnemonic, password, prefix = 'mall'){
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveAesKey(password, salt)
  const enc = new TextEncoder().encode(mnemonic)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc)
  const addrObj = await deriveCosmosAccountFromMnemonic(mnemonic, prefix)
  return {
    crypto: {
      ciphertext: bytesToHex(new Uint8Array(ct)),
      iv: bytesToHex(iv),
      salt: bytesToHex(salt),
      kdf: 'pbkdf2',
      algo: 'aes-gcm'
    },
    address: addrObj ? addrObj.address : null,
    // pubkey stored as hex string for portability
    pubkey: addrObj ? addrObj.pubkey : null,
    algo: 'secp256k1',
    hd_path: "m/44'/118'/0'/0/0",
    version: 1
  }
}

// Decrypt keystore and return mnemonic string
export async function decryptKeystore(keystoreObj, password){
  const c = keystoreObj.crypto
  if(!c) throw new Error('invalid keystore format')
  const plain = await decryptPrivateKey(c.ciphertext, c.iv, c.salt, password)
  // decryptPrivateKey returns hex bytes; we stored utf8 mnemonic bytes, so convert
  // The decryptPrivateKey returns hex; convert to bytes then to string
  const bytes = hexToBytes(plain)
  return new TextDecoder().decode(bytes)
}

// Sign & broadcast MsgTransferMallcoin using SigningStargateClient
// params: { mnemonic, rpcEndpoint, recipient, amount, fee, memo, prefix }
export async function sendTransferMallcoin({ mnemonic, rpcEndpoint, recipient, amount, fee, memo = '', prefix = 'mall', mocks = null }){
  try{
    let SigningStargateClient, DirectSecp256k1HdWallet, Registry, proto
    if(mocks){
      SigningStargateClient = mocks.SigningStargateClient
      DirectSecp256k1HdWallet = mocks.DirectSecp256k1HdWallet
      Registry = mocks.Registry
      proto = mocks.proto
    } else {
      const [{ SigningStargateClient: S }, { DirectSecp256k1HdWallet: D, Registry: R }] = await Promise.all([
        import('@cosmjs/stargate'),
        import('@cosmjs/proto-signing')
      ])
      SigningStargateClient = S
      DirectSecp256k1HdWallet = D
      Registry = R
      proto = await import('../proto/mlcoin/tx.js')
    }

    // Registry expects entries of [typeUrl, { encode }]
    const registry = new Registry([[proto.typeUrl, { encode: proto.encode }]])

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix })
    const accounts = await wallet.getAccounts()
    if(!accounts || accounts.length === 0) throw new Error('unable to derive account from mnemonic')
    const sender = accounts[0].address

    const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet, { registry })

    const msg = {
      creator: sender,
      amount: amount.toString(),
      to: recipient
    }

    // default fee if not provided
    const defaultFee = { amount: [{ denom: 'mlc', amount: '0' }], gas: '200000' }
    const usedFee = fee || defaultFee

    const res = await client.signAndBroadcast(sender, [{ typeUrl: proto.typeUrl, value: msg }], usedFee, memo)
    return res
  }catch(e){
    console.error('sendTransferMallcoin failed:', e)
    throw e
  }
}
