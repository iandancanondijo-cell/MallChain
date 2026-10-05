#!/usr/bin/env node
/**
 * Disposable Test Wallet Generator
 * 
 * Creates test wallets for transaction acceptance testing.
 * Uses the same cryptographic infrastructure as production.
 * 
 * SECURITY: These are TEST-ONLY wallets. Never use in production.
 * Credentials stored in test/ directory, not committed to git.
 */

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { Bip39, EnglishMnemonic, Random, stringToPath } = require('@cosmjs/crypto');
const fs = require('fs');
const path = require('path');

const ADDRESS_PREFIX = 'mall';
const COIN_TYPE = 118;
const TEST_WALLETS_PATH = path.join(__dirname, 'test-wallets.json');

async function generateTestWallet(name) {
  console.log(`\nGenerating test wallet: ${name}`);
  
  // Generate random entropy for mnemonic (256 bits for 24 words)
  const entropy = Random.getBytes(32);
  const mnemonicString = Bip39.encode(entropy).toString();
  
  // Validate mnemonic
  const mnemonicObj = new EnglishMnemonic(mnemonicString);
  
  // Derive wallet using standard HD path m/44'/118'/0'/0/0
  const hdPath = `m/44'/${COIN_TYPE}'/0'/0/0`;
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonicString, {
    prefix: ADDRESS_PREFIX,
    hdPaths: [stringToPath(hdPath)]
  });
  
  const [account] = await wallet.getAccounts();
  
  console.log(`  Address: ${account.address}`);
  console.log(`  PubKey: ${Buffer.from(account.pubkey).toString('base64')}`);
  
  return {
    name,
    address: account.address,
    pubkey: Buffer.from(account.pubkey).toString('base64'),
    mnemonic: mnemonicString,
    hdPath: hdPath,
    createdAt: new Date().toISOString()
  };
}

async function main() {
  console.log('=== MALLCHAIN TEST WALLET GENERATOR ===');
  console.log('SECURITY WARNING: Test wallets only. Never use in production.\n');
  
  const wallets = {
    TEST_USER_A: await generateTestWallet('TEST_USER_A'),
    TEST_USER_B: await generateTestWallet('TEST_USER_B'),
    TEST_ADMIN: await generateTestWallet('TEST_ADMIN')
  };
  
  // Save to test directory (not committed)
  fs.writeFileSync(TEST_WALLETS_PATH, JSON.stringify(wallets, null, 2));
  
  console.log('\n=== WALLET SUMMARY ===');
  for (const [key, wallet] of Object.entries(wallets)) {
    console.log(`\n${key}:`);
    console.log(`  Address: ${wallet.address}`);
    console.log(`  PubKey: ${wallet.pubkey}`);
    console.log(`  HD Path: ${wallet.hdPath}`);
  }
  
  console.log(`\n✓ Test wallets saved to: ${TEST_WALLETS_PATH}`);
  console.log('✓ Mnemonics stored locally for signing tests');
  console.log('\nNEXT STEPS:');
  console.log('1. Fund these wallets via genesis or faucet');
  console.log('2. Test ADR-036 signing with these wallets');
  console.log('3. Execute native MLCNS transfers');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
