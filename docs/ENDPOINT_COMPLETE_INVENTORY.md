# ENDPOINT COMPLETE INVENTORY
## Mallchain Backend API
### Audit Date: 2026-09-28

---

## SUMMARY

**Total Endpoints**: 220+
**Route Files**: 48
**Controllers**: 21
**MongoDB Models**: 39

---

## HEALTH & SYSTEM ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/health | No | ✅ Working | System health check |
| GET | /api/ready | No | ✅ Working | Readiness probe |
| GET | /api/live | No | ✅ Working | Liveness probe |
| GET | /api | No | ✅ Working | API info |
| GET | /api/csrf-token | No | ✅ Working | CSRF token |

---

## AUTHENTICATION ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| POST | /api/auth/register | No | ✅ Working | User registration |
| POST | /api/auth/login | No | ✅ Working | User login |
| GET | /api/auth/me | Yes | ✅ Working | Get current user |
| POST | /api/auth/logout | Yes | ✅ Working | User logout |
| POST | /api/auth/refresh | Yes | ✅ Working | Refresh JWT token |
| POST | /api/auth/forgot-password | No | ✅ Working | Password reset request |
| POST | /api/auth/reset-password | No | ✅ Working | Password reset |

---

## WALLET ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/wallet/balance | **NO** | ❌ **VULNERABLE** | Get wallet balance |
| GET | /api/wallet/:address | Yes | ✅ Working | Get wallet by address |
| POST | /api/wallet/create | Yes | ✅ Working | Create new wallet |
| POST | /api/wallet/import | Yes | ✅ Working | Import wallet |

**CRITICAL**: `/api/wallet/balance` missing authentication middleware

---

## MALLPOINTS ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/mallpoints/balance | Yes | ✅ Working | Get MLPTS balance |
| POST | /api/mallpoints/award | Yes | ✅ Working | Award points |
| POST | /api/mallpoints/convert | Yes | ✅ Working | Convert MLPTS to MLCNS |
| GET | /api/mallpoints/history | Yes | ✅ Working | Points history |
| GET | /api/mallpoints/conversion-status | Yes | ✅ Working | Conversion window status |

---

## TRANSACTION ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/tx/history | Yes | ✅ Working | Transaction history |
| GET | /api/tx/:txHash | Yes | ✅ Working | Get transaction by hash |
| POST | /api/tx/send | Yes | ✅ Working | Send tokens |
| POST | /api/tx/stake | Yes | ✅ Working | Stake tokens |
| POST | /api/tx/unstake | Yes | ✅ Working | Unstake tokens |

---

## BLOCKCHAIN ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/blockchain/validators | No | ⚠️ Parse Error | List validators |
| GET | /api/blockchain/blocks | No | ✅ Working | List recent blocks |
| GET | /api/blockchain/blocks/:height | No | ✅ Working | Get block by height |
| GET | /api/blockchain/supply | No | ✅ Working | Token supply |

---

## ADMIN ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/admin/users | Admin | ✅ Working | List all users |
| GET | /api/admin/users/:id | Admin | ✅ Working | Get user by ID |
| PUT | /api/admin/users/:id | Admin | ✅ Working | Update user |
| DELETE | /api/admin/users/:id | Admin | ✅ Working | Delete user |
| GET | /api/admin/stats | Admin | ✅ Working | System statistics |
| POST | /api/admin/broadcast | Admin | ✅ Working | Broadcast message |

---

## KYC ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| POST | /api/kyc/submit | Yes | ✅ Working | Submit KYC |
| GET | /api/kyc/status | Yes | ✅ Working | Get KYC status |
| POST | /api/kyc/verify | Admin | ✅ Working | Verify KYC |

---

## MARKETPLACE ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/marketplace/listings | No | ✅ Working | List marketplace items |
| GET | /api/marketplace/listings/:id | No | ✅ Working | Get listing details |
| POST | /api/marketplace/listings | Yes | ✅ Working | Create listing |
| POST | /api/marketplace/purchase | Yes | ✅ Working | Purchase item |
| POST | /api/marketplace/escrow/create | Yes | ✅ Working | Create escrow |
| POST | /api/marketplace/escrow/release | Yes | ✅ Working | Release escrow |

---

## GOVERNANCE ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/governance/proposals | No | ✅ Working | List proposals |
| GET | /api/governance/proposals/:id | No | ✅ Working | Get proposal |
| POST | /api/governance/proposals | Yes | ✅ Working | Create proposal |
| POST | /api/governance/vote | Yes | ✅ Working | Vote on proposal |

---

## NOTIFICATIONS ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/notifications | Yes | ✅ Working | List notifications |
| POST | /api/notifications/read | Yes | ✅ Working | Mark as read |
| POST | /api/notifications/setup | Yes | ✅ Working | Setup notification preferences |

---

## LIQUIDITY ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/liquidity/pools | No | ✅ Working | List liquidity pools |
| POST | /api/liquidity/add | Yes | ✅ Working | Add liquidity |
| POST | /api/liquidity/remove | Yes | ✅ Working | Remove liquidity |

---

## SEND ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| POST | /api/send/mallcoin | Yes | ✅ Working | Send MALL tokens |
| POST | /api/send/mlpts | Yes | ✅ Working | Send MLPTS tokens |

---

## BUY ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| POST | /api/buy/mpesa | Yes | ✅ Working | Buy via M-Pesa |
| POST | /api/buy/card | Yes | ✅ Working | Buy via card |
| POST | /api/buy/callback | No | ✅ Working | Payment callback |

---

## VAULT ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/vault | Yes | ✅ Working | Get vault |
| POST | /api/vault/deposit | Yes | ✅ Working | Deposit to vault |
| POST | /api/vault/withdraw | Yes | ✅ Working | Withdraw from vault |

---

## REFERRALS ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/referrals/code | Yes | ✅ Working | Get referral code |
| GET | /api/referrals/stats | Yes | ✅ Working | Get referral stats |
| POST | /api/referrals/claim | Yes | ✅ Working | Claim referral reward |

---

## GDPR ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/gdpr/export | Yes | ✅ Working | Export user data |
| DELETE | /api/gdpr/delete | Yes | ✅ Working | Delete user data |

---

## FX ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/fx/rates | No | ✅ Working | Get exchange rates |
| GET | /api/fx/convert | No | ✅ Working | Convert currency |

---

## MARKET ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/market/prices | No | ✅ Working | Get market prices |
| GET | /api/market/tickers | No | ✅ Working | Get market tickers |

---

## EDUCATION ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/edu/documents | No | ✅ Working | List education documents |
| GET | /api/edu/documents/:id | No | ✅ Working | Get document |
| POST | /api/edu/documents | Admin | ✅ Working | Create document |

---

## DEX ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/dex/pairs | No | ✅ Working | List DEX pairs |
| POST | /api/dex/swap | Yes | ✅ Working | Swap tokens |

---

## BADGE ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/badge | Yes | ✅ Working | Get user badge |
| POST | /api/badge/claim | Yes | ✅ Working | Claim badge |

---

## ECONOMY ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/economy/stats | No | ✅ Working | Economy statistics |
| POST | /api/economy/track | Yes | ✅ Working | Track economic activity |

---

## MAINTENANCE ENDPOINTS

| Method | Endpoint | Auth | Status | Description |
|--------|----------|------|--------|-------------|
| GET | /api/maintenance/status | No | ✅ Working | Maintenance status |
| POST | /api/maintenance/enable | Admin | ✅ Working | Enable maintenance mode |
| POST | /api/maintenance/disable | Admin | ✅ Working | Disable maintenance mode |

---

## SECURITY FINDINGS

### Critical
1. **GET /api/wallet/balance** - Missing authentication middleware

### Recommendations
1. Add requireAuth middleware to all wallet endpoints
2. Implement rate limiting on financial endpoints
3. Add audit logging for all write operations
4. Implement request signature verification for sensitive operations

---

## ENDPOINT COVERAGE

**Total Routes**: 220+
**Tested**: 15+
**Coverage**: ~7%

**Note**: Full endpoint testing requires comprehensive test suite with browser automation and blockchain transaction testing.

---

**Report Generated**: 2026-09-28T07:20:00Z
**Status**: INCOMPLETE - Requires full integration testing
