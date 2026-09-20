# Priority 2: Real Data Integration Verification

**Date**: September 20, 2026  
**Objective**: Verify that real data methods (getNetworkStatus, getBlockHeight, getBalances, getTransactions) actually work  
**Status**: TESTING IN PROGRESS

---

## Execution Plan

This document will be updated as each test is executed. The goal is to:

1. ✅ **Call getNetworkStatus()** and document the actual response
2. ✅ **Call getBlockHeight()** and verify its response format
3. ✅ **Call getBalances(address)** with a valid test wallet
4. ✅ **Call getTransactions(address)** and validate parsing
5. ✅ **Test timeout, offline, and simulator fallback behavior**

### Important Notes
- All tests will use the **simulator mode first** (guaranteed to work in development)
- Then attempt **testnet/mainnet** (will likely fail without deployed nodes)
- Demo labels remain enabled during testing
- **NO transactions will be broadcast** (read-only testing only)

---

## Test 1: getNetworkStatus() - Simulator

### Test Code
```typescript
import { mallchainClient } from './src/blockchain/client';

// Ensure simulator is active
mallchainClient.switchNetwork('mallchain-simulator');
const status = await mallchainClient.getNetworkStatus();
console.log('Simulator Network Status:', JSON.stringify(status, null, 2));
```

### Expected Behavior
- `status.status` should be `"SIMULATION"` or `"CONNECTED"`
- `status.connected` should be `true` (simulator is always available)
- `status.isSimulator` should be `true`
- `status.latestBlock` should be a positive number
- `status.blockTimeMs` should be 5000 (from networks config)
- `status.chainId` should be `"mallchain-sim-1"`

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Command to Run**:
```bash
cd mallchain-app
npm run build
# Then open browser console and run:
const { mallchainClient } = await import('./src/blockchain/client.ts');
mallchainClient.switchNetwork('mallchain-simulator');
const status = await mallchainClient.getNetworkStatus();
console.log(status);
```

**Result**:
```
{
  "status": "[PENDING]",
  "connected": "[PENDING]",
  "isSimulator": "[PENDING]",
  "latestBlock": "[PENDING]",
  "blockTimeMs": "[PENDING]",
  "chainId": "[PENDING]",
  "rpcStatus": "[PENDING]",
  "restStatus": "[PENDING]",
  "lastPingMs": "[PENDING]"
}
```

---

## Test 2: getBlockHeight() - Simulator

### Test Code
```typescript
const height = await mallchainClient.getBlockHeight();
console.log('Current Block Height:', height, typeof height);
```

### Expected Behavior
- Returns a `number` (not string)
- Should be > 0
- Second call should be equal or greater (blocks don't go backwards)
- Should match `status.latestBlock` from Test 1

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Block Height: [PENDING] (type: [PENDING])
```

---

## Test 3: getBalances() - Simulator with Genesis Address

### Test Code
```typescript
const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
const balances = await mallchainClient.getBalances(genesisAddr);
console.log('Balances:', JSON.stringify(balances, null, 2));
```

### Expected Behavior
- Returns an `Array<MallchainAssetBalance>`
- Each balance object has:
  - `denom: string` (e.g., "umall", "umlpts")
  - `amount: string` (e.g., "1000000000")
  - `symbol: string` (e.g., "MLCNS", "MLPTS")
  - `formatted: string` (user-friendly display)
  - `decimals: number` (6)
  - `isNative: boolean`
- Should include at least MLCNS and MLPTS tokens

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Balances: [PENDING]
```

---

## Test 4: getTransactions() - Simulator

### Test Code
```typescript
const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
const txs = await mallchainClient.getTransactions(genesisAddr);
console.log('Transactions:', JSON.stringify(txs, null, 2));
console.log('Total transactions:', txs.length);
```

### Expected Behavior
- Returns an `Array<MallchainTransaction>`
- Each transaction has:
  - `hash: string` (e.g., "0x...")
  - `type: string` (e.g., "send", "delegate")
  - `amount: string` (in smallest unit)
  - `blockHeight: number`
  - `timestamp: string` (ISO format)
  - `status: string` ("confirmed" or "failed")
- May return empty array if genesis addr has no transactions
- Format is consistent and parseable

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Transactions: [PENDING]
Number of transactions: [PENDING]
```

---

## Test 5: Network Offline Behavior

### Test Code
```typescript
// Switch to testnet (which doesn't have a running node yet)
mallchainClient.switchNetwork('mallchain-testnet');
const offlineStatus = await mallchainClient.getNetworkStatus();
console.log('Offline Status:', JSON.stringify(offlineStatus, null, 2));
```

### Expected Behavior
- `status.status` should be `"OFFLINE"` or `"DEGRADED"`
- `status.connected` should be `false`
- `status.latestBlock` should be `0`
- `status.errorMessage` should contain network error info
- **NO SIMULATOR FALLBACK**: Should NOT return simulator data

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Offline Status: [PENDING]
```

---

## Test 6: Error Handling - getBalances() with Invalid Address

### Test Code
```typescript
try {
  const balances = await mallchainClient.getBalances('invalid-address');
  console.log('Result:', balances);
} catch (err) {
  console.log('Error caught:', err.message);
}
```

### Expected Behavior
- Either:
  - Returns empty array `[]` (graceful degradation)
  - OR throws an error with validation message
- Does NOT crash or hang
- Behavior is consistent

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Error handling: [PENDING]
```

---

## Test 7: Simulator Consistency - Multiple Calls

### Test Code
```typescript
// Make 3 calls to verify consistent behavior
const h1 = await mallchainClient.getBlockHeight();
await new Promise(r => setTimeout(r, 1000));
const h2 = await mallchainClient.getBlockHeight();
await new Promise(r => setTimeout(r, 1000));
const h3 = await mallchainClient.getBlockHeight();

console.log('Heights:', h1, h2, h3);
console.log('Blocks produced during test:', h3 - h1);
```

### Expected Behavior
- `h1 <= h2 <= h3` (blocks monotonically increase)
- Approximately 2-5 blocks should be produced in 2 second interval (given 5s block time, randomization)
- No errors or timeouts
- Consistent API behavior

### Execution Result
**STATUS**: ⏳ PENDING TEST

**Result**:
```
Heights: [PENDING]
Blocks produced: [PENDING]
```

---

## Real Network Testing (When Infrastructure Available)

When testnet/mainnet Mallchain nodes become available:

### Testnet Tests
```typescript
mallchainClient.switchNetwork('mallchain-testnet');

// 1. Test network status
const testnetStatus = await mallchainClient.getNetworkStatus();
// Expected: status='CONNECTED', connected=true, isSimulator=false

// 2. Test block height
const testnetHeight = await mallchainClient.getBlockHeight();
// Expected: positive number matching chain state

// 3. Test with real testnet addresses (when available)
const testnetBalances = await mallchainClient.getBalances('mall1testnetaddress...');
// Expected: real testnet wallet balances
```

### Mainnet Tests
```typescript
mallchainClient.switchNetwork('mallchain-mainnet');
// Similar tests but against production network
// CAUTION: DO NOT BROADCAST TRANSACTIONS on mainnet
```

---

## Test Results Summary

| Test # | Name | Status | Duration | Notes |
|--------|------|--------|----------|-------|
| 1 | getNetworkStatus() Simulator | ⏳ Pending | - | - |
| 2 | getBlockHeight() Simulator | ⏳ Pending | - | - |
| 3 | getBalances() Simulator | ⏳ Pending | - | - |
| 4 | getTransactions() Simulator | ⏳ Pending | - | - |
| 5 | Offline Behavior | ⏳ Pending | - | - |
| 6 | Error Handling | ⏳ Pending | - | - |
| 7 | Simulator Consistency | ⏳ Pending | - | - |

---

## Verification Checklist

After all tests pass, verify:

- [ ] All methods return expected data types
- [ ] Simulator mode is reliable and consistent
- [ ] Offline behavior is graceful (no crashes)
- [ ] Error handling works correctly
- [ ] Response format matches type definitions
- [ ] No simulator data leaks into real networks
- [ ] Network switching works correctly

---

## Next Steps After Verification

Once all Priority 2 tests pass:

1. **Demo Labels**: Keep labels enabled until real data is confirmed working
2. **Dashboard Integration**: Update dashboard to use real data responses
3. **Error States**: Implement proper error state rendering
4. **Loading States**: Show loading indicators while fetching
5. **Production Deployment**: Not until all tests pass and visual verification complete

---

## Important Notes

### For Developers Running Tests
- Use browser console to execute tests (web context)
- Or create a test file in `src/test/priority-2-verification.ts`
- Ensure build succeeds before testing

### Known Limitations
- Testnet/Mainnet endpoints not yet deployed
- Will show OFFLINE status until infrastructure available
- Simulator is guaranteed to work (always available in dev)

### Reference Files
- `src/blockchain/client.ts` - Client implementation
- `src/blockchain/adapter.ts` - Network adapter (real API calls)
- `src/blockchain/simulator.ts` - Simulator implementation
- `src/config/networks.ts` - Network configuration
- `src/types/blockchain.ts` - TypeScript types for responses

---

**This document will be updated as each test is executed.**

Status: AWAITING TEST EXECUTION ⏳
