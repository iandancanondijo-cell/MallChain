/* eslint-env node */
/* global require, module, process, Buffer */
/**
 * Field-level encryption for sensitive PII at rest (production-readiness
 * finding E2/E1: user phone/email/walletAddress and KYC identity documents
 * were stored as plain strings — a single DB compromise exposed everything
 * in bulk).
 *
 * AES-256-GCM for the data itself: authenticated (tamper-evident) and
 * semantically secure — the same plaintext produces different ciphertext
 * every time because of the random IV, so encrypted values can't be
 * compared or clustered by an attacker who only has the DB.
 *
 * A separate deterministic HMAC-SHA256 "blind index" exists for the small
 * number of fields the app needs to look up by exact value (email,
 * walletAddress). A blind index only supports equality search — never
 * partial/substring/prefix matching — since changing even one input
 * character produces a completely unrelated hash. That's an intentional,
 * unavoidable trade-off of any at-rest field encryption scheme; call sites
 * that relied on partial matching (e.g. admin "search by partial email")
 * had to change to exact-match lookups because of it.
 *
 * The encryption key and the blind-index key are deliberately different —
 * reusing one key for both would let an attacker who recovers the
 * blind-index key (needed for search, so more exposed) also decrypt data.
 */
const crypto = require('crypto');
const { config } = require('../config');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV, the size GCM is designed and recommended for
const KEY_VERSION = 'v1'; // prefixed onto ciphertext so a future key rotation can support multiple generations without a big-bang re-encryption

function keyFromHex(name, hex) {
  if (!hex) throw new Error(`${name} is not configured`);
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes (64 hex characters)`);
  return buf;
}

function getEncryptionKey() {
  return keyFromHex('FIELD_ENCRYPTION_KEY', config.secrets.fieldEncryptionKey);
}

function getBlindIndexKey() {
  return keyFromHex('FIELD_BLIND_INDEX_KEY', config.secrets.fieldBlindIndexKey);
}

/** Encrypts a value for storage. Passing through null/undefined lets optional fields stay unset. */
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${KEY_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a stored value. A string that doesn't match our versioned format
 * is returned unchanged rather than throwing — during a migration window
 * (or if a record predates encryption being enabled) this means an
 * un-migrated record shows its plaintext instead of every read 500ing.
 */
function decryptField(stored) {
  if (stored === null || stored === undefined) return stored;
  if (typeof stored !== 'string' || !stored.startsWith(`${KEY_VERSION}:`)) return stored;

  const parts = stored.split(':');
  if (parts.length !== 4) return stored;
  const [, ivB64, tagB64, ctB64] = parts;

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Deterministic lookup hash for exact-match queries against an encrypted
 * field. Callers should normalize case/whitespace themselves before calling
 * this (e.g. lowercase an email) so the same logical value always produces
 * the same index regardless of how it happened to be typed.
 */
function blindIndex(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return undefined;
  const key = getBlindIndexKey();
  return crypto.createHmac('sha256', key).update(String(plaintext).trim()).digest('hex');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${KEY_VERSION}:`);
}

module.exports = { encryptField, decryptField, blindIndex, isEncrypted, KEY_VERSION };
