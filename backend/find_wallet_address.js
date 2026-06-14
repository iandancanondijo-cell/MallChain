#!/usr/bin/env node

/**
 * Script to find which blockchain address your mnemonic generates
 * Tries different derivation paths to match blockchain addresses
 * 
 * Usage: node find_wallet_address.js "mnemonic phrase"
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';

const BLOCKCHAIN_WALLETS = {
  'founder': 'mall17dp94qekjrsz8uzvq6xa3pt632uqrvve8vxk0z',
  'team': 'mall1fkq7475t4xtknnr0g4amj58zwkz3aldvdamh6y',
  'afa': 'mall143txxzphc3vnk0gy9ek0ez2e39v2xvfxn8n2a3',
};

async function testMnemonic(mnemonic, walletName = 'Test Wallet') {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 Testing: ${walletName}`);
    console.log(`${mnemonic.substring(0, 40)}...`);
    console.log(`${'='.repeat(70)}\n`);

    const prefixes = ['marketplace', 'mall', 'cosmos'];

    for (const prefix of prefixes) {
      try {
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
        const accounts = await wallet.getAccounts();
        const address = accounts[0].address;

        console.log(`✅ ${prefix.padEnd(15)} → ${address}`);

        // Check if this matches a known blockchain wallet
        const matches = Object.entries(BLOCKCHAIN_WALLETS).filter(([name, addr]) => addr === address);
        if (matches.length > 0) {
          console.log(`   🎯 MATCH FOUND: ${matches.map(m => m[0]).join(', ')}`);
        }
      } catch (e) {
        console.log(`❌ ${prefix.padEnd(15)} → Error: ${e.message.substring(0, 40)}`);
      }
    }

  } catch (e) {
    console.error(`Error: ${e.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
📖 Usage: node find_wallet_address.js "<mnemonic>"

This script tests your mnemonic phrase against different blockchain prefixes
and checks if it matches any known blockchain wallets.

Example:
  node find_wallet_address.js "concert load couple harbor equip island argue slogan kitten food gate coral"

Known Blockchain Wallets:
  Founder: ${BLOCKCHAIN_WALLETS.founder}
  Team:    ${BLOCKCHAIN_WALLETS.team}
  AFA:     ${BLOCKCHAIN_WALLETS.afa}
`);
    process.exit(1);
  }

  const mnemonic = args[0];
  const name = args[1] || 'Custom Mnemonic';

  await testMnemonic(mnemonic, name);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Results Summary:`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`If a MATCH FOUND appears above, use that mnemonic in the frontend:`);
  console.log(`  1. Go to Dashboard → Mnemonic Phrase tab`);
  console.log(`  2. Paste the mnemonic phrase`);
  console.log(`  3. Click "Import from Mnemonic"`);
  console.log(`\nIf no matches found, the mnemonic may be for a different network.\n`);
}

main().catch(console.error);
