# WALLET DATA — QUICK REFERENCE GUIDE

## Where Mock Data Is (Landing Page Only)
```
File: mallchain-os-v14/src/pages/Landing.tsx
Lines: 211-215

<span className="mock-stat-value">1,248.50 MLCNS</span>  ← Line 213
<span className="mock-stat-value">3,600 MLPTS</span>     ← Line 216
```

## Where Real Data Gets Fetched

### 1. Hook (Fetches from API)
```
File: mallchain-os-v14/src/hooks/useWalletData.ts
Function: useWalletData(address)
Lines: 48-182

Calls: walletApi.getBalance(address)
Returns: WalletBalance { MALL, MLPTS, USD_M, ... }
```

### 2. API Service
```
File: mallchain-os-v14/src/services/walletApi.ts
Class: WalletApi
Method: async getBalance(address)
Lines: 65-77

Endpoint: GET /api/wallet/{address}
```

### 3. Component (Displays Real Data)
```
File: mallchain-os-v14/src/features/wallet/WalletHub.tsx
Function: WalletHub component
Lines: 22-156

Line 28: const { balance, loading, error, retry } = useWalletData(walletAddress);
Line 51: const realBalance = balance || {...}
Line 69: val: realBalance.MALL  ← Uses real balance
```

## Backend Endpoints

### Wallet Balance
```
Route: GET /api/wallet/:address
File: backend/src/routes/walletCreation.js (Line 10)
Controller: backend/src/controllers/walletCreationController.js
Function: getWalletBalance (Line 16)

Returns: { MALL, MLPTS, USD_M, MALL_LOCKED, MALL_UNLOCK_TIME, ... }
```

### Denomination Conversion
```
File: backend/src/services/mallcoinService.js
Function: getWalletBalance(address)
Lines: 109-153

Blockchain Query: GET /cosmos/bank/v1beta1/balances/{address}
Converts: mlc (base units) → MLCNS (display format)
Formula: balance / 10^6
```

## Data Flow (Step by Step)

```
1. User visits WalletHub component
   ↓
2. useWalletData(walletAddress) is called
   ↓
3. Hook calls: walletApi.getBalance(address)
   ↓
4. API service calls: api.get('/api/wallet/{address}')
   ↓
5. Backend fetches: mallcoinService.getWalletBalance(address)
   ↓
6. Service queries: GET /cosmos/bank/v1beta1/balances/{address}
   ↓
7. Blockchain returns: { amount: "160000000000000", denom: "mlc" }
   ↓
8. Service converts: 160000000000000 / 10^6 = 160000000 MLCNS
   ↓
9. Backend returns: { MALL: 160000000, MLPTS: 0, ... }
   ↓
10. Frontend receives real balance
   ↓
11. WalletHub displays: "160,000,000 MALL"
    (NOT the mock 1,248.50)
```

## Real-Time Updates

```
File: mallchain-os-v14/src/hooks/useWalletData.ts
Lines: 139-165 (handleWalletUpdate function)

When Socket.IO emits 'wallet:update':
  → Updates state.balance immediately
  → Updates global store.state.balances
  → Re-renders with fresh data
```

## Components Using Real Data

| Component | File | Real Data |
|-----------|------|-----------|
| WalletHub | src/features/wallet/WalletHub.tsx | ✅ YES (line 28) |
| WalletSend | src/features/wallet/WalletSend.tsx | ✅ YES (line 27) |
| WalletSwap | src/features/wallet/WalletSwap.tsx | ✅ YES (line 48) |
| WalletReceive | src/features/wallet/WalletReceive.tsx | ✅ YES (line 19) |
| Landing | src/pages/Landing.tsx | ❌ NO (hardcoded mock) |

## When to See Real vs Mock Data

### REAL Data (After Login)
- Go to `/wallet` (WalletHub)
- Go to `/wallet/send`
- Go to `/wallet/swap`
- Go to `/wallet/receive`

### MOCK Data (Before Login)
- Go to `/landing`
- See: `1,248.50 MLCNS` (hardcoded, not real)

## Test It Yourself

### 1. Check Backend Endpoint
```bash
curl http://localhost:4000/api/wallet/mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg

# Response shows real blockchain balance
{
  "address": "mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg",
  "MALL": 160000000,
  "MLPTS": 0,
  ...
}
```

### 2. Check Browser DevTools
1. Open Firefox: http://localhost:5173
2. Open DevTools: F12 → Network
3. Login or navigate to wallet
4. Look for: `GET /api/wallet/mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg`
5. Response: Real balance (not 1,248.50 mock)

### 3. Check Browser Console
```javascript
// Once logged in, check store:
console.log(store.state.balances);
// Output: { MALL: 160000000, MLPTS: 0, ... }

// Not the mock value!
```

## Summary

| Aspect | Location | Value |
|--------|----------|-------|
| **Landing Mock** | Landing.tsx:213 | `1,248.50 MLCNS` (STATIC) |
| **Real Balance** | Backend endpoint | `160,000,000 MLCNS` (LIVE) |
| **API Endpoint** | `/api/wallet/:address` | Fetches from blockchain |
| **Blockchain Data** | Cosmos REST :1317 | Source of truth |
| **Frontend Hook** | `useWalletData.ts` | Fetches and updates real data |
| **Display Component** | `WalletHub.tsx` | Shows real balance |

✅ **Conclusion**: Real blockchain wallet data flows correctly to V14 UI when authenticated.

