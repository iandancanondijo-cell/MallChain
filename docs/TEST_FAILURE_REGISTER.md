# Test Failure Register

**Audit Date:** 2026-09-28
**Scope:** All failures, errors, and anomalies discovered during the Full System Forensic Acceptance Audit

---

## Classification

- **CRITICAL** — Security vulnerability or data loss risk; blocks production
- **HIGH** — Core feature broken; no workaround
- **MEDIUM** — Feature degraded; workaround exists
- **LOW** — Cosmetic or minor functional issue
- **INFO** — Observation, not a failure

---

## CRITICAL Failures

### C-1: Unauthenticated Wallet Balance Access

| Field | Value |
|-------|-------|
| **ID** | C-1 |
| **Severity** | CRITICAL |
| **Component** | Backend / Wallet Routes |
| **Endpoint** | GET /api/wallet/:address/balance |
| **File** | backend/src/routes/walletCreation.js |
| **Description** | The `/balance` sub-route on walletCreation routes does not enforce `requireAuth` middleware. Any unauthenticated client can query any wallet's balance by address. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/wallet/balance` → HTTP 200 with balance data |
| **Expected** | HTTP 401 Unauthorized without valid JWT |
| **Actual** | HTTP 200 with balance payload |
| **Impact** | Financial data exposure; violates user privacy; regulatory risk |
| **Fix** | Add `requireAuth` middleware to the route definition |
| **Status** | OPEN |

### C-2: Route Parameter Collisions — Multiple Endpoints Broken

| Field | Value |
|-------|-------|
| **ID** | C-2 |
| **Severity** | CRITICAL |
| **Component** | Backend / Route Definitions |
| **Endpoints Affected** | GET /api/wallet/balance, GET /api/mallpoints/balance, GET /api/edu/courses |
| **Description** | Parameterized routes (`:address`, `:id`) are defined before literal sibling routes, causing Express to capture the literal segment as a parameter. `/api/wallet/balance` → `req.params.address = "balance"`. `/api/edu/courses` → `req.params.id = "courses"` → MongoDB ObjectId cast error → HTTP 500. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/edu/courses` → 500 "Cast to ObjectId failed for value 'courses'" |
| **Expected** | Course list returned |
| **Actual** | HTTP 500 internal server error |
| **Impact** | Education module completely inaccessible; wallet/mallpoints balance endpoints return wrong data |
| **Fix** | Reorder routes: literal paths before parameterized paths |
| **Status** | OPEN |

---

## HIGH Failures

### H-1: All Custom Module gRPC-Gateway Queries Return 501

| Field | Value |
|-------|-------|
| **ID** | H-1 |
| **Severity** | HIGH |
| **Component** | Blockchain / Custom Modules |
| **Endpoints** | /mall/mallpoints/params, /mall/mallcoin/params, /mall/marketplace/params, /mall/governance/params, /mall/edu/params, /mall/dex/params, /mall/vault/params, /mall/badge/params |
| **Description** | All 12 custom x/ modules have their query gRPC-gateway routes unregistered. Every REST query to custom modules returns `{"code":12,"message":"Not Implemented"}`. |
| **Reproduction** | `curl http://127.0.0.1:1317/mall/mallpoints/params` → `{"code":12,"message":"Not Implemented"}` |
| **Expected** | Module parameters returned as JSON |
| **Actual** | HTTP 501 Not Implemented |
| **Impact** | Frontend cannot query any on-chain module state; all module data is invisible to users |
| **Fix** | Register gRPC-gateway routes in each module's `module.go` RegisterServices |
| **Status** | OPEN |

### H-2: Education Endpoint Returns 500 Internal Server Error

| Field | Value |
|-------|-------|
| **ID** | H-2 |
| **Severity** | HIGH |
| **Component** | Backend / Education Routes |
| **Endpoint** | GET /api/edu/courses |
| **Description** | Route collision causes "courses" to be treated as MongoDB ObjectId, triggering unhandled cast exception. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/edu/courses` → HTTP 500 |
| **Expected** | HTTP 200 with course array |
| **Actual** | HTTP 500 with MongoDB cast error |
| **Impact** | Education feature completely broken |
| **Fix** | Reorder routes; add input validation for ObjectId params |
| **Status** | OPEN |

### H-3: Marketplace Listings Endpoint Not Found

| Field | Value |
|-------|-------|
| **ID** | H-3 |
| **Severity** | HIGH |
| **Component** | Backend / Marketplace Routes |
| **Endpoint** | GET /api/marketplace/listings |
| **Description** | The `/api/marketplace` mount point uses `marketplaceEscrowRoutes` which does not define a GET /listings handler. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/marketplace/listings` → HTML 404 |
| **Expected** | HTTP 200 with listings array |
| **Actual** | HTML 404 "Cannot GET" |
| **Impact** | Marketplace browsing completely broken |
| **Fix** | Add GET /listings route to marketplaceEscrowRoutes or create separate marketplace listing routes |
| **Status** | OPEN |

### H-4: Send/Transfer Estimate Endpoint Not Found

| Field | Value |
|-------|-------|
| **ID** | H-4 |
| **Severity** | HIGH |
| **Component** | Backend / Send Routes |
| **Endpoint** | POST /api/send/estimate |
| **Description** | The send route does not define an /estimate sub-route. May also be blocked by maintenanceGuard. |
| **Reproduction** | `curl -X POST http://127.0.0.1:4000/api/send/estimate` → HTML 404 |
| **Expected** | Fee estimate returned |
| **Actual** | HTML 404 |
| **Impact** | Users cannot estimate transfer fees before sending |
| **Fix** | Add POST /estimate route to sendRoutes |
| **Status** | OPEN |

### H-5: Frontend-Backend Route Mismatch

| Field | Value |
|-------|-------|
| **ID** | H-5 |
| **Severity** | HIGH |
| **Component** | Frontend / Backend Integration |
| **Description** | Frontend (mallchain-os-v14) expects endpoints that don't exist on the backend: GET /api/wallet, POST /api/wallet/create, GET /api/notifications. |
| **Evidence** | Frontend test files reference these routes; curl returns 404 for all |
| **Impact** | Wallet creation, notification display, and wallet info pages will fail in production |
| **Fix** | Either add missing backend routes or update frontend to use correct endpoints |
| **Status** | OPEN |

---

## MEDIUM Failures

### M-1: Mallpoints Balance Returns Wrong Address

| Field | Value |
|-------|-------|
| **ID** | M-1 |
| **Severity** | MEDIUM |
| **Component** | Backend / Mallpoints Routes |
| **Endpoint** | GET /api/mallpoints/balance |
| **Description** | Due to route collision, returns `{"address":"balance"}` instead of actual user address. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/mallpoints/balance` |
| **Expected** | User's actual mall-address with correct balance |
| **Actual** | `{"address":"balance","balance":0,...}` |
| **Impact** | Users see incorrect balance data |
| **Fix** | Reorder routes (same root cause as C-2) |
| **Status** | OPEN |

### M-2: CSRF Token Required for Logout But Not Easily Obtainable

| Field | Value |
|-------|-------|
| **ID** | M-2 |
| **Severity** | MEDIUM |
| **Component** | Backend / Auth |
| **Endpoint** | POST /api/auth/logout |
| **Description** | Logout requires CSRF token but the token issuance flow is not well-documented. API clients must first extract csrf_token from Set-Cookie header. |
| **Reproduction** | `curl -X POST http://127.0.0.1:4000/api/auth/logout` → `{"error":"invalid or missing CSRF token"}` |
| **Expected** | Logout should work with session cookie alone, or CSRF token should be clearly provided |
| **Actual** | Rejected without CSRF token |
| **Impact** | API clients and automated tools cannot cleanly logout |
| **Fix** | Either exempt logout from CSRF (it's already auth-gated) or provide CSRF via a GET /api/csrf-token endpoint |
| **Status** | OPEN |

### M-3: Governance Proposals Source Unavailable

| Field | Value |
|-------|-------|
| **ID** | M-3 |
| **Severity** | MEDIUM |
| **Component** | Backend / Governance |
| **Endpoint** | GET /api/governance/proposals |
| **Description** | Returns empty proposals with `"source":"unavailable"` — backend cannot connect to or query chain governance module. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/governance/proposals` |
| **Expected** | Proposals from on-chain governance module |
| **Actual** | Empty list, source="unavailable" |
| **Impact** | Governance feature non-functional; users cannot see or create proposals |
| **Fix** | Fix chain query integration; register gRPC-gateway routes (see H-1) |
| **Status** | OPEN |

### M-4: HTML Error Responses Instead of JSON

| Field | Value |
|-------|-------|
| **ID** | M-4 |
| **Severity** | MEDIUM |
| **Component** | Backend / Express Error Handling |
| **Description** | 404 errors return HTML (`<!DOCTYPE html>...Cannot GET /path`) instead of JSON. Frontend API clients expecting JSON will fail to parse. |
| **Reproduction** | Any request to non-existent route |
| **Expected** | `{"error":"Not Found","statusCode":404}` |
| **Actual** | HTML error page |
| **Impact** | Frontend error handling breaks; poor API experience |
| **Fix** | Add catch-all JSON 404 handler after all routes |
| **Status** | OPEN |

### M-5: Notifications Route Not Found

| Field | Value |
|-------|-------|
| **ID** | M-5 |
| **Severity** | MEDIUM |
| **Component** | Backend / Notifications |
| **Endpoint** | GET /api/notifications |
| **Description** | notificationsRoutes is mounted but does not define a GET / handler. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/notifications` → HTML 404 |
| **Expected** | Notification list or auth error |
| **Actual** | HTML 404 |
| **Impact** | Notification system inaccessible |
| **Fix** | Add GET / handler to notificationsRoutes |
| **Status** | OPEN |

### M-6: Rewards Route Not Found

| Field | Value |
|-------|-------|
| **ID** | M-6 |
| **Severity** | MEDIUM |
| **Component** | Backend / Rewards |
| **Endpoint** | GET /api/rewards |
| **Description** | rewardsRoutes is mounted but does not define a GET / handler. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/rewards` → HTML 404 |
| **Expected** | Rewards list |
| **Actual** | HTML 404 |
| **Impact** | Rewards system inaccessible |
| **Fix** | Add GET / handler to rewardsRoutes |
| **Status** | OPEN |

---

## LOW Failures

### L-1: Buy/Rates Endpoint Not Found

| Field | Value |
|-------|-------|
| **ID** | L-1 |
| **Severity** | LOW |
| **Component** | Backend / Buy Routes |
| **Endpoint** | GET /api/buy/rates |
| **Description** | buyRoutes mounted with maintenanceGuard but no /rates sub-route defined. |
| **Reproduction** | `curl http://127.0.0.1:4000/api/buy/rates` → HTML 404 |
| **Status** | OPEN |

### L-2: Blockchain Validators/Supply Backend Proxies Missing

| Field | Value |
|-------|-------|
| **ID** | L-2 |
| **Severity** | LOW |
| **Component** | Backend / Blockchain Routes |
| **Endpoints** | GET /api/blockchain/validators, GET /api/blockchain/supply |
| **Description** | Backend does not proxy these endpoints; clients must query chain REST directly at :1317. |
| **Status** | OPEN |

---

## INFO Observations

### I-1: Zero MLCNS (Mallcoin) On-Chain Supply

| Field | Value |
|-------|-------|
| **ID** | I-1 |
| **Component** | Blockchain / x/mlcoin |
| **Description** | The "mlc" denomination has zero supply on-chain. No Mallcoin has ever been minted. Module accounts for mlcoin, mallpoints, governance all show zero balances. |
| **Evidence** | `curl http://127.0.0.1:1317/cosmos/bank/v1beta1/supply` → only "stake" denomination exists |
| **Impact** | Token economy not yet activated; all MLPTS/MLCNS/MGP-20 flows are untested on-chain |

### I-2: No Go Compiler Available for Module Tests

| Field | Value |
|-------|-------|
| **ID** | I-2 |
| **Component** | Blockchain / Testing |
| **Description** | Go compiler not installed in audit environment. Cannot run `go test` for any x/ module. |
| **Impact** | Module-level unit tests unverified |

### I-3: Single Validator Network

| Field | Value |
|-------|-------|
| **ID** | I-3 |
| **Component** | Blockchain |
| **Description** | Only 1 validator (validator1) with 1,010,000,000 stake tokens. Total supply: 4,003,165,856 stake. No other validators or delegators. |
| **Impact** | Network is centralized; not representative of production multi-validator setup |

### I-4: Maintenance Guards on Financial Routes

| Field | Value |
|-------|-------|
| **ID** | I-4 |
| **Component** | Backend |
| **Description** | 10 financial routes are behind `maintenanceGuard()`: vault, send, marketplace, payment, buy, badge, withdraw, staking, key-vault, dex. If maintenance mode is activated, all these routes return 503. |
| **Impact** | Could block all financial operations during maintenance windows |

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | OPEN |
| HIGH | 5 | OPEN |
| MEDIUM | 6 | OPEN |
| LOW | 2 | OPEN |
| INFO | 4 | Documented |
| **Total** | **19** | |

## Production Blockers

The following must be resolved before production deployment:

1. **C-1** — Unauthenticated wallet balance access (security vulnerability)
2. **C-2** — Route parameter collisions (breaks wallet, mallpoints, education)
3. **H-1** — Custom module gRPC-gateway registration (all on-chain queries broken)
4. **H-3** — Marketplace listings endpoint missing
5. **H-5** — Frontend-backend route alignment
