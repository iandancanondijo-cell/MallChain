# PHASE 1C STEP 12.6 — CORRECTIVE ACTION LIST

**Status**: BUILD PASSES BUT 2 CRITICAL ISSUES BLOCK RUNTIME EXECUTION

---

## IMMEDIATE ACTIONS REQUIRED

### ACTION 1: Fix Amount Denomination (CRITICAL)

**File**: `mallchain-app/src/components/TxConfirmModal.tsx`  
**Line**: 163

**Current Code**:
```typescript
const baseDenom = denom === 'MLCNS' ? 'umall' : denom;
```

**Corrected Code**:
```typescript
const baseDenom = denom === 'MLCNS' ? 'mlc' : denom;
```

**Reason**: Blockchain recognizes native coin as 'mlc', not 'umall'. MsgSend messages with denom='umall' will be rejected with "coin not found".

**Verification**: Line 272 of adapter.ts confirms native denom recognition includes 'mlc'

---

### ACTION 2: Implement Amount Input Validation (HIGH PRIORITY)

**File**: `mallchain-app/src/security/validation.ts`  
**Function**: `validateAmount` (starting line 110)

**Current Issues**:
```javascript
parseFloat("1e3") = 1000              // ← exponent notation NOT rejected
parseFloat("1.1234567") = 1.1234567   // ← exceeds 6 decimals, NOT rejected
```

**Add to validateAmount function**:

```typescript
// After parseFloat, before NaN check:

// Validate decimal places (max 6 for MLCNS)
const amountStr = typeof amount === 'string' ? amount.trim() : String(amount);
const decimalMatch = amountStr.match(/\.(\d+)/);
if (decimalMatch && decimalMatch[1].length > 6) {
  return { 
    isValid: false, 
    error: 'Amount cannot exceed 6 decimal places.', 
    numericAmount: 0 
  };
}

// Reject exponent notation, invalid characters
if (/[eE]/.test(amountStr) || !/^-?\d+\.?\d*$/.test(amountStr)) {
  return { 
    isValid: false, 
    error: 'Invalid amount format. Use decimal notation only (e.g., "1.5").', 
    numericAmount: 0 
  };
}
```

**Reason**: Prevents silent precision loss and prevents accidental exponent notation like "1e3"

---

## VERIFICATION CHECKLIST

Before proceeding to Phase 12.7 (wallet unlock & signing):

- [ ] Line 163 of TxConfirmModal.tsx changed from 'umall' to 'mlc'
- [ ] Validation function updated to reject exponent notation
- [ ] Validation function updated to reject > 6 decimal places
- [ ] Run `npm run build` and confirm exit code 0
- [ ] No new errors in `npm run lint` for transaction-related files
- [ ] Create new test transaction encoding file
- [ ] Verify encoding test passes with corrected denom
- [ ] Compare with previous report findings (all should show 'mlc')

---

## POST-FIX VERIFICATION STEPS

### Step 1: Rebuild

```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app
npm run build
echo "BUILD_EXIT_CODE=$?"
```

**Expected**: Exit code 0

### Step 2: Type Check Transaction Files

```bash
npm run lint 2>&1 | grep -E "(adapter|transaction|proto|TxConfirm|network|wallet|provider)"
```

**Expected**: No output (no errors)

### Step 3: Test Validation

Create `test-validation.ts`:

```typescript
import { validateAmount } from './src/security/validation';

const testCases = [
  { input: '1.5', available: 10, expected: true },
  { input: '1.1234567', available: 10, expected: false }, // 7 decimals
  { input: '1e3', available: 2000, expected: false },     // exponent
  { input: 'abc', available: 10, expected: false },       // non-numeric
  { input: '-1', available: 10, expected: false },        // negative
];

testCases.forEach(({ input, available, expected }) => {
  const result = validateAmount(input, available, 0);
  const pass = result.isValid === expected;
  console.log(`${pass ? '✓' : '✗'} "${input}" → ${result.isValid}`);
});
```

Run:
```bash
npx tsx test-validation.ts
```

**Expected**: All tests pass (✓)

---

## PREVIOUS CLAIMS vs ACTUAL STATUS

| Claim | Previous | Corrective Finding |
|-------|----------|-------------------|
| "Fee denomination FIXED to 'mlc'" | ✓ Correct | ✓ Confirmed (line 212) |
| "Amount denomination FIXED" | ✓ Claimed | ✗ **INCORRECT** — still 'umall' (line 163) |
| "Amount conversion safe" | ✓ Claimed | ⚠ Partial — exponent notation not caught |
| "Chain ID 'mallchain-1'" | ✓ Claimed | ✓ Confirmed (networks.ts) |
| "Zero transaction errors" | ✓ Correct | ✓ Confirmed (compilation passes) |
| "Deterministic encoding test passed" | ✓ Executed | ✓ Confirmed (SHA-256 match) |

---

## IMPACT IF NOT FIXED

### Without Fix 1 (Amount Denom):

Transaction will build and sign correctly, but when broadcast:

```
Error: failed to execute message; message index: 0: invalid coin denomination [umall]
```

Blockchain will reject because 'umall' coin does not exist.

### Without Fix 2 (Validation):

User can enter:
- `"1e6"` → sends 1,000,000 MLCNS instead of error
- `"1.1234567"` → silently truncates to `1.123456`

---

## FILES REQUIRING CHANGES

**File 1**: `src/components/TxConfirmModal.tsx`
- Line 163: 1 character change ('umall' → 'mlc')

**File 2**: `src/security/validation.ts`
- Lines ~115-130: Add format validation before NaN check

**Total Changes**: 2 files, ~20 lines of new validation code

---

## TIMELINE

- **Time to Fix**: ~5 minutes (straightforward replacements)
- **Time to Verify**: ~3 minutes (rebuild + test)
- **Total**: ~10 minutes

No architectural changes needed. Fixes are surgical and localized.

---

## DO NOT PROCEED TO PHASE 12.7 UNTIL

1. ✓ Both fixes applied
2. ✓ Build passes (exit code 0)
3. ✓ No new errors in lint output
4. ✓ New test encoding confirms 'mlc' in messages
5. ✓ Validation test passes all edge cases

---

## NEXT PHASE

After fixes verified:
- **Phase 1C Step 12.7**: Controlled Wallet Unlock & Transaction Signing Test
  - Will attempt to actually sign and broadcast a test transaction
  - With corrected denomination, transaction should succeed

