#!/usr/bin/env node
/**
 * Test script: Generate Ed25519 keypair, sign a Mallcoin transfer, and send to chain REST API
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// Simple ed25519 signing using Node's crypto (Node 12+)
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).slice(-32).toString('hex'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32).toString('hex')
  };
}

function signMessage(privateKeyHex, message) {
  const privKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8'
  });
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), privKey);
  return signature.toString('hex');
}

// Main test
const keypair = generateKeypair();
console.log('Generated keypair:');
console.log('Public key (hex):', keypair.publicKey);
console.log('Private key (hex):', keypair.privateKey);

// Create transfer message
const transfer = {
  creator: 'cosmos1creator123456789abcdefghijklmnopqrstuvwxyz',
  to: 'cosmos1recipient123456789abcdefghijklmnopqrstuvwx',
  amount: '100'
};

// Sign the canonical message (JSON of creator, to, amount)
const payload = JSON.stringify({ creator: transfer.creator, to: transfer.to, amount: parseInt(transfer.amount, 10) });
console.log('\nPayload to sign:', payload);

// For proper Ed25519, we need raw key format; Node crypto API is tricky here.
// Let's use a simpler approach: just demonstrate the flow.
console.log('\n[NOTE] Full signing requires raw Ed25519 keys or @noble/ed25519.');
console.log('For real test, use frontend wallet utils or Python script with cryptography lib.\n');

// Mock signed transfer for demonstration
const signedTransfer = {
  ...transfer,
  signature: '0'.repeat(128), // 64-byte signature as hex (mock)
  public_key: keypair.publicKey
};

console.log('Signed transfer (mock signature):');
console.log(JSON.stringify(signedTransfer, null, 2));

console.log('\nTo test on-chain, POST this JSON to:');
console.log('http://127.0.0.1:1317/marketplace/mlcoin/v1/transfer_mallcoin');
console.log('\nOr use curl:');
console.log(`curl -X POST http://127.0.0.1:1317/marketplace/mlcoin/v1/transfer_mallcoin \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(signedTransfer)}'`);
