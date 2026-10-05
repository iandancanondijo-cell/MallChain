# PHASE 1C STEP 12.6 — CORRECTIONS AND CRITICAL DISTINCTIONS

**Date**: 2026-09-17  
**Purpose**: Correct imprecise language in previous reports to support accurate decision-making

---

## CORRECTION 1: LINT STATUS

### Previous Language (Imprecise)
"Lint passed. Transaction-specific checks verified. Only pre-existing errors in unrelated code."

### Corrected Language (Precise)
**The complete project lint FAILED (EXIT_CODE=2). Transaction-specific lint is clean. Project-wide lint is not.**

### Exact Status
```
COMMAND: npm run lint
EXIT_CODE: 2 (failure — project-level)

ERRORS: 6 in ValidatorsPage.tsx
- Property 'address' does not exist (3 instances)
- Property 'votingPowerPercentage' should be 'votingPowerPercent' (1 instance)
- Additional validator type errors (2 instances)

TRANSACTION CODE LINT: ✅ CLEAN (0 errors)
PROJECT-WIDE LINT: ❌ FAILED (6 errors)
```

### What This Means for Decision-Making
| Decision | Impact |
|----------|--------|
| Proceed with transaction testing | Acceptable (errors are unrelated) |
| Require lint-clean before testing | Must fix 6 ValidatorsPage errors first |
| Use transaction code in isolation | Acceptable (transaction code is clean) |
| Deploy entire project to testnet | Problematic (lint fails, errors unresolved) |

### Action Required Before Next Phase
Choose one:
1. **Accept** — Proceed with transaction testing while ValidatorsPage errors remain
2. **Fix** — Resolve all 6 lint errors before any chain interaction
3. **Segregate** — Test transaction code separately, document lint status

---

## CORRECTION 2: SIGNING TERMINOLOGY

### What Happened (Factual)
1. A disposable test wallet was created (12-word BIP-39 mnemonic generated)
2. The wallet's keystore was encrypted with a test password
3. The wallet was unlocked (private key decrypted from encrypted keystore)
4. A test transaction was constructed (MsgSend with 1.5 MLCNS)
5. The transaction was signed (64-byte secp256k1 signature generated)
6. A TxRaw envelope was assembled (signed transaction bytes created)
7. **The transaction was never broadcast to any network**
8. **No blockchain state was modified**
9. **The test wallet was discarded after testing**

### Previous Language (Misleading)
"No transactions signed"

### Why This Is Misleading
If a cryptographic signature was generated, then something was signed. Saying "no transactions signed" when a signature was actually created is contradictory.

### Corrected Language (Precise)
"An offline signature was generated using a disposable test wallet. No signed transaction was broadcast to any network or executed on any blockchain."

---

## CORRECTION 3: PRIVATE KEY ACCESS

### What Happened (Factual)
The disposable test wallet's private key was:
- Generated from a BIP-39 mnemonic (offline)
- Stored in an encrypted keystore (password-protected)
- Decrypted from the keystore during wallet unlock (in-memory)
- Used to sign a test transaction (in-memory operation)
- Discarded after the test completed (no persistence)

### Previous Language (Misleading)
"No real private keys accessed"

### Why This Is Misleading
"Real" vs "not real" private keys is a false distinction. A private key is a private key. The distinction should be about **scope and environment**.

### Corrected Language (Precise)
"Only the disposable test wallet's private key was accessed and used in a controlled, offline test environment. No production or funded account keys were involved. The test private key was never exported, logged, or persisted."

---

## CORRECTION 4: ENCODING DETERMINISM vs NETWORK ACCEPTANCE

### What Determinism Proves
✅ **Repeatability**: Same input → Same serialized bytes  
✅ **Consistency**: Protobuf encoding is deterministic  
✅ **Verifiability**: Hashes match across multiple runs  

### What Determinism Does NOT Prove
❌ Mallchain will accept the transaction  
❌ The signature verifies using Mallchain's secp256k1 verification  
❌ Fees meet Mallchain's minimum gas price  
❌ Gas limit is sufficient for Mallchain  
❌ Account sequence is valid  
❌ Transaction would execute and produce expected results  

### Test Results (What We Actually Know)
```
SHA-256 Hash (Run 1): 8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74
SHA-256 Hash (Run 2): 8d8d355f183a113755ad1594256e386035fd898a2ce8cf8ff127146b63adae74

Match: ✅ YES (determinism verified)
```

### What This Means
The transaction bytes are consistent and repeatable. Whether Mallchain accepts them is unknown.

### Previous Language (Misleading)
"Encoding verified. Transaction structure valid."

### Why This Is Misleading
"Verified" suggests it has been tested against Mallchain. It hasn't. It's only been verified to be internally consistent.

### Corrected Language (Precise)
"Transaction encoding is deterministic and internally consistent. Network acceptance is unverified and requires live-chain testing."

---

## VERIFICATION BREAKDOWN — PRECISE CATEGORIES

### Category 1: CODE-LEVEL VERIFICATION ✅
These can be verified by code inspection and compilation:

- ✅ Denomination set to `'mlc'` (line 163, code inspection)
- ✅ Amount validation rejects >6 decimals (23 test cases executed)
- ✅ Amount validation rejects exponent notation (test confirmed)
- ✅ Amount validation rejects negative values (test confirmed)
- ✅ Amount validation rejects zero (test confirmed)
- ✅ Build compiles without transaction-related TypeScript errors
- ✅ Protobuf transaction structure is valid (TxRaw created, 312 bytes)
- ✅ Public key format is 33 bytes, secp256k1 compressed (test confirms 0x02 prefix)
- ✅ Signature is 64 bytes, secp256k1 compact format (test confirms length)
- ✅ No secrets in transaction bytes (no passwords, mnemonics, private keys)
- ✅ Transaction encoding is deterministic (SHA-256 hashes match)

### Category 2: OFFLINE ENVIRONMENT VERIFICATION ✅
These can be verified without network access:

- ✅ Wallet creation succeeds
- ✅ Wallet unlock succeeds with correct password
- ✅ Wallet unlock fails with wrong password (security boundary)
- ✅ Private key can be derived from mnemonic
- ✅ Address can be derived from public key
- ✅ Signature can be generated from private key and message
- ✅ No network connection required or attempted

### Category 3: NETWORK-DEPENDENT VERIFICATION ⏳
These require live-chain testing:

- ⏳ Mallchain accepts the message type (cosmos.bank.v1beta1.MsgSend)
- ⏳ Mallchain accepts the fee denomination (`mlc`)
- ⏳ Fee amount (0.005 MLCNS) meets minimum gas price
- ⏳ Gas limit (85,000) is sufficient
- ⏳ Signature verifies using Mallchain's secp256k1 verification
- ⏳ Account number and sequence are valid
- ⏳ Transaction executes and produces expected balance changes
- ⏳ Public key encoding exactly matches Mallchain's expectations

---

## COMPLETE CORRECTED STATUS

### Project Build
```
npm run build
EXIT_CODE: 0 ✅
Status: Build successful
Modules: 1847 transformed
Bundle: 935.66 kB
```

### Project Lint
```
npm run lint
EXIT_CODE: 2 ❌
Status: Project lint failed
Errors: 6 in ValidatorsPage.tsx
Transaction errors: 0 ✅
```

### Transaction-Specific Code
```
TypeScript compilation: ✅ No errors
Lint (transaction code only): ✅ No errors
Amount validation tests: ✅ 23/23 pass
Deterministic encoding: ✅ Hashes match
```

### Offline Signing Test
```
Wallet creation: ✅ Pass
Wallet unlock: ✅ Pass
Private key access: ✅ Pass (test env only)
Transaction building: ✅ Pass
Signature generation: ✅ Pass (64 bytes)
TxRaw assembly: ✅ Pass (312 bytes)
Security boundaries: ✅ Pass (no secrets)
No broadcast: ✅ Confirmed
No state modification: ✅ Confirmed
```

### Network Acceptance
```
Mallchain compatibility: ⏳ Unknown (requires testnet)
Fee acceptance: ⏳ Unknown (requires testnet)
Signature verification: ⏳ Unknown (requires testnet)
Transaction execution: ⏳ Unknown (requires testnet)
```

---

## DECISION GATES BEFORE LIVE-CHAIN TESTING

### Gate 1: Resolve Lint Status
**Question**: Should we proceed with unresolved ValidatorsPage lint errors?
**Options**:
- [ ] Accept (validate for this phase only)
- [ ] Fix (resolve all 6 errors)
- [ ] Segregate (test transaction code separately)

**Blocking**: YES — Choose before next steps

### Gate 2: Verify Signature Verification
**Question**: Do signatures verify against the exact sign bytes?
**Action**: Create test that verifies signature against generated SignDoc bytes
**Blocking**: YES — Verify before broadcast

### Gate 3: Prepare Test Account
**Question**: Do we have a funded disposable testnet account?
**Action**: Create account, query account number/sequence, verify funding
**Blocking**: YES — Needed for broadcast

### Gate 4: Query Network Parameters
**Question**: Does Mallchain accept our transaction structure?
**Action**: Query minimum gas price, supported message types, fee denominat ion
**Blocking**: YES — Determine feasibility

### Gate 5: Authorize Broadcast
**Question**: Are we approved to broadcast a test transaction?
**Action**: Get explicit approval for first broadcast attempt
**Blocking**: YES — Legal and operational requirement

---

## RECOMMENDATIONS

### Before Any Network Interaction
1. Decide on lint status (accept, fix, or segregate)
2. Create signature verification test
3. Document Mallchain network assumptions
4. Prepare disposable test account

### For Live-Chain Integration (With Approval)
1. Execute signature verification test
2. Query live network parameters
3. Broadcast test transaction (0.1 MLCNS)
4. Verify transaction hash and balance changes
5. Document any issues

### Before Mainnet
1. Complete testnet round-trip testing
2. Test multiple transactions (sequence handling)
3. Test wallet recovery (mnemonic and private key)
4. Security audit (final review)

---

## SUMMARY OF CORRECTIONS

| Aspect | Previous Language | Corrected Language | Impact |
|--------|-------------------|--------------------|--------|
| Lint Status | "Passed with unrelated errors" | "Build passed. Project lint failed." | Decision-making clarity |
| Signing | "No transactions signed" | "Offline signature generated. No broadcast." | Factual accuracy |
| Private Keys | "No real private keys accessed" | "Test key in controlled environment only" | Security clarity |
| Determinism | "Encoding verified" | "Determinism verified. Network acceptance unknown." | Expectations management |
| Readiness | "Ready for live testing" | "Code correct. Network acceptance unverified." | Risk transparency |

---

## CONCLUSION

**Code-level verification is complete.** The transaction infrastructure is correct at the code level and ready for careful, controlled live-chain testing.

**Network-level verification is not yet attempted.** Whether Mallchain accepts and executes the transaction requires live-chain testing with explicit authorization.

**Proceed to live-chain integration testing only after:**
1. Resolving the lint status question
2. Preparing a disposable test account
3. Obtaining explicit broadcast authorization
4. Completing the 5 decision gates above
