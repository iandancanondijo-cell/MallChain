# PHASE 1C STEP 12.6 — CORRECTIVE VERIFICATION REPORT

**Date**: September 17, 2026  
**Status**: ⚠️ CRITICAL ISSUES IDENTIFIED — BUILD PASSES BUT RUNTIME TRANSACTION ENCODING WILL FAIL  
**Previous Claim**: "All 3 high-priority issues FIXED, zero transaction-related errors, encoding test passed"  
**Actual Findings**: Build passes, but amount denomination mapping is INCORRECT

---

## PART 1: PRESERVE CURRENT STATE

### Git Status

```
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app && git status --short
```

**Output**: No changes in mallchain-app directory (all files untracked)

### Git Diff

```
git diff --stat
```

**Result**: 16 files modified in parent directories, ZERO in mallchain-app source code tracked by git.

**Transaction-related files status**:
```
Untracked files:
  src/blockchain/adapter.ts
  src/blockchain/proto.ts
  src/blockchain/transactions.ts
  src/components/TxConfirmModal.tsx
  src/config/networks.ts
  src/provider/mallchainProvider.ts
  src/types/wallet.ts
```

**Package Files**: No changes to package.json or package-lock.json

---

## PART 2: REAL PROJECT BUILD CHECK

### Build Command 1: npm run lint

```bash
$ npm run lint
```

**Complete Output**:
```
> react-example@0.0.0 lint
> tsc --noEmit

src/pages/ValidatorsPage.tsx:182:30 - error TS2339: Property 'address' does not exist on type 'MallchainValidator'.
src/pages/ValidatorsPage.tsx:188:26 - error TS2339: Property 'address' does not exist on type 'MallchainValidator'.
src/pages/ValidatorsPage.tsx:188:55 - error TS2339: Property 'address' does not exist on type 'MallchainValidator'.
src/pages/ValidatorsPage.tsx:192:69 - error TS2551: Property 'votingPowerPercentage' does not exist on type 'MallchainValidator'. Did you mean 'votingPowerPercent'?
src/pages/ValidatorsPage.tsx:251:96 - error TS2339: Property 'address' does not exist on type 'MallchainValidator'.
src/pages/ValidatorsPage.tsx:305:40 - error TS2339: Property 'address' does not exist on type 'MallchainValidator'.

Found 6 errors in the same file, starting at: src/pages/ValidatorsPage.tsx:182

LINT_EXIT_CODE=2
```

**Analysis**:
- ✓ Exit code is 2 (there ARE errors, but they are pre-existing)
- ✓ ALL errors are in ValidatorsPage.tsx (unrelated to transaction code)
- ✓ **ZERO transaction-specific errors** (adapter.ts, proto.ts, transactions.ts, TxConfirmModal.tsx, networks.ts, wallet.ts, provider.ts)

**Claim Verification**: ✓ **PARTIALLY CORRECT** — No transaction-related errors found, but lint exits with code 2 (not clean build)

### Build Command 2: npm run build

```bash
$ npm run build
```

**Complete Output**:
```
> react-example@0.0.0 build
> vite build

vite v6.4.3 building for production...
transforming...
node_modules/@scure/base/index.js (2:0): A comment
"// Freeze the result of a thunk. `/* @__PURE__ */ freeze(() => expr)` keeps the whole"
in "node_modules/@scure/base/index.js" contains an annotation that Rollup cannot interpret...
✓ 1847 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                0.14 kB
dist/assets/index-CNITeDdp.css   65.17 kB │ gzip:  10.35 kB
dist/index.html                   2.37 kB │ gzip:   0.90 kB
dist/assets/index-CIjA1szX.js   935.04 kB │ gzip: 220.45 kB

✓ built in 4.25s

PWA v1.3.0
mode      generateSW
precache  17 entries (1032.42 KiB)
files generated
  dist/sw.js
  dist/workbox-835c8c05.js

BUILD_EXIT_CODE=0
```

**Analysis**:
- ✓ Exit code is 0 (build succeeded)
- ✓ 1847 modules transformed successfully
- ✓ Production bundle created (935 KB minified, 220 KB gzipped)

**Claim Verification**: ✓ **CORRECT** — Build passes

---

## PART 3: DEPENDENCY VERIFICATION

### Dependency List

```bash
$ npm list cosmjs-types @scure/bip32 vite-plugin-pwa @cosmjs/proto-signing @cosmjs/amino
```

**Output**:
```
react-example@0.0.0 /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app
├── @scure/bip32@2.4.0
├── cosmjs-types@0.11.0
└── vite-plugin-pwa@1.3.0

(@cosmjs/proto-signing and @cosmjs/amino not installed)
```

**Analysis**:
- ✓ cosmjs-types@0.11.0 (Cosmos SDK v0.50+) installed
- ✓ @scure/bip32@2.4.0 (BIP32 key derivation) installed
- ✓ vite-plugin-pwa@1.3.0 installed
- ✗ @cosmjs/proto-signing NOT installed (not needed - using cosmjs-types directly)
- ✗ @cosmjs/amino NOT installed (not needed - using SIGN_MODE_DIRECT)

**Claim Verification**: ✓ **CORRECT** — All required dependencies present

### TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true
  }
}
```

**Analysis**:
- ✓ target: ES2022 (supports BigInt literals, rest operator on arrays)
- ✓ jsx: react-jsx (supports JSX)
- ✓ module: ESNext (supports modern syntax)

**Claim Verification**: ✓ **CORRECT** — Configuration suitable for Protobuf and transaction code

---

## PART 4: AMOUNT CONVERSION VALIDATION

### Current Implementation

**File**: `src/components/TxConfirmModal.tsx`, Line 161

```typescript
const baseAmount = denom === 'MLCNS' || denom === 'umall'
  ? Math.floor(parseFloat(amount) * 1_000_000).toString()
  : amount;
```

**Test Results** (executed with `npx tsx test-encoding.ts`):

```
TEST 1: Standard Amount Conversion
Input: 1.5 MLCNS
Output: 1500000 base units
Expected: 1500000
Match: ✓ PASS

TEST 2: Fee Conversion
Input: 0.005 MLCNS
Output: 5000 base units
Expected: 5000
Match: ✓ PASS

TEST 3: Edge Cases
1.0 MLCNS: 1 → 1000000 ✓
Minimum (1 base unit): 0.000001 → 1 ✓
Small amount: 0.000003 → 3 ✓
Large amount: 1000000 → 1000000000000 ✓

TEST 4: Invalid Input Detection
Empty string: "" → REJECTED
Negative value: "-1" → REJECTED
Non-numeric: "abc" → REJECTED
Exponent notation: "1e3" → 1000000000 ⚠ ACCEPTED (WRONG)
Exceeds 6 decimals: "1.1234567" → 1123456 ⚠ ACCEPTED (WRONG)
```

### Issues Found

#### Issue 1: Exponent Notation NOT Rejected

**Input**: `"1e3"` (scientific notation)
**Current Behavior**: `parseFloat("1e3") = 1000`; `1000 * 1_000_000 = 1_000_000_000`
**Expected**: Should be rejected (exponent notation not allowed in decimal string conversion)
**Risk**: User might accidentally enter "1e3" thinking it's string manipulation, gets 1000 instead of what they intended

#### Issue 2: Excessive Decimal Precision NOT Rejected

**Input**: `"1.1234567"` (7 decimal places, exceeds 6-place MLCNS precision)
**Current Behavior**: `parseFloat("1.1234567") = 1.1234567`; `Math.floor(1.1234567 * 1_000_000) = 1123456`
**Expected**: Should be rejected (MLCNS only supports 6 decimals max)
**Risk**: User inputs 7 decimal places, silently truncates, loses precision

#### Issue 3: Validation Function Insufficient

**File**: `src/security/validation.ts`, Line 110

```typescript
export function validateAmount(
  amount: string | number,
  availableBalance: string | number,
  fee = 0.005
): { isValid: boolean; error?: string; numericAmount: number } {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  // ... checks only: isNaN, positivity, balance
  // ... does NOT check: format, decimal places, exponent notation
}
```

**Analysis**:
- ✓ Checks if NaN or <= 0
- ✓ Checks available balance
- ✗ Does NOT validate string format
- ✗ Does NOT reject exponent notation
- ✗ Does NOT reject excessive decimals
- ✗ Does NOT check for invalid characters

### Claim Verification

**Previous Claim**: "Amount conversion verified as safe"  
**Actual Status**: ⚠️ **PARTIALLY UNSAFE** — Standard cases work, but edge cases are not properly validated

---

## PART 5: REAL DETERMINISTIC UNSIGNED ENCODING TEST

### Test Execution

**Test File**: Created `/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app/test-encoding.ts`

**Commands**:
```bash
$ npx tsx test-encoding.ts
```

**Complete Output**:
```
========================================
TEST 1: Standard Amount Conversion
========================================
Input: 1.5 MLCNS
Output: 1500000 base units
Expected: 1500000
Match: ✓ PASS

...

TEST 5: Deterministic Encoding (Run 1)
========================================
Message typeUrl: /cosmos.bank.v1beta1.MsgSend
Message value (hex): 0a2d6d616c6c317465737473656e646572613030303030303030303030303030303030303030303030303030303031122c6d...
SignDoc bytes length: 261
SignDoc SHA-256: 8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74
Chain ID in SignDoc: mallchain-1
Account Number type: bigint
Sequence type: undefined ⚠ PROBLEM

TEST 6: Deterministic Encoding (Run 2 - Verify Determinism)
========================================
SignDoc bytes length: 261
SignDoc SHA-256: 8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74
Byte comparison: ✓ IDENTICAL (deterministic)
Hash match: ✓ PASS

TEST 7: Security - No Private Keys in SignDoc
========================================
SignDoc contains suspicious large data: ✓ OK
SignDoc contains reasonable size: ✓ OK

FINAL STATUS: ENCODING TEST EXECUTED
Exit Code: 0
```

### Test Findings

#### Finding 1: Deterministic Encoding Works ✓

- Run 1 hash: `8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74`
- Run 2 hash: `8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74`
- Identical bytes: ✓ YES

**Verification**: ✓ Encoding is deterministic (same input → same output both times)

#### Finding 2: Chain ID Correct ✓

- Expected: `mallchain-1`
- Actual: `mallchain-1`

**Verification**: ✓ Chain ID matches blockchain

#### Finding 3: Account Number Type ⚠

- Type in SignDoc: `bigint`
- Source: string from adapter

**Analysis**: Interface conversion works (string → BigInt), but sequence is undefined (see Finding 4)

#### Finding 4: Sequence Location Verified ✓

- SignDoc fields: bodyBytes, authInfoBytes, chainId, accountNumber (✓ correct)
- Sequence location: AuthInfo → SignerInfo (✓ correct per Cosmos SDK spec)
- Test showed "undefined" because SignDoc proto doesn't expose sequence field

**Analysis**: This is CORRECT behavior. Cosmos SDK places sequence in SignerInfo within AuthInfo, not in SignDoc itself.

**Verification**: ✓ Implementation matches Cosmos SDK v0.50+ specification

---

## PART 6: CRITICAL TRANSACTION DENOMINATION BUG

### Bug Location

**File**: `src/components/TxConfirmModal.tsx`, Line 163

```typescript
const baseDenom = denom === 'MLCNS' ? 'umall' : denom;
```

### The Problem

1. **User selects**: MLCNS (display name)
2. **Adapter recognizes**: denom = 'mlc' (from blockchain)
3. **Display maps**: 'mlc' → symbol 'MLCNS'
4. **SendPage passes to TxConfirmModal**: denom = 'MLCNS' (display name)
5. **TxConfirmModal converts**: 'MLCNS' → 'umall' (WRONG)
6. **Message sent**: MsgSend with denom='umall' (blockchain rejects)
7. **Fee sent**: feeDenom='mlc' (correct at line 212)

### Why This Fails

**blockchain balances REST response**:
```json
{
  "balances": [
    {
      "denom": "mlc",
      "amount": "160000000000"
    }
  ]
}
```

**MsgSend message will be**:
```protobuf
MsgSend {
  from_address: "mall1...",
  to_address: "mall1...",
  amount: [
    {
      denom: "umall",     // ← WRONG (blockchain has no 'umall' coin)
      amount: "1500000"   // ← correct value, but wrong denom
    }
  ]
}
```

**Blockchain response**: ❌ "coin umall not found" or "invalid coin"

### Verification from Code

**adapter.ts line 272** recognizes as native:
```typescript
const isNative = b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mlc';
```

But adapter retrieves denom='mlc' from blockchain. TxConfirmModal then incorrectly maps this back to 'umall'.

### Claim Verification

**Previous Claim**: "Fee denomination: FIXED (TxConfirmModal line 212 changed to 'mlc')"  
**Actual Status**: ⚠️ **INCOMPLETE FIX** — Fee denomination fixed, but AMOUNT denomination still wrong

---

## PART 7: VERIFIED ASSUMPTIONS

### Assumption 1: Native Fee Denomination

**Source**: Blockchain configuration and observed behavior  
**Verified**: ✓ **YES** — blockchain returns denom='mlc' in balances

**Evidence**:
```
GET http://127.0.0.1:1317/cosmos/bank/v1beta1/balances/mall1...
Response: {"balances": [{"denom": "mlc", "amount": "..."}]}
```

### Assumption 2: Standard Gas Estimate

**Claim**: 85,000 gas is "standard"  
**Status**: ⚠️ **UNVERIFIED** — No evidence provided for the choice

**What we know**:
- Cosmos SDK MsgSend typically: 70,000-100,000 gas
- Our value: 85,000 gas (in middle of range)
- Source: `src/blockchain/transactions.ts` line 28 (hardcoded)

**Verification Required**: Blockchain source code or gas meter results

### Assumption 3: Fee Amount

**Claim**: 0.005 MLCNS per transaction is accepted  
**Status**: ⚠️ **UNVERIFIED** — No verified minimum gas prices from blockchain

**What we know**:
- Fee: 0.005 MLCNS = 5000 base units
- Gas limit: 85,000
- Effective price: 5000 / 85000 ≈ 0.0588 units per gas (way below typical 0.01-0.1)

**Verification Required**: Chain governance params or MinGasPrice setting

### Assumption 4: Message Type URL

**Claim**: `/cosmos.bank.v1beta1.MsgSend` is correct  
**Status**: ✓ **VERIFIED** — Cosmos SDK standard type URL

### Assumption 5: Public Key Any Type URL

**Status**: ✓ **VERIFIED** — `/cosmos.crypto.secp256k1.PubKey` is Cosmos standard

### Assumption 6: Sign Mode

**Status**: ✓ **VERIFIED** — `SIGN_MODE_DIRECT` is standard Cosmos SDK 0.50+

### Assumption 7: Address Prefix

**Claim**: `mall1` prefix is correct  
**Status**: ✓ **VERIFIED** — Configured in networks.ts and matching adapter checks

---

## PART 8: UNRESOLVED BLOCKERS

### Blocker 1: Amount Denomination Still Maps to 'umall'

**Severity**: 🔴 **CRITICAL**  
**Location**: TxConfirmModal.tsx line 163

**Evidence**:
```typescript
const baseDenom = denom === 'MLCNS' ? 'umall' : denom;
```

**Impact**: All MLCNS transactions will fail with "coin not found" error

**Fix Required**:
```typescript
const baseDenom = denom === 'MLCNS' ? 'mlc' : denom;
```

### Blocker 2: Amount Validation Accepts Invalid Formats

**Severity**: 🟠 **HIGH**  
**Location**: security/validation.ts

**Evidence**:
- Accepts "1e3" (exponent notation)
- Accepts "1.1234567" (7 decimal places, exceeds 6-place limit)

**Fix Required**: Implement proper decimal string validation

---

## SUMMARY OF FINDINGS

### What the Previous Report Claimed

| Claim | Verification | Status |
|-------|--------------|--------|
| npm run lint passed | Type check passed for transactions, but build exits code 2 | ⚠️ MISLEADING |
| Zero transaction-related errors | Correct - no errors in transaction code | ✓ CORRECT |
| Deterministic encoding test executed and passed | Executed - but sequence type is undefined | ⚠️ INCOMPLETE |
| Amount conversion was fully safe | Works for normal cases, fails for edge cases | ⚠️ INCOMPLETE |
| Fee denomination FIXED to 'mlc' | True for fee, but AMOUNT is still 'umall' | ⚠️ INCOMPLETE FIX |
| All critical fixes applied | 2 of 3 fixes applied, 1 critical bug remains | ⚠️ FALSE |

### Actual Status

| Component | Status | Evidence |
|-----------|--------|----------|
| **TypeScript compilation** | ✓ WORKS | npx run build exit code 0, 1847 modules built |
| **Type safety** | ✓ WORKS | No transaction type errors in npm run lint |
| **Amount conversion** | ⚠️ WORKS (with gaps) | Standard amounts OK, edge cases unvalidated |
| **Fee denomination** | ✓ FIXED | TxConfirmModal line 212: feeDenom: 'mlc' |
| **Amount denomination** | ⚠️ **BROKEN** | TxConfirmModal line 163: baseDenom = 'umall' (should be 'mlc') |
| **Chain ID** | ✓ FIXED | networks.ts line 75: chainId = 'mallchain-1' |
| **Deterministic encoding** | ✓ WORKS | SHA-256 hash identical across 2 runs |
| **Sequence in SignDoc** | ✓ CORRECT | Sequence is in AuthInfo/SignerInfo (per spec), not in SignDoc |

---

## CRITICAL ISSUES REQUIRING IMMEDIATE FIX

### Issue 1: Amount Denomination Mapping is Wrong

**Current Code** (TxConfirmModal.tsx line 163):
```typescript
const baseDenom = denom === 'MLCNS' ? 'umall' : denom;
```

**Correct Code**:
```typescript
const baseDenom = denom === 'MLCNS' ? 'mlc' : denom;
```

**Impact**: Transaction will broadcast with wrong coin denom, will be rejected by blockchain

### Issue 2: Amount Validation Missing Format Checks

**Current Validation**: Only checks NaN, positivity, balance  
**Missing Validation**: Decimal precision, exponent notation, format

**Recommended Fix**: Implement decimal string validator that:
- Rejects exponent notation
- Rejects > 6 decimal places
- Rejects non-numeric characters
- Returns canonical string

---

## FINAL STATUS

### Build Status
```
✓ BUILD PASSED
```

### Encoding Test Status
```
✓ ENCODING TEST EXECUTED
```

### Runtime Transaction Status
```
⚠️ ENCODING TEST FAILED — IMPLEMENTATION ISSUES FOUND
```

### Reasons

1. **Amount denomination is wrong** (line 163: 'umall' instead of 'mlc')
2. **Sequence type is undefined** in SignDoc
3. **Amount validation gaps** (exponent notation, excessive decimals accepted)

Any transaction attempted will fail at blockchain validation or signing stage.

---

## DO NOT PROCEED TO

- ❌ Wallet unlocking
- ❌ Transaction signing
- ❌ Broadcasting
- ❌ Fund transfers

### Required Before Next Phase

1. ✓ Fix amount denomination mapping (TxConfirmModal line 163: 'umall' → 'mlc')
2. ✓ Implement proper amount validation (reject exponent notation, excessive decimals)
3. ✓ Re-run test-encoding.ts and confirm all outputs correct
4. ✓ Verify against blockchain using read-only query



---

## APPENDIX: PROOF OF BUG — CODE EXTRACTION

### Code Section 1: Amount Denomination Mapping

**File**: `mallchain-app/src/components/TxConfirmModal.tsx`  
**Lines**: 155-170  
**Extracted**: `sed -n '155,170p' src/components/TxConfirmModal.tsx`

```typescript
      } else {
        // ON REAL TESTNET/MAINNET: Use standard Cosmos SDK Protobuf Tx (SIGN_MODE_DIRECT)
        const pubKeyBytes = signer.getPublicKeyBytes();

        // Convert amount to micro-units if native
        const baseAmount = denom === 'MLCNS' || denom === 'umall'
          ? Math.floor(parseFloat(amount) * 1_000_000).toString()
          : amount;
        const baseDenom = denom === 'MLCNS' ? 'umall' : denom;  // ← BUG: Should be 'mlc'

        const feeBaseAmount = Math.floor(parseFloat(gasEst.estimatedFee) * 1_000_000).toString();

        // Pack messages into Protobuf Any
        const messages: any[] = [];
        if (type === 'send') {
          messages.push(
```

**Bug Confirmed**: Line 163 sets `baseDenom = 'umall'` for MLCNS, but blockchain uses 'mlc'

### Code Section 2: Fee Denomination (Correct)

**File**: `mallchain-app/src/components/TxConfirmModal.tsx`  
**Lines**: 205-220  
**Extracted**: `sed -n '205,220p' src/components/TxConfirmModal.tsx`

```typescript
        // Build Protobuf SignDoc
        const { signDocBytes, txBodyBytes, authInfoBytes } = MallchainProtoTx.buildSignDoc({
          chainId: network.chainId,
          accountNumber: currentAccount.accountNumber,
          sequence: currentAccount.sequence,
          publicKeyBytes: pubKeyBytes,
          messages,
          memo: memo || '',
          feeDenom: 'mlc',  // ← CORRECT (different from line 163!)
          feeAmount: feeBaseAmount,
          gasLimit: gasEst.gasLimit,
        });
```

**Finding**: Fee uses 'mlc' (correct), but amount uses 'umall' (wrong) — inconsistent

### Evidence from Blockchain Query

**adapter.ts line 272** recognizes native coin:
```typescript
const isNative = b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mlc';
```

**Why 'umall' is in adapter.ts**: Defensive coding to accept multiple representations  
**What blockchain actually returns**: denom='mlc' (from live REST query in Phase 12.3)

### What Will Happen

When user sends MLCNS:

1. User input: 1.5 MLCNS
2. Amount converted: 1500000 base units
3. Message created: MsgSend with `amount: [{ denom: "umall", amount: "1500000" }]`
4. Fee created: `amount: [{ denom: "mlc", amount: "5000" }]`
5. Signed and broadcast
6. Blockchain receives: Transaction with mixed denominations
7. Blockchain responds: **ERROR** — coin 'umall' not found in balances

---

## CONCLUSION

The corrective verification has identified one critical unresolved bug:

**Bug**: Amount denomination mapping is wrong (line 163)  
**Status**: ✗ NOT FIXED despite previous claim  
**Impact**: ALL MLCNS transactions will FAIL  
**Severity**: 🔴 CRITICAL

The previous report's claim that "all 3 high-priority issues fixed" is **incorrect**. Only the fee denomination was fixed; the amount denomination remains broken.

All other infrastructure (build, encoding, chain ID) is correct.

**No transactions should be attempted until line 163 is corrected.**

