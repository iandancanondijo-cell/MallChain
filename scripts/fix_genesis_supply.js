#!/usr/bin/env node

/**
 * Fix Genesis Supply Mismatch
 * Adjusts account balances to match the declared supply in genesis.json
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.log('Usage: node fix_genesis_supply.js <genesis.json path>');
  process.exit(1);
}

const genesisPath = process.argv[2];

if (!fs.existsSync(genesisPath)) {
  console.error(`Genesis file not found: ${genesisPath}`);
  process.exit(1);
}

const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf-8'));

// Calculate current balances from all coins
const balancesByDenom = {};

(genesis.app_state.bank.balances || []).forEach(balance => {
  (balance.coins || []).forEach(coin => {
    if (!balancesByDenom[coin.denom]) {
      balancesByDenom[coin.denom] = BigInt(0);
    }
    balancesByDenom[coin.denom] += BigInt(coin.amount);
  });
});

console.log('Current balances by denomination:');
Object.entries(balancesByDenom).forEach(([denom, amount]) => {
  console.log(`  ${denom}: ${amount.toString()}`);
});

// Handle missing or empty supply array - regenerate from balances
const supply = genesis.app_state.bank.supply || [];

if (supply.length === 0) {
  console.log('\nSupply array is empty. Regenerating from balances...');
  
  // Generate supply from current balances
  Object.entries(balancesByDenom).forEach(([denom, amount]) => {
    supply.push({
      denom: denom,
      amount: amount.toString()
    });
  });
  
  genesis.app_state.bank.supply = supply;
  console.log('✓ Supply array regenerated from balances');
  
  // Write it back and exit
  fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2), 'utf-8');
  console.log(`✓ Genesis file saved: ${genesisPath}`);
  process.exit(0);
}

// Normal flow: verify declared supply matches balances
const declaredSupply = {};
supply.forEach(s => {
  declaredSupply[s.denom] = BigInt(s.amount);
});

console.log('\nDeclared supply by denomination:');
Object.entries(declaredSupply).forEach(([denom, amount]) => {
  console.log(`  ${denom}: ${amount.toString()}`);
});

// Check if all denominations are present and balanced
let hasDiscrepancies = false;
const allDenoms = new Set([...Object.keys(balancesByDenom), ...Object.keys(declaredSupply)]);

allDenoms.forEach(denom => {
  const declared = declaredSupply[denom] || BigInt(0);
  const current = balancesByDenom[denom] || BigInt(0);
  
  if (declared !== current) {
    console.log(`\n⚠ Discrepancy for ${denom}:`);
    console.log(`  Declared: ${declared.toString()}`);
    console.log(`  Current:  ${current.toString()}`);
    console.log(`  Diff:     ${(current - declared).toString()}`);
    hasDiscrepancies = true;
  }
});

if (!hasDiscrepancies) {
  console.log('\n✓ Supply is already balanced');
  process.exit(0);
}

// Get the first account (validator)
const firstAccountAddr = genesis.app_state.bank.balances[0]?.address;

if (!firstAccountAddr) {
  console.error('No accounts found in genesis');
  process.exit(1);
}

console.log(`\nFix: Adding missing tokens to ${firstAccountAddr.substring(0, 20)}...`);

// Update the first account to include missing tokens
const firstAccount = genesis.app_state.bank.balances[0];

allDenoms.forEach(denom => {
  const declared = declaredSupply[denom] || BigInt(0);
  const current = balancesByDenom[denom] || BigInt(0);
  const diff = declared - current;
  
  if (diff > BigInt(0)) {
    const coin = firstAccount.coins.find(c => c.denom === denom);
    if (coin) {
      coin.amount = (BigInt(coin.amount) + diff).toString();
    } else {
      firstAccount.coins.push({ denom: denom, amount: diff.toString() });
    }
    console.log(`  + Added ${diff.toString()} ${denom}`);
  }
});

// Also update the declared supply array to match balances
genesis.app_state.bank.supply = Array.from(allDenoms).map(denom => ({
  denom: denom,
  amount: (balancesByDenom[denom] || BigInt(0)).toString()
}));

// Write back
fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2), 'utf-8');
console.log(`\n✓ Genesis file fixed: ${genesisPath}`);
