#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process, console */
/**
 * Generates the SECURITY_CREDENTIAL value M-Pesa's B2C API requires
 * (backend/src/services/b2cPayoutService.js's `SecurityCredential` field,
 * config/index.js's `payment.safaricom.securityCredential`).
 *
 * Safaricom never accepts a plain initiator password — it must be RSA
 * encrypted (PKCS1 padding, no hashing) with Safaricom's own public
 * certificate, then base64-encoded. That's a one-time, offline step (this
 * script), not something b2cPayoutService.js does per-request — the result
 * is a fixed string you drop into .env once.
 *
 * Usage:
 *   node scripts/generate-mpesa-security-credential.js --cert=./mpesa-sandbox-cert.cer --password='Safaricom999!*!'
 *
 * --cert    Path to Safaricom's public certificate (.cer/.pem — X.509,
 *           PEM-encoded). For sandbox, download it from the Daraja portal's
 *           B2C API documentation page ("Sandbox Certificate" download
 *           link) — it's a PUBLIC key, safe to keep in this repo if you
 *           want, but .env is where the *output* of this script belongs.
 *           For production, Safaricom issues a separate production
 *           certificate through your go-live process — never reuse the
 *           sandbox one there.
 * --password  The initiator password (sandbox default: Safaricom999!*!).
 *             Never the same as your real M-Pesa PIN — this is a
 *             Daraja-specific credential Safaricom assigns per initiator.
 */
const fs = require('fs');
const crypto = require('crypto');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function main() {
  const { cert, password } = parseArgs();
  if (!cert || !password) {
    console.error('Usage: node scripts/generate-mpesa-security-credential.js --cert=<path-to-cert> --password=<initiator-password>');
    process.exit(1);
  }

  const certPem = fs.readFileSync(cert, 'utf8');
  const encrypted = crypto.publicEncrypt(
    { key: certPem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8')
  );
  const securityCredential = encrypted.toString('base64');

  console.log('\nSECURITY_CREDENTIAL=' + securityCredential + '\n');
  console.log('Paste the line above into .env, replacing the empty SECURITY_CREDENTIAL= placeholder.');
}

main();
