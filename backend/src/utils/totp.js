const crypto = require('crypto');

// RFC 6238 TOTP, implemented directly on Node's crypto (HMAC-SHA1, 6 digits,
// 30s step) rather than pulling in a dependency for something this small.
// This replaces what used to be entirely decorative "2FA": enabling it
// accepted any non-empty code with no secret ever generated or verified
// (confirmed live: enabling with junk code '000000' then logging in with
// just email+password succeeded — 2FA gave zero actual protection).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // tolerate ±1 step (±30s) of clock drift

function generateSecret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

function base32Decode(base32) {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0');
}

function currentStep() {
  return Math.floor(Date.now() / 1000 / STEP_SECONDS);
}

/** Verifies a 6-digit code against a base32 secret, tolerating small clock drift. */
function verifyToken(base32Secret, token) {
  if (!token || !/^\d{6}$/.test(String(token).trim())) return false;
  const secretBuffer = base32Decode(base32Secret);
  const step = currentStep();
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    if (hotp(secretBuffer, step + delta) === String(token).trim()) return true;
  }
  return false;
}

function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
}

/** otpauth:// URI for QR-code/authenticator-app enrollment. */
function keyUri(secret, accountLabel, issuer = 'Mallchain') {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, verifyToken, generateBackupCodes, keyUri };
