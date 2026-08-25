/**
 * Client-side crypto for the on-chain key-recovery vault (x/vault). Every
 * primitive here — Argon2id derivation, AES-GCM encrypt/decrypt, TOTP
 * generation/verification, ed25519 keygen/sign — runs entirely in the
 * browser and never leaves it. The chain only ever receives the ciphertext
 * these functions produce; see proto/marketplace/vault/v1/tx.proto for why
 * a password or plaintext TOTP secret must never be submitted in a Msg.
 *
 * Byte formats are chosen to match x/vault/crypto/crypto.go exactly:
 * Argon2id params (time/memory-in-KiB/threads/keyLen) and AES-GCM (12-byte
 * nonce, tag appended to ciphertext) are identical on both sides, even
 * though the chain never actually decrypts anything itself — this keeps a
 * blob recoverable by any client, not just this one.
 */
import { argon2id } from 'hash-wasm';
import { Secret, TOTP } from 'otpauth';
import * as ed25519 from '@noble/ed25519';

export interface Argon2Params {
  time: number;
  memory: number; // KiB
  threads: number;
  keyLen: number;
}

// Mirrors x/vault/crypto.productionParams. Lighter than the server-side
// default would be reckless (this key protects the same secret either way,
// public and permanent on-chain), so this stays in step with that value on
// purpose — check crypto.go before changing either side.
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  time: 5,
  memory: 128 * 1024, // 128 MiB
  threads: 8,
  keyLen: 32,
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Derives an AES-GCM key from `password` — the only place the password exists in memory. */
export async function deriveKey(password: string, salt: Uint8Array, params: Argon2Params = DEFAULT_ARGON2_PARAMS): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: params.time,
    parallelism: params.threads,
    memorySize: params.memory,
    hashLength: params.keyLen,
    outputType: 'binary',
  });
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM encrypt. Returns a fresh random 12-byte nonce and the ciphertext (auth tag included, matching Go's cipher.Seal). */
export async function encrypt(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const key = await importAesKey(keyBytes);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, plaintext as BufferSource);
  return { nonce, ciphertext: new Uint8Array(ct) };
}

export async function decrypt(nonce: Uint8Array, ciphertext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  const key = await importAesKey(keyBytes);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, ciphertext as BufferSource);
  return new Uint8Array(pt);
}

export { toBase64, fromBase64 };

/** Generates a fresh TOTP secret and its otpauth:// provisioning URI (for a QR code) — entirely locally. */
export function generateTotpSecret(accountName: string, issuer: string): { secret: string; uri: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer, label: accountName, secret });
  return { secret: secret.base32, uri: totp.toString() };
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32) });
  return totp.validate({ token: code, window: 1 }) !== null;
}

export function generateTotpCode(secretBase32: string): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32) });
  return totp.generate();
}

export interface Ed25519Keypair {
  privateKey: Uint8Array; // 32-byte seed
  publicKey: Uint8Array; // 32 bytes
}

export async function generateEd25519Keypair(): Promise<Ed25519Keypair> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

export async function signEd25519(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  return ed25519.signAsync(message, privateKey);
}

export async function verifyEd25519(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  return ed25519.verifyAsync(signature, message, publicKey);
}
