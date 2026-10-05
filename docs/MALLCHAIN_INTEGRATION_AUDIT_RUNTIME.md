# MALLCHAIN APP ↔ BLOCKCHAIN INTEGRATION AUDIT — RUNTIME VERIFICATION

**Date**: September 21, 2026, 12:46 UTC  
**Status**: LEVEL 1 — CODE INTEGRATION  
**Deployment**: ⛔ NOT READY — CRITICAL VERIFICATION GAPS REMAIN

---

## EXECUTIVE SUMMARY

The Mallchain App has **code-level integration** with the local blockchain but is **NOT production-ready** due to:

1. **Default Simulator Mode**: First-time users see simulator data, not real blockchain
2. **No Auto-Detection**: App doesn't detect running blockchain on startup
3. **Untested Transactions**: Wallet signing & broadcasting never tested against real blockchain
4. **Unverified Production Build**: DEV flag exposure unknown in production

Real blockchain infrastructure is fully operational and responding. The adapter routing is correctly implemented. When users manually switch to "Mallchain Local Node", the app successfully queries real blockchain endpoints and returns actual data.

---

## INFRASTRUCTURE STATUS

### ✅ Blockchain Node (CometBFT/Cosmos)
- **RPC**: http://127.0.0.1:26657 — **RESPONDING**
- **REST**: http://127.0.0.1:1317 — **RESPONDING**
- **Chain ID**: mallchain-1
- **Current Block Height**: 56,368+

### ✅ Backend API
- **Endpoint**: http://127.0.0.1:4000 — **RESPONDING**
- **Health**: Connected to blockchain, database, Redis all operational

### ✅ Frontend Dev Server
- **Endpoint**: http://127.0.0.1:3000 — **RESPONDING**
- **Mode**: Development (Vite)

---

## CODE INTEGRATION FINDINGS

### ✅ Correct Implementation
- **Network routing**: Adapter correctly differentiates simulator vs real blockchain
- **Real endpoints configured**: RPC/REST properly set from .env
- **Data flow architecture**: Dashboard → Client → Adapter → Real RPC/REST
- **No silent fallback**: Real network errors don't silently switch to simulator

### ❌ Critical Issues

**Issue 1: DEFAULT_NETWORK_ID = 'mallchain-simulator'** (src/config/networks.ts:72)
- On first load, app defaults to simulator
- Users must manually switch to "Mallchain Local Node"
- UX impact: New users see fake data by default

**Issue 2: No Auto-Network Detection** (src/blockchain/client.ts)
- Constructor only calls `getStoredNetworkId()`
- No startup probe to detect running blockchain
- Requires manual user intervention

**Issue 3: Transaction Integration Untested** (src/blockchain/transactions.ts, adapter.ts)
- Signing code exists but never tested
- Broadcast code exists but never executed
- Unknown if real transactions work

**Issue 4: Production Build Verification Missing** (src/main.tsx:8-10)
- Window exposure guarded by `if (import.meta.env.DEV)`
- Production build not verified to have DEV=false

---

## VERIFIED DATA FLOWS (WHEN REAL NETWORK SELECTED)

### 1. Get Block Height ✅
```
Dashboard → mallchainClient.getNetworkStatus()
  → adapter queries: http://127.0.0.1:26657/status
  → Returns: {latestBlock: 56368, status: 'CONNECTED'}
  → Dashboard displays: Real block height
```

### 2. Get Balances ✅
```
Dashboard → mallchainClient.getBalances(address)
  → adapter queries: http://127.0.0.1:1317/cosmos/bank/v1beta1/balances/{address}
  → Returns: [{denom: 'stake', amount: '1000500000'}]
  → Dashboard displays: Real account balances
```

### 3. Get Validators ✅
```
Dashboard → mallchainClient.getValidators()
  → adapter queries: http://127.0.0.1:1317/cosmos/staking/v1beta1/validators
  → Returns: [{operatorAddress, moniker: 'Test Validator', ...}]
  → Dashboard displays: Real validator set
```

**Real Data Verified**: Block height 56,368, 2 validators (Test Validator, validator1), account balances queried successfully.

---

## INTEGRATION LEVEL: LEVEL 1 — CODE INTEGRATION

| Level | Definition | Mallchain Status |
|-------|-----------|------------------|
| 0 | UI only | ❌ |
| 1 | Code integration (client exists, endpoints configured) | ✅ **HERE** |
| 2 | Read integration (real data retrieves successfully) | ⚠️ Code correct, not runtime tested |
| 3 | Wallet integration (wallet balances + transactions) | ❌ Untested |
| 4 | Transaction integration (sign & broadcast verified) | ❌ Never tested |
| 5 | Full end-to-end | ❌ Never executed |

**Why not Level 2?** Code is correct, but real user interaction has not been verified. Code review ≠ runtime verification.

**Why not Level 3+?** Wallet and transaction integration require runtime testing not yet performed.

---

## CRITICAL BLOCKERS

| Blocker | Severity | Location | Action |
|---------|----------|----------|--------|
| DEFAULT_NETWORK_ID hardcoded to simulator | CRITICAL | src/config/networks.ts:72 | Change to environment-aware |
| No auto-network detection on startup | CRITICAL | src/blockchain/client.ts | Implement startup probe |
| Transaction signing untested | CRITICAL | src/blockchain/transactions.ts | Execute real signing test |
| Transaction broadcast untested | CRITICAL | src/blockchain/adapter.ts | Execute real broadcast test |
| Production DEV exposure unverified | MEDIUM | src/main.tsx | Verify production build |

---

## RECOMMENDED NEXT STEPS

### Immediate (Before Testnet)
1. [ ] Change DEFAULT_NETWORK_ID to detect 'mallchain-local' if running
2. [ ] Implement auto-network detection on app startup
3. [ ] Execute transaction signing test with real blockchain account
4. [ ] Execute transaction broadcast test
5. [ ] Verify wallet creation/import works end-to-end

### Before Production
6. [ ] Verify production build excludes DEV code
7. [ ] Complete wallet security audit
8. [ ] Complete key derivation security audit
9. [ ] Design testnet/mainnet separation

---

## DEPLOYMENT STATUS

**Current**: ⛔ **NOT READY**

**What Works**:
- ✅ Code structure is correct
- ✅ Infrastructure is online
- ✅ Real blockchain endpoints are reachable
- ✅ Adapter correctly routes between simulator and real blockchain

**What's Broken**:
- ❌ Users default to simulator, not real blockchain
- ❌ No automatic network detection
- ❌ Transaction integration untested
- ❌ Wallet testing incomplete

**Before Testnet**: Fix 4 critical blockers (DEFAULT_NETWORK, auto-detection, signing, broadcast)  
**Before Mainnet**: Address all blockers + security audits

---

## FILES REFERENCED

- `src/config/networks.ts` — Network definitions & DEFAULT_NETWORK_ID
- `src/blockchain/client.ts` — MallchainClient initialization & routing
- `src/blockchain/adapter.ts` — HTTP/RPC adapter (getNetworkStatus, getBalances, getValidators)
- `src/layouts/MallchainDashboard.tsx` — Dashboard data loading
- `src/main.tsx` — App initialization & DEV-only window exposure
- `src/blockchain/transactions.ts` — Transaction signing (untested)
- `.env.local` — Local network configuration

---

**Audit Completed**: September 21, 2026, 12:46 UTC  
**Next Review**: After critical blockers addressed
