#!/usr/bin/env node
const crypto = require('crypto');
const bip39 = require('bip39');

// Generate cryptographically secure random string
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate BIP39 mnemonic
function generateMnemonic() {
  return bip39.generateMnemonic(256); // 24 words
}

// Generate all secrets
const secrets = {
  JWT_SECRET: generateSecret(64),
  SESSION_SECRET: generateSecret(64),
  ADMIN_API_KEY: generateSecret(64),
  FAUCET_PRIVATE_KEY_HEX: generateSecret(32),
  FAUCET_MNEMONIC: generateMnemonic(),
  MINES_BROADCAST_SECRET: generateSecret(64),
  VITE_API_SECRET: generateSecret(64),
};

console.log('=== Generated Secrets ===');
console.log('Copy these to your .env files:\n');
for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}
