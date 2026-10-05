# Priority 2: Runtime Test Execution - Simulator Tests

**Date**: September 20, 2026  
**Environment**: Browser simulator environment  
**Status**: 🔧 EXECUTION IN PROGRESS

---

## Test Execution Instructions

These tests must be run in a **browser environment** (not Node.js) because they require:
- DOM API
- localStorage
- fetch API
- Browser event loop

### Option A: Execute in Browser Console (Recommended)

1. **Start dev server**:
```bash
cd mallchain-app
npm run dev
```

2. **Open browser** at `http://localhost:5173`

3. **Open browser console** (F12)

4. **Run this code**:
```javascript
// Copy-paste entire test suite below into console
```

### Test Suite (Copy to Browser Console)

```javascript
// ============================================================
// PRIORITY 2: RUNTIME TESTS AGAINST SIMULATOR
// ============================================================

async function runPriority2RuntimeTests() {
  const results = [];
  
  console.log('\n=== PRIORITY 2: RUNTIME EXECUTION ===\n');

  // Test 1: getNetworkStatus() - Simulator
  try {
    console.log('Test 1: getNetworkStatus() - Simulator');
    console.time('test1');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    mallchainClient.switchNetwork('mallchain-simulator');
    
    const status = await mallchainClient.getNetworkStatus();
    
    const duration = console.timeEnd('test1');
    
    const passed = 
      status &&
      typeof status.status === 'string' &&
      typeof status.connected === 'boolean' &&
      status.isSimulator === true &&
      typeof status.latestBlock === 'number' &&
      status.latestBlock > 0;
    
    results.push({
      test: 'Test 1: getNetworkStatus() - Simulator',
      passed,
      result: {
        status: status.status,
        connected: status.connected,
        isSimulator: status.isSimulator,
        latestBlock: status.latestBlock,
        blockTimeMs: status.blockTimeMs,
        chainId: status.chainId,
        endpointUrl: status.endpointUrl,
      },
      error: passed ? null : 'Response structure invalid',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('Response:', JSON.stringify(status, null, 2));
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 1: getNetworkStatus() - Simulator',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: getBlockHeight() - Simulator
  try {
    console.log('Test 2: getBlockHeight() - Simulator');
    console.time('test2');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    const height = await mallchainClient.getBlockHeight();
    
    console.timeEnd('test2');
    
    const passed = 
      typeof height === 'number' &&
      height > 0;
    
    results.push({
      test: 'Test 2: getBlockHeight() - Simulator',
      passed,
      result: {
        height,
        type: typeof height,
        isPositive: height > 0,
      },
      error: passed ? null : `Invalid: ${height} (${typeof height})`,
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('Block Height:', height);
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 2: getBlockHeight() - Simulator',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: getBalances() - Genesis Address
  try {
    console.log('Test 3: getBalances() - Simulator');
    console.time('test3');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
    const balances = await mallchainClient.getBalances(genesisAddr);
    
    console.timeEnd('test3');
    
    const passed = 
      Array.isArray(balances) &&
      balances.length > 0 &&
      balances.every(b => 
        typeof b.denom === 'string' &&
        typeof b.amount === 'string' &&
        typeof b.symbol === 'string' &&
        typeof b.formatted === 'string'
      );
    
    results.push({
      test: 'Test 3: getBalances() - Simulator',
      passed,
      result: {
        count: balances.length,
        sample: balances.map(b => ({
          denom: b.denom,
          amount: b.amount,
          symbol: b.symbol,
          formatted: b.formatted,
          isNative: b.isNative,
        })),
      },
      error: passed ? null : 'Response structure invalid',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('Balances:', JSON.stringify(balances, null, 2));
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 3: getBalances() - Simulator',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: getTransactions() - Genesis Address
  try {
    console.log('Test 4: getTransactions() - Simulator');
    console.time('test4');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
    const txs = await mallchainClient.getTransactions(genesisAddr);
    
    console.timeEnd('test4');
    
    const passed = 
      Array.isArray(txs) &&
      (txs.length === 0 || txs.every(tx =>
        typeof tx.hash === 'string' &&
        typeof tx.type === 'string' &&
        typeof tx.blockHeight === 'number'
      ));
    
    results.push({
      test: 'Test 4: getTransactions() - Simulator',
      passed,
      result: {
        count: txs.length,
        sample: txs.slice(0, 3).map(tx => ({
          hash: tx.hash.substring(0, 20) + '...',
          type: tx.type,
          blockHeight: tx.blockHeight,
          status: tx.status,
          timestamp: tx.timestamp,
        })),
      },
      error: passed ? null : 'Response structure invalid',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (txs.length > 0) {
      console.log('Transactions:', JSON.stringify(txs.slice(0, 2), null, 2));
    } else {
      console.log('No transactions for genesis address');
    }
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 4: getTransactions() - Simulator',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: Block Height Monotonic Increase
  try {
    console.log('Test 5: Block Height Monotonic Increase');
    console.time('test5');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    mallchainClient.switchNetwork('mallchain-simulator');
    
    const h1 = await mallchainClient.getBlockHeight();
    await new Promise(r => setTimeout(r, 500));
    const h2 = await mallchainClient.getBlockHeight();
    await new Promise(r => setTimeout(r, 500));
    const h3 = await mallchainClient.getBlockHeight();
    
    console.timeEnd('test5');
    
    const passed = 
      h1 > 0 &&
      h2 >= h1 &&
      h3 >= h2;
    
    results.push({
      test: 'Test 5: Block Height Monotonic Increase',
      passed,
      result: {
        h1,
        h2,
        h3,
        monotonic: h1 <= h2 && h2 <= h3,
        blocksDiff: h3 - h1,
      },
      error: passed ? null : 'Heights not monotonic',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Heights: ${h1} → ${h2} → ${h3}`);
    console.log(`Blocks produced: ${h3 - h1}`);
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 5: Block Height Monotonic Increase',
      passed: false,
      error: err.message,
    });
  }

  // Test 6: Network Offline Behavior
  try {
    console.log('Test 6: Network Offline Behavior - Testnet');
    console.time('test6');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    mallchainClient.switchNetwork('mallchain-testnet');
    
    const status = await mallchainClient.getNetworkStatus();
    
    console.timeEnd('test6');
    
    const passed = 
      status.connected === false &&
      status.isSimulator === false &&
      (status.status === 'OFFLINE' || status.status === 'DEGRADED');
    
    results.push({
      test: 'Test 6: Network Offline Behavior',
      passed,
      result: {
        status: status.status,
        connected: status.connected,
        isSimulator: status.isSimulator,
        errorMessage: status.errorMessage?.substring(0, 80) + '...',
      },
      error: passed ? null : 'Expected OFFLINE/DEGRADED',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('Status:', status.status);
    console.log('Connected:', status.connected);
    console.log('Error:', status.errorMessage);
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 6: Network Offline Behavior',
      passed: false,
      error: err.message,
    });
  }

  // Test 7: Simulator Isolation
  try {
    console.log('Test 7: Simulator Isolation - Switch Back');
    console.time('test7');
    
    const { mallchainClient } = await import('./src/blockchain/client.ts');
    mallchainClient.switchNetwork('mallchain-simulator');
    
    const status = await mallchainClient.getNetworkStatus();
    
    console.timeEnd('test7');
    
    const passed = 
      status.isSimulator === true &&
      status.connected === true;
    
    results.push({
      test: 'Test 7: Simulator Isolation',
      passed,
      result: {
        isSimulator: status.isSimulator,
        connected: status.connected,
        status: status.status,
      },
      error: passed ? null : 'Simulator state contaminated',
    });
    
    console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('Simulator active:', status.isSimulator);
    console.log('Connected:', status.connected);
    console.log('');
    
  } catch (err) {
    console.error('ERROR:', err);
    results.push({
      test: 'Test 7: Simulator Isolation',
      passed: false,
      error: err.message,
    });
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach((r, i) => {
    const status = r.passed ? '✅' : '❌';
    console.log(`${i + 1}. ${status} ${r.test}`);
  });
  
  console.log(`\n${passed}/${total} tests passed\n`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED');
  } else {
    console.log(`⚠️  ${total - passed} test(s) failed`);
  }
  
  return results;
}

// Run tests
const testResults = await runPriority2RuntimeTests();
console.log('\n[Tests saved to window.testResults]');
window.testResults = testResults;
```

---

## Expected Results

If all tests pass, you should see:

```
=== PRIORITY 2: RUNTIME EXECUTION ===

Test 1: getNetworkStatus() - Simulator
Response: {
  "status": "SIMULATION",
  "connected": false,
  "isSimulator": true,
  "latestBlock": 1523XXX,
  "blockTimeMs": 5000,
  "chainId": "mallchain-sim-1",
  ...
}
Result: ✅ PASS

Test 2: getBlockHeight() - Simulator
Block Height: 1523XXX
Result: ✅ PASS

Test 3: getBalances() - Simulator
Balances: [
  {
    "denom": "umall",
    "amount": "1000000000",
    "symbol": "MLCNS",
    "formatted": "1000.00",
    ...
  }
]
Result: ✅ PASS

Test 4: getTransactions() - Simulator
No transactions for genesis address
Result: ✅ PASS

Test 5: Block Height Monotonic Increase
Heights: 1523456 → 1523456 → 1523457
Blocks produced: 1
Result: ✅ PASS

Test 6: Network Offline Behavior - Testnet
Status: OFFLINE
Connected: false
Error: Cannot reach Mallchain node...
Result: ✅ PASS

Test 7: Simulator Isolation - Switch Back
Simulator active: true
Connected: true
Result: ✅ PASS

=== SUMMARY ===

1. ✅ Test 1: getNetworkStatus() - Simulator
2. ✅ Test 2: getBlockHeight() - Simulator
3. ✅ Test 3: getBalances() - Simulator
4. ✅ Test 4: getTransactions() - Simulator
5. ✅ Test 5: Block Height Monotonic Increase
6. ✅ Test 6: Network Offline Behavior
7. ✅ Test 7: Simulator Isolation

7/7 tests passed

🎉 ALL TESTS PASSED
```

---

## Actual Test Execution

**Run the test suite above and paste the console output below**:

```
[AWAITING TEST EXECUTION]
```

---

## Pass/Fail Criteria

| Test | Criterion |
|------|-----------|
| Test 1 | `status.isSimulator === true` AND `latestBlock > 0` |
| Test 2 | Returns number AND `height > 0` |
| Test 3 | Returns array AND each element has `denom`, `amount`, `symbol` |
| Test 4 | Returns array AND (empty OR all elements have `hash`, `type`, `blockHeight`) |
| Test 5 | `h1 <= h2 <= h3` AND all positive numbers |
| Test 6 | `connected === false` AND `isSimulator === false` AND status is `OFFLINE` or `DEGRADED` |
| Test 7 | `isSimulator === true` AND `connected === true` |

---

## What This Proves

✅ **If all tests pass**:
- Methods can be called without crashing
- Simulator responds with valid data
- Network switching works correctly
- Offline detection works
- Simulator isolation prevents contamination

❌ **Limitations**:
- Still doesn't test real blockchain (no testnet running)
- Doesn't test wallet integration (no signing)
- Doesn't test transaction broadcast
- Simulator data is not real blockchain data

---

## Next Steps After Execution

1. **Copy console output** from browser into results section above
2. **Document any failures** with error messages
3. **If all pass**: Demo labels can stay but are no longer blocking
4. **If any fail**: Debug failures before proceeding
5. **Commit results** to git with actual outputs

---

## Reference

- **Test code**: `src/test/priority-2-verification.ts` (for reference)
- **Simulator**: `src/blockchain/simulator.ts`
- **Real methods**: `src/blockchain/adapter.ts`
- **Client**: `src/blockchain/client.ts`

---

**Status**: ⏳ AWAITING EXECUTION

Run the test suite in browser console and document results here.
