#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const genesisPath = process.argv[2];
const pubKeyValue = process.argv[3];

if (!genesisPath || !pubKeyValue) {
  console.error('Usage: node add_validator_to_genesis.js <genesis_path> <pub_key_base64>');
  process.exit(1);
}

const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf8'));

// Add validator with voting power
const validator = {
  address: "241614656432FB2B231C662CE172FD4AC892E936",
  pub_key: {
    type: "tendermint/PubKeyEd25519",
    value: pubKeyValue
  },
  power: "1000000",
  name: "validator1"
};

genesis.validators = [validator];
genesis.app_hash = "";

fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2));
console.log('✓ Validator added to genesis');
console.log(`  Public Key: ${pubKeyValue}`);
console.log(`  Power: ${validator.power}`);
