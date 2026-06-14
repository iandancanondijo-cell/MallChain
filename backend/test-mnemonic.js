#!/usr/bin/env node

/**
 * Test mnemonic to get blockchain address
 * Usage: node test-mnemonic.js "mnemonic phrase"
 */

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');

async function testMnemonic(mnemonic) {
  console.log(`\n📋 Testing Mnemonic\n`);
  
  const prefixes = ['mall', 'marketplace'];
  
  for (const prefix of prefixes) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
      const accounts = await wallet.getAccounts();
      const address = accounts[0].address;
      
      console.log(`✅ ${prefix.padEnd(15)} → ${address}`);
      
      // Check for known wallets
      if (address === 'mall17dp94qekjrsz8uzvq6xa3pt632uqrvve8vxk0z') {
        console.log(`   🎯 MATCH: FOUNDER WALLET!\n`);
      } else if (address === 'mall1fkq7475t4xtknnr0g4amj58zwkz3aldvdamh6y') {
        console.log(`   🎯 MATCH: TEAM WALLET!\n`);
      } else if (address === 'mall143txxzphc3vnk0gy9ek0ez2e39v2xvfxn8n2a3') {
        console.log(`   🎯 MATCH: AFA WALLET!\n`);
      }
    } catch (e) {
      console.log(`❌ ${prefix.padEnd(15)} → Error`);
    }
  }
}

const args = process.argv.slice(2);
if (!args[0]) {
  console.log(`Usage: node test-mnemonic.js "mnemonic phrase"`);
  process.exit(1);
}

testMnemonic(args[0]).catch(console.error);
