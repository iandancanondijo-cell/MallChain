/**
 * Test P2P Mallcoin transfers using provided wallets
 * Monitors gas fees (MAL) and identifies transaction blocking issues
 */

require('dotenv').config();
const axios = require('axios');
const { transferFromMnemonic } = require('./src/services/mallcoinTxBuilder');

const BACKEND_URL = 'http://localhost:4000';

// Provided wallets
const WALLETS = {
  FOUNDER: {
    address: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
    mnemonic: 'creek away short hammer ramp mechanic stage truck crouch occur army inch autumn define impulse aerobic situate wear mango valve anger sword can vessel',
    allocation: 160000000,
    status: 'locked'
  },
  AFA: {
    address: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
    mnemonic: 'acid great mixed body canal mango hole lawn ranch midnight code furnace shed above lazy wise sick dizzy document charge dog alien meat easily',
    allocation: 1500000,
    status: 'unlocked'
  },
  TEAM: {
    address: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5',
    mnemonic: 'black soft phrase ensure mixed path fabric kite layer agree bus planet need spoil habit stairs avoid fine solar bomb ethics occur rescue organ',
    allocation: 90000000,
    status: 'unlocked'
  },
  ORTHOPHARM: {
    address: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f',
    mnemonic: 'select toe river present maze crawl dice short lounge venture gossip leaf address civil infant crisp thought flight ribbon hen drift extend metal area',
    allocation: 3000000,
    status: 'unlocked'
  }
};

async function getMlcnsBalance(address) {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/mlcns/balance/${address}`);
    return response.data;
  } catch (error) {
    console.error(`Balance check failed for ${address}:`, error.response?.data || error.message);
    return null;
  }
}

async function getGasBalance(address) {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/gas-balance/${address}`);
    return response.data;
  } catch (error) {
    console.error(`Gas balance check failed for ${address}:`, error.response?.data || error.message);
    return null;
  }
}

async function getAccountInfo(address) {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/account/${address}`);
    return response.data;
  } catch (error) {
    console.error(`Account info check failed for ${address}:`, error.response?.data || error.message);
    return null;
  }
}

async function performTransfer(fromWallet, toAddress, amount, description) {
  console.log(`\n=== ${description} ===`);
  console.log(`From: ${fromWallet.address}`);
  console.log(`To: ${toAddress}`);
  console.log(`Amount: ${amount} MLCNS`);

  try {
    const result = await transferFromMnemonic({
      mnemonic: fromWallet.mnemonic,
      toAddress: toAddress,
      amountMlcns: amount,
      memo: `Test transfer from ${fromWallet.address}`
    });

    console.log('✅ Transfer successful!');
    console.log(`TX Hash: ${result.txHash}`);
    console.log(`Height: ${result.height}`);
    return { success: true, result };
  } catch (error) {
    console.error('❌ Transfer failed:', error.message);
    if (error.code) console.error(`Code: ${error.code}`);
    if (error.rawLog) console.error(`Raw Log: ${error.rawLog}`);
    return { success: false, error: error.message, details: error };
  }
}

async function runTests() {
  console.log('=== P2P Mallcoin Transfer Tests ===');
  console.log('Monitoring gas fees (MAL) and transaction blocking issues\n');

  // Test 1: Check initial balances
  console.log('=== INITIAL BALANCES ===');
  const initialBalances = {};
  const initialGasBalances = {};
  const accountInfos = {};

  for (const [name, wallet] of Object.entries(WALLETS)) {
    console.log(`\n${name} (${wallet.status}):`);
    const balance = await getMlcnsBalance(wallet.address);
    const gasBalance = await getGasBalance(wallet.address);
    const accountInfo = await getAccountInfo(wallet.address);

    if (balance) {
      console.log(`  MLCNS Balance: ${balance.balanceDisplay} (Available: ${balance.availableDisplay})`);
      console.log(`  Locked: ${balance.lockedDisplay}`);
      initialBalances[name] = balance;
    }
    if (gasBalance) {
      console.log(`  Gas Balance (MAL): ${gasBalance.display} (Sufficient: ${gasBalance.sufficient})`);
      initialGasBalances[name] = gasBalance;
    }
    if (accountInfo) {
      console.log(`  Account Number: ${accountInfo.accountNumber}, Sequence: ${accountInfo.sequence}`);
      accountInfos[name] = accountInfo;
    }
  }

  // Test 2: Transfer from TEAM to AFA (both unlocked)
  console.log('\n\n=== TEST 1: TEAM → AFA Transfer ===');
  const transfer1 = await performTransfer(
    WALLETS.TEAM,
    WALLETS.AFA.address,
    1000, // 1000 MLCNS
    'TEAM to AFA'
  );

  if (transfer1.success) {
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n=== POST-TRANSFER BALANCES (TEAM → AFA) ===');
    const teamBalanceAfter = await getMlcnsBalance(WALLETS.TEAM.address);
    const afaBalanceAfter = await getMlcnsBalance(WALLETS.AFA.address);
    const teamGasAfter = await getGasBalance(WALLETS.TEAM.address);

    if (teamBalanceAfter) {
      console.log(`TEAM MLCNS: ${teamBalanceAfter.balanceDisplay} (Available: ${teamBalanceAfter.availableDisplay})`);
      console.log(`TEAM Gas: ${teamGasAfter?.display} MAL`);
    }
    if (afaBalanceAfter) {
      console.log(`AFA MLCNS: ${afaBalanceAfter.balanceDisplay} (Available: ${afaBalanceAfter.availableDisplay})`);
    }
  }

  // Test 3: Transfer from ORTHOPHARM to TEAM (both unlocked)
  console.log('\n\n=== TEST 2: ORTHOPHARM → TEAM Transfer ===');
  const transfer2 = await performTransfer(
    WALLETS.ORTHOPHARM,
    WALLETS.TEAM.address,
    500, // 500 MLCNS
    'ORTHOPHARM to TEAM'
  );

  if (transfer2.success) {
    console.log('\nWaiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n=== POST-TRANSFER BALANCES (ORTHOPHARM → TEAM) ===');
    const orthoBalanceAfter = await getMlcnsBalance(WALLETS.ORTHOPHARM.address);
    const teamBalanceAfter2 = await getMlcnsBalance(WALLETS.TEAM.address);
    const orthoGasAfter = await getGasBalance(WALLETS.ORTHOPHARM.address);

    if (orthoBalanceAfter) {
      console.log(`ORTHOPHARM MLCNS: ${orthoBalanceAfter.balanceDisplay} (Available: ${orthoBalanceAfter.availableDisplay})`);
      console.log(`ORTHOPHARM Gas: ${orthoGasAfter?.display} MAL`);
    }
    if (teamBalanceAfter2) {
      console.log(`TEAM MLCNS: ${teamBalanceAfter2.balanceDisplay} (Available: ${teamBalanceAfter2.availableDisplay})`);
    }
  }

  // Test 4: Attempt transfer from FOUNDER (locked) - should fail
  console.log('\n\n=== TEST 3: FOUNDER → AFA Transfer (Expected to Fail - Locked) ===');
  const transfer3 = await performTransfer(
    WALLETS.FOUNDER,
    WALLETS.AFA.address,
    100, // 100 MLCNS
    'FOUNDER to AFA (Locked Wallet Test)'
  );

  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log('Transfer Results:');
  console.log(`  1. TEAM → AFA: ${transfer1.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`  2. ORTHOPHARM → TEAM: ${transfer2.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`  3. FOUNDER → AFA (Locked): ${transfer3.success ? '❌ UNEXPECTED SUCCESS' : '✅ EXPECTED FAILURE'}`);

  console.log('\nGas Fee Observations:');
  console.log('  Gas balances checked before and after transfers');
  console.log('  Monitor gas consumption in transaction logs');

  console.log('\nPotential Blocking Issues:');
  if (!transfer1.success) console.log(`  - TEAM → AFA: ${transfer1.error}`);
  if (!transfer2.success) console.log(`  - ORTHOPHARM → TEAM: ${transfer2.error}`);
  if (transfer3.success) console.log(`  - FOUNDER → AFA: UNEXPECTED - locked wallet should not transfer`);
  else console.log(`  - FOUNDER → AFA: Expected failure (locked wallet)`);

  // Check for insufficient gas
  for (const [name, gasBalance] of Object.entries(initialGasBalances)) {
    if (gasBalance && !gasBalance.sufficient) {
      console.log(`  ⚠️ ${name} has insufficient gas balance: ${gasBalance.display} MAL`);
    }
  }

  console.log('\n=== TEST COMPLETE ===');
}

runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
