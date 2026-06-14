#!/usr/bin/env node

/**
 * Fix Validator Key Mismatch
 * Updates the genesis validator's consensus pubkey to match the node's key
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 5) {
  console.log('Usage: node fix_validator_key.js <genesis.json path> <node_priv_validator_key.json path> <genesis_out.json path>');
  process.exit(1);
}

const genesisPath = process.argv[2];
const privKeyPath = process.argv[3];
const outputPath = process.argv[4];

if (!fs.existsSync(genesisPath)) {
  console.error(`Genesis file not found: ${genesisPath}`);
  process.exit(1);
}

if (!fs.existsSync(privKeyPath)) {
  console.error(`Private validator key not found: ${privKeyPath}`);
  process.exit(1);
}

const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf-8'));
const privKey = JSON.parse(fs.readFileSync(privKeyPath, 'utf-8'));

console.log('Current genesis validator pubkey:', genesis.app_state.staking.validators[0].consensus_pubkey.key);
console.log('Node private validator pubkey:', privKey.pub_key.value);

// Update the first validator's consensus pubkey to match the node's key
const nodePubKeyBase64 = privKey.pub_key.value;

if (genesis.app_state.staking.validators && genesis.app_state.staking.validators.length > 0) {
  genesis.app_state.staking.validators[0].consensus_pubkey.key = nodePubKeyBase64;
  console.log('✓ Updated validator consensus pubkey');
  
  // Also update the initial_val_set in validators field if it exists
  if (genesis.validators && genesis.validators.length > 0) {
    genesis.validators[0].pub_key.value = nodePubKeyBase64;
    console.log('✓ Updated initial validators entry');
  }
}

fs.writeFileSync(outputPath, JSON.stringify(genesis, null, 2), 'utf-8');
console.log(`✓ Genesis file saved: ${outputPath}`);
