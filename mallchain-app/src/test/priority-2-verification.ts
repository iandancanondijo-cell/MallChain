/**
 * Priority 2: Real Data Integration Verification
 * Read-only tests to verify getNetworkStatus, getBlockHeight, getBalances, getTransactions
 */

import { mallchainClient } from '../blockchain/client';
import type { MallchainNetworkStatus, MallchainAssetBalance, MallchainTransaction } from '../types/blockchain';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  result?: any;
  error?: string;
}

export async function runPriority2Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: getNetworkStatus() - Simulator
  try {
    const t0 = performance.now();
    mallchainClient.switchNetwork('mallchain-simulator');
    const status = await mallchainClient.getNetworkStatus();
    const duration = performance.now() - t0;

    const passed = 
      status.status !== undefined &&
      typeof status.connected === 'boolean' &&
      status.isSimulator === true &&
      typeof status.latestBlock === 'number' &&
      status.latestBlock > 0;

    results.push({
      name: 'Test 1: getNetworkStatus() - Simulator',
      passed,
      duration,
      result: {
        status: status.status,
        connected: status.connected,
        isSimulator: status.isSimulator,
        latestBlock: status.latestBlock,
        blockTimeMs: status.blockTimeMs,
        chainId: status.chainId,
      },
      error: passed ? undefined : 'Response structure invalid',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 1: getNetworkStatus() - Simulator',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 2: getBlockHeight() - Simulator
  try {
    const t0 = performance.now();
    const height = await mallchainClient.getBlockHeight();
    const duration = performance.now() - t0;

    const passed = 
      typeof height === 'number' &&
      height > 0;

    results.push({
      name: 'Test 2: getBlockHeight() - Simulator',
      passed,
      duration,
      result: { height, type: typeof height },
      error: passed ? undefined : `Invalid response: ${height} (${typeof height})`,
    });
  } catch (err: any) {
    results.push({
      name: 'Test 2: getBlockHeight() - Simulator',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 3: getBalances() - Simulator with Genesis
  try {
    const t0 = performance.now();
    const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
    const balances = await mallchainClient.getBalances(genesisAddr);
    const duration = performance.now() - t0;

    const passed = 
      Array.isArray(balances) &&
      balances.length > 0 &&
      balances.every((b: any) => 
        typeof b.denom === 'string' &&
        typeof b.amount === 'string' &&
        typeof b.symbol === 'string'
      );

    results.push({
      name: 'Test 3: getBalances() - Simulator',
      passed,
      duration,
      result: {
        count: balances.length,
        sample: balances.slice(0, 2).map((b: MallchainAssetBalance) => ({
          denom: b.denom,
          amount: b.amount,
          symbol: b.symbol,
          formatted: b.formatted,
        })),
      },
      error: passed ? undefined : 'Response structure invalid',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 3: getBalances() - Simulator',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 4: getTransactions() - Simulator
  try {
    const t0 = performance.now();
    const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
    const txs = await mallchainClient.getTransactions(genesisAddr);
    const duration = performance.now() - t0;

    const passed = 
      Array.isArray(txs) &&
      (txs.length === 0 || txs.every((tx: any) => 
        typeof tx.hash === 'string' &&
        typeof tx.type === 'string' &&
        typeof tx.blockHeight === 'number'
      ));

    results.push({
      name: 'Test 4: getTransactions() - Simulator',
      passed,
      duration,
      result: {
        count: txs.length,
        sample: txs.slice(0, 2).map((tx: MallchainTransaction) => ({
          hash: tx.hash.substring(0, 16) + '...',
          type: tx.type,
          blockHeight: tx.blockHeight,
          timestamp: tx.timestamp,
        })),
      },
      error: passed ? undefined : 'Response structure invalid',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 4: getTransactions() - Simulator',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 5: Network Offline Behavior
  try {
    const t0 = performance.now();
    mallchainClient.switchNetwork('mallchain-testnet');
    const offlineStatus = await mallchainClient.getNetworkStatus();
    const duration = performance.now() - t0;

    const passed = 
      offlineStatus.connected === false &&
      offlineStatus.isSimulator === false &&
      (offlineStatus.status === 'OFFLINE' || offlineStatus.status === 'DEGRADED');

    results.push({
      name: 'Test 5: Offline Behavior - Testnet',
      passed,
      duration,
      result: {
        status: offlineStatus.status,
        connected: offlineStatus.connected,
        isSimulator: offlineStatus.isSimulator,
        errorMessage: offlineStatus.errorMessage?.substring(0, 60) + '...',
      },
      error: passed ? undefined : 'Expected OFFLINE/DEGRADED status',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 5: Offline Behavior - Testnet',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 6: Simulator Isolation - Switch Back
  try {
    const t0 = performance.now();
    mallchainClient.switchNetwork('mallchain-simulator');
    const simStatus = await mallchainClient.getNetworkStatus();
    const duration = performance.now() - t0;

    const passed = 
      simStatus.isSimulator === true &&
      simStatus.connected === true;

    results.push({
      name: 'Test 6: Simulator Isolation - No Testnet Bleed',
      passed,
      duration,
      result: {
        isSimulator: simStatus.isSimulator,
        connected: simStatus.connected,
        status: simStatus.status,
      },
      error: passed ? undefined : 'Simulator state contaminated',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 6: Simulator Isolation - No Testnet Bleed',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  // Test 7: Block Height Monotonic Increase
  try {
    const t0 = performance.now();
    mallchainClient.switchNetwork('mallchain-simulator');
    
    const h1 = await mallchainClient.getBlockHeight();
    await new Promise(r => setTimeout(r, 500));
    const h2 = await mallchainClient.getBlockHeight();
    await new Promise(r => setTimeout(r, 500));
    const h3 = await mallchainClient.getBlockHeight();
    
    const duration = performance.now() - t0;

    const passed = 
      h1 > 0 &&
      h2 >= h1 &&
      h3 >= h2;

    results.push({
      name: 'Test 7: Block Height Monotonic Increase',
      passed,
      duration,
      result: {
        h1,
        h2,
        h3,
        blockDiff: h3 - h1,
      },
      error: passed ? undefined : 'Block heights not monotonic',
    });
  } catch (err: any) {
    results.push({
      name: 'Test 7: Block Height Monotonic Increase',
      passed: false,
      duration: 0,
      error: err.message,
    });
  }

  return results;
}

// Print results in a formatted way
export function formatResults(results: TestResult[]): string {
  let output = '\n=== PRIORITY 2: REAL DATA VERIFICATION ===\n\n';
  
  results.forEach((r, i) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    output += `${i + 1}. ${r.name}\n`;
    output += `   Status: ${status}\n`;
    output += `   Duration: ${r.duration.toFixed(0)}ms\n`;
    
    if (r.result) {
      output += `   Result: ${JSON.stringify(r.result, null, 2).split('\n').map((l, i) => i === 0 ? l : '   ' + l).join('\n')}\n`;
    }
    
    if (r.error) {
      output += `   Error: ${r.error}\n`;
    }
    
    output += '\n';
  });

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  output += `\nSummary: ${passed}/${total} tests passed\n`;

  return output;
}
