# Blockchain Services Architecture Analysis

**Workspace:** Marketplace Blockchain (Mallchain)  
**Date:** May 30, 2026  
**Analysis Focus:** Backend API routes, controllers, Go blockchain app, modules, and explorer backend

---

## 1. BACKEND API ROUTES (backend/src/routes/)

Complete list of 27 route modules:

| Route File | Purpose | Key Endpoints |
|-----------|---------|---------------|
| `auth.js` | User authentication | POST /register, /login, /google, /google/callback |
| `blockchain.js` | Blockchain data proxy | GET /health, /stats, /emission-state, /transactions, /market/trades, /market/price |
| `market.js` | Market data | GET /price, /supply, /monthly_emissions, /monthly_breakdown |
| `send.js` | Token transfer (queued) | POST /send, GET /:id |
| `staking.js` | Staking operations | GET /summary/:address, /info/:address, POST /broadcast, /delegate, /undelegate, /claim |
| `governance.js` | On-chain governance | GET /proposals, /proposal/:id, /proposal/:id/vote/:voter, POST /vote, /broadcast |
| `vault.js` | Vault management | GET /, /:id, POST /, PUT /:id, DELETE /:id |
| `faucet.js` | Token faucet | GET /status, POST /mlcns |
| `wallets.js` | Wallet management | List, create, update, delete wallets |
| `walletConnection.js` | Wallet connectivity | Connect, disconnect, derive addresses from mnemonics |
| `buy.js` | Purchase/buying | Transaction buying logic |
| `blockchainTx.js` | Transaction management | Blockchain transaction endpoints |
| `liquidity.js` | DEX liquidity | GET /pools, /pools/:poolId, /position, POST /add, /remove |
| `mallpoints.js` | MallPoints token | Points operations |
| `notifications.js` | User notifications | Notification endpoints |
| `onchain.js` | On-chain data | Direct blockchain queries |
| `invite.js` | Referral/invite system | Invite endpoints |
| `history.js` | Transaction history | Historical data retrieval |
| `payment.js` | Payment processing | Payment endpoints |
| `tx.js` | Transaction endpoints | Generic transaction endpoints |
| `validators.js` | Validator information | GET validators, validator details |
| `addressMap.js` | Address mapping | Address mapping utilities |
| `rewards.js` | Reward distribution | Reward endpoints |
| `explorer.js` | Explorer data | Explorer-specific endpoints |
| `transactions.js` | Transaction operations | Send, query transaction status |

**Rate Limiting Implementation:**
- Basic rate limiter in [middleware/rateLimiter.js](backend/src/middleware/rateLimiter.js)
- Staking: 30 requests/min
- Faucet: 10 requests/min (configurable)

---

## 2. BACKEND CONTROLLERS (backend/src/controllers/)

16 controller modules handling business logic:

| Controller | Purpose |
|-----------|---------|
| `authController.js` | Register, login, OAuth callback |
| `blockchainController.js` | Proxy calls to blockchain REST API |
| `blockchainTxController.js` | Blockchain transaction handling |
| `faucetController.js` | Faucet status, MLCNS distribution |
| `governanceController.js` | Proposal management, voting |
| `liquidityController.js` | DEX liquidity operations |
| `marketController.js` | Market data aggregation |
| `notificationsController.js` | Notification delivery |
| `rewardsController.js` | Reward calculation/distribution |
| `sendController.js` | Token send operations |
| `stakingController.js` | Staking/delegation operations |
| `txController.js` | Generic transaction handling |
| `validatorController.js` | Validator queries |
| `vaultController.js` | Vault CRUD operations |
| `walletConnectionController.js` | Wallet connection via address/seed phrase/private key |
| `walletsController.js` | Wallet management |

**Key Pattern in [blockchainController.js](backend/src/controllers/blockchainController.js):**
- Proxies requests to blockchain REST API
- Generic error handling with minimal context
- No request/response validation

**Key Pattern in [stakingController.js](backend/src/controllers/stakingController.js):**
- Aggregates data from 4 blockchain endpoints in parallel
- Broadcasts client-signed transactions
- Server-signed transactions require authentication

---

## 3. BACKEND SERVICES (backend/src/services/)

10 service modules providing business logic:

| Service | Purpose |
|---------|---------|
| `badgeService.js` | Badge/achievement logic |
| `blockchainListener.js` | Monitors pending transactions, reconciles status |
| `explorerService.js` | Explorer data operations |
| `faucetService.js` | Faucet fund management |
| `governanceService.js` | Governance operations |
| `mallcoinService.js` | MallCoin token logic |
| `mallcoinTxBuilder.js` | Builds MLCN transactions |
| `mallpointsService.js` | MallPoints operations |
| `stakingService.js` | Staking aggregation (parallel REST calls) |
| `transactionService.js` | Transaction logic |

**Key Pattern in [blockchainListener.js](backend/src/services/blockchainListener.js):**
- Polls every 3 seconds (configurable)
- Reconciles pending transactions against blockchain state
- Emits Socket.io updates on status changes
- No exponential backoff; continuous polling

---

## 4. GO BLOCKCHAIN APP STRUCTURE (app/ and cmd/marketplaced/)

### App Configuration ([app/app.go](app/app.go))

- **Name:** marketplace
- **Account Prefix:** mall (bech32 addresses: mall1...)
- **Chain Coin Type:** 118
- **Built on:** Cosmos SDK with CometBFT consensus

### Keepers (Exposed in App struct)
- AuthKeeper, BankKeeper, StakingKeeper, SlashingKeeper, MintKeeper
- DistrKeeper, GovKeeper (standard Cosmos keepers)
- IBC keepers (interchain accounts, transfer)

### Custom Modules ([app/custom_modules.go](app/custom_modules.go))

Three custom modules registered manually (non-proto):

| Module | Purpose |
|--------|---------|
| **Crosschain** | IBC cross-chain communication |
| **DEX** | Decentralized Exchange |
| **Governance** | Custom on-chain governance |

**Pattern:** Manual registration via RegisterStores → Build Keeper → RegisterModules

---

## 5. BLOCKCHAIN MODULES (x/)

### Standard SDK Modules via Config
- auth, bank, staking, slashing, mint, distribution
- governance, params, consensus, upgrade
- IBC (transfer, interchain accounts)

### Custom Modules (9 modules)

| Module | Files | Purpose |
|--------|-------|---------|
| **badge** | keeper/, module/, types/, client/ | Achievement/badge system |
| **crosschain** | keeper/, module/, types/, client/ | Cross-chain bridge operations |
| **dex** | keeper/, module/, types/ | Decentralized exchange (swap, liquidity) |
| **governance** | keeper/, module.go, types/, client/ | Custom governance (proposals, voting) |
| **mallcoin** | keeper/, module/, types/, client/ | Native token (MALL) |
| **mallpoints** | keeper/, module/, types/ | Points/reward token |
| **marketplace** | keeper/ only | Marketplace transactions |
| **mlcoin** | keeper/, module/, types/ | Secondary token |
| **vault** | keeper/, module/, types/, crypto/, cmd/ | Custody/vault operations |

**Note:** marketplace/ has only keeper/ (may be incomplete)

---

## 6. EXPLORER BACKEND (explorer/backend/)

### Architecture
- **Framework:** Express.js
- **Database:** PostgreSQL (pg)
- **Real-time:** Socket.io

### Database Connection ([explorer/backend/db.js](explorer/backend/db.js))
- PostgreSQL pool configuration
- Environment-based credentials

### Indexers ([explorer/backend/indexers/](explorer/backend/indexers/))

| Indexer | Responsibility |
|---------|-----------------|
| `blockIndexer.js` | Fetch blocks from RPC, store in DB |
| `txIndexer.js` | Fetch transactions, parse results, store in DB |
| `validatorIndexer.js` | Track validators |
| `validatorMetricsTracker.js` | Track validator metrics over time |

### Main Indexer Loop ([explorer/backend/indexer.js](explorer/backend/indexer.js))
```
Start → Get latest block height → Compare with last indexed
→ Index block → Index transactions → Emit new_block event → Retry
```

**Error Handling:** Tracks consecutive errors (max 10), continues on RPC failures

### Explorer API Server ([explorer/backend/server.js](explorer/backend/server.js))
- REST API for explorer data
- Socket.io for real-time updates
- Internal endpoints: `/internal/emit/new_block`, `/internal/emit/new_transactions`

---

## 7. MIDDLEWARE & INFRASTRUCTURE

### Authentication ([backend/src/middleware/auth.js](backend/src/middleware/auth.js))
- JWT-based authentication
- Validates token, fetches user from MongoDB
- Simple error responses

### Rate Limiting ([backend/src/middleware/rateLimiter.js](backend/src/middleware/rateLimiter.js))
- express-rate-limit wrapper
- Per-route configuration
- Standard headers enabled

### Configuration ([backend/src/config/index.js](backend/src/config/index.js))
- Centralized config management
- Chain: RPC, REST, prefix, denom, gas price
- Secrets: JWT, session, admin API key
- Transaction polling intervals

---

## SUMMARY: IMPLEMENTED FEATURES & SERVICES

### ✅ Currently Implemented

**Blockchain Operations:**
- Native token transfers (MALL, MLCN)
- Staking/delegation/rewards
- On-chain governance (proposals, voting)
- DEX (liquidity pools, swaps)
- Vault/custody system
- Cross-chain bridge
- Faucet for testnet tokens
- Badge/achievement system

**Marketplace Features:**
- Buy/sell operations
- Transaction history
- Reward distribution
- MallPoints token system
- Invite/referral system
- Wallet management (multiple input methods)

**Infrastructure:**
- MongoDB for persistent data
- PostgreSQL for blockchain explorer
- Socket.io for real-time updates
- Redis (configured but usage unclear)
- Transaction queue (Bull.js)

**Monitoring:**
- Basic blockchain health endpoint
- Transaction reconciliation listener
- Block/transaction indexer with event emission

---

## MISSING/UNDERDEVELOPED PATTERNS

### 🔴 Critical Gaps

| Area | Issue | Impact |
|------|-------|--------|
| **Error Handling** | Generic error responses, no categorization or specific error codes | Users can't distinguish transient vs permanent failures; no retry logic |
| **Input Validation** | Limited validation on API endpoints; no schema validation | Garbage data can reach blockchain, wasted gas, bad state |
| **Request/Response Logging** | No structured logging of API requests/responses | Can't audit transactions or debug issues |
| **Transaction Retry Logic** | No exponential backoff; simple polling | Can overload node during outages |
| **Circuit Breaker Pattern** | No circuit breaker for external API calls (blockchain, RPC) | Single node failure cascades to API |
| **Health Checks** | Basic health endpoint but no comprehensive monitoring | Can't detect partial failures |
| **API Documentation** | No OpenAPI/Swagger specification | Frontend/third parties can't integrate |
| **Query Optimization** | Explorer uses basic queries with no indexing strategy | Performance degrades with data growth |
| **Caching Layer** | No response caching or Redis integration | Repeated queries hit blockchain every time |

### 🟡 Design Concerns

| Area | Concern |
|------|---------|
| **Transaction Broadcasting** | Mix of client-signed and server-signed transactions increases complexity and attack surface |
| **Real-time Updates** | Socket.io events not tied to transaction confirmation (emits on status change, not finality) |
| **Validator Indexing** | validatorMetricsTracker exists but no clear integration with API |
| **Governance Module** | Custom governance separate from Cosmos SDK governance; unclear interaction |
| **Marketplace Module** | Incomplete (only keeper/); missing module.go, types, client |
| **Address Derivation** | Supports multiple prefix schemes (cosmos, mall, tmp); potential for address confusion |
| **Wallet Storage** | No HSM/cold storage pattern; unclear key management in vault |
| **Rate Limiting** | Not comprehensive; some routes may lack limits |

### 🟠 Operational Gaps

| Area | Issue |
|------|-------|
| **Metrics/Observability** | No Prometheus metrics, no structured logging (no Winston/Pino) |
| **Alerting** | No alert system for blockchain state anomalies |
| **Backup/Recovery** | No documented backup strategy for explorer DB or hot wallets |
| **Load Testing** | No load test results; unclear capacity limits |
| **Graceful Degradation** | No fallback when blockchain is unavailable |
| **Version Compatibility** | No versioning strategy for API endpoints |

---

## PRIORITY ENHANCEMENT AREAS

### Priority 1: Error Handling & Resilience (HIGH IMPACT, REQUIRED)

**Files to enhance:**
- `backend/src/controllers/blockchainController.js`
- `backend/src/controllers/stakingController.js`
- `backend/src/services/blockchainListener.js`
- `explorer/backend/indexer.js`

**Recommendations:**
1. **Implement Error Codes** — Define HTTP status codes for specific failure modes:
   - 503 = blockchain unavailable
   - 400 = invalid transaction
   - 422 = insufficient gas/balance
   - 504 = timeout
   
2. **Add Circuit Breaker** — Fail fast when blockchain unreachable:
   ```javascript
   // Use opossum or similar
   const breaker = new CircuitBreaker(blockchainCall, { timeout: 5000 });
   ```

3. **Exponential Backoff** — Prevent node flooding:
   ```javascript
   // blockchainListener.js: backoff from 3s → 10s → 30s → 60s
   ```

4. **Structured Logging** — Add Winston/Pino:
   ```javascript
   // Every major operation: logger.info({ txHash, status, block }, 'tx reconciled')
   ```

---

### Priority 2: Input Validation & Security (HIGH IMPACT, REQUIRED)

**Files to enhance:**
- `backend/src/routes/transactions.js`
- `backend/src/routes/staking.js`
- `backend/src/controllers/walletConnectionController.js`

**Recommendations:**
1. **Schema Validation** — Use Joi/Zod on all inputs:
   ```javascript
   // routes/staking.js
   const schema = Joi.object({
     address: Joi.string().required().pattern(/^mall[a-z0-9]{39,}$/),
     amount: Joi.number().positive().required(),
   });
   ```

2. **Transaction Verification** — Validate signatures before broadcast:
   ```javascript
   // If client-signed, verify signature against sender address
   // If server-signed, require auth + rate limit aggressive
   ```

3. **Gas Estimation Bounds** — Prevent runaway gas:
   ```javascript
   // Validate gas_wanted ≤ max allowed per role
   ```

---

### Priority 3: Observability & Monitoring (MEDIUM IMPACT)

**Files to create/enhance:**
- Create `backend/src/utils/logger.js` (Winston)
- Create `backend/src/utils/metrics.js` (Prometheus)
- Enhance `explorer/backend/indexer.js`

**Recommendations:**
1. **Prometheus Metrics:**
   - `blockchain_api_latency` (histogram)
   - `transaction_broadcast_success_rate` (counter)
   - `blocks_indexed_per_minute` (gauge)
   - `explorer_db_query_latency` (histogram)

2. **Structured Logging:**
   - Every API request: { method, path, statusCode, duration }
   - Every blockchain operation: { txHash, status, block, gas }
   - Every indexer operation: { height, txCount, duration }

3. **Health Checks:**
   - Add `/health/ready` (dependencies OK)
   - Add `/health/live` (service running)
   - Check: blockchain RPC, database, Redis

---

### Priority 4: Query Optimization & Caching (MEDIUM IMPACT)

**Files to enhance:**
- `explorer/backend/indexers/blockIndexer.js`
- `explorer/backend/indexers/txIndexer.js`
- `backend/src/services/stakingService.js`

**Recommendations:**
1. **Database Indexing** (explorer):
   ```sql
   CREATE INDEX idx_blocks_height ON blocks(height);
   CREATE INDEX idx_transactions_block_height ON transactions(block_height);
   CREATE INDEX idx_transactions_sender_receiver ON transactions(sender, receiver);
   CREATE INDEX idx_validators_address ON validators(address);
   ```

2. **Redis Caching:**
   ```javascript
   // Cache emission state: 1-hour TTL
   const cacheKey = 'emission:state';
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

3. **Response Aggregation Caching:**
   - Staking summary: cache 30 seconds
   - Market price: cache 10 seconds
   - Validator list: cache 5 minutes

---

### Priority 5: API Documentation & Versioning (MEDIUM IMPACT)

**Recommendations:**
1. **OpenAPI Spec** — Generate from routes:
   ```javascript
   // Use swagger-jsdoc in each controller
   /**
    * @swagger
    * /api/staking/info/{address}:
    *   get:
    *     parameters:
    *       - in: path
    *         name: address
    *         required: true
    *         schema:
    *           type: string
    */
   ```

2. **API Versioning:**
   - Routes: `/api/v1/staking/...`
   - Support v1 and v2 in parallel during migration
   - Deprecation headers: `Deprecation: true`, `Sunset: Wed, 21 Dec 2026 00:00:00 GMT`

---

### Priority 6: Marketplace Module Completion (LOW-MEDIUM IMPACT)

**File:** `x/marketplace/` (currently only has keeper/)

**Missing:**
- `keeper/` exists but `module.go` not created
- `types/` directory for message/query definitions
- `client/` for CLI commands

**Action:** Compare structure to `x/dex/` or `x/vault/` and complete scaffold

---

## ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vue/React)                    │
│                      (port 5173)                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼──────────────┐  ┌──────▼────────────────┐
│   BACKEND API        │  │  EXPLORER API        │
│   (Express.js)       │  │  (Express.js)        │
│   Port: 4000         │  │  Port: 5000          │
│                      │  │                      │
│ ├─ Auth              │  │ ├─ Block indexer     │
│ ├─ Staking           │  │ ├─ TX indexer        │
│ ├─ Governance        │  │ ├─ Validator tracking│
│ ├─ Market/DEX        │  │ └─ REST API          │
│ ├─ Vault             │  │                      │
│ ├─ Transactions      │  └──────┬───────────────┘
│ └─ Wallet Mgmt       │         │
└───────┬──────────────┘         │
        │                        │
        │              ┌─────────▼─────────┐
        │              │  PostgreSQL       │
        │              │  (Explorer DB)    │
        │              │  Port: 5432       │
        │              │                   │
        │              │ ├─ blocks table   │
        │              │ ├─ transactions   │
        │              │ └─ validators     │
        │              └───────────────────┘
        │
        │         ┌─────────────────────────────┐
        │         │  BLOCKCHAIN (Cosmos SDK)    │
        │         │  Port: 26657 (RPC)          │
        │         │  Port: 1317 (REST)          │
        │         │                             │
        │         │ Modules:                    │
        │         │ ├─ auth, bank, staking      │
        │         │ ├─ mallcoin, mlcoin         │
        │         │ ├─ dex, marketplace         │
        │         │ ├─ governance (custom)      │
        │         │ ├─ vault, badge             │
        │         │ ├─ crosschain               │
        │         │ └─ IBC (interchain accts)   │
        │         │                             │
        │         └─────────────────────────────┘
        │
        └────────────────────┐
                             │
                    ┌────────▼────────┐
                    │   MongoDB       │
                    │   (App Data)    │
                    │   Port: 27017   │
                    │                 │
                    │ Collections:    │
                    │ ├─ users        │
                    │ ├─ wallets      │
                    │ ├─ transactions │
                    │ ├─ vaults       │
                    │ └─ [others]     │
                    └─────────────────┘

Real-time: Socket.io connects frontend to backend for TX updates
Polling: blockchainListener checks blockchain every 3s
Indexing: Indexer polls RPC every ~3s for new blocks
```

---

## IMMEDIATE ACTION ITEMS

### Week 1 (CRITICAL)
- [ ] Implement error codes & generic error handler middleware
- [ ] Add input validation schema to all POST/PUT routes
- [ ] Add circuit breaker for blockchain RPC calls
- [ ] Create structured logging (Winston/Pino)

### Week 2
- [ ] Implement exponential backoff in blockchainListener
- [ ] Add Prometheus metrics to key endpoints
- [ ] Create `/health/ready` and `/health/live` endpoints
- [ ] Document error codes and HTTP status mappings

### Week 3
- [ ] Add Redis caching layer
- [ ] Create database indexes for explorer
- [ ] Generate OpenAPI specification
- [ ] Complete marketplace module scaffolding

---

## FILES REFERENCE MAP

**Core Backend Files:**
- [backend/src/index.js](backend/src/index.js) — Server setup
- [backend/src/config/index.js](backend/src/config/index.js) — Configuration
- [backend/src/middleware/auth.js](backend/src/middleware/auth.js) — Auth
- [backend/src/middleware/rateLimiter.js](backend/src/middleware/rateLimiter.js) — Rate limiting

**Route Handlers:**
- [backend/src/routes/blockchain.js](backend/src/routes/blockchain.js) — Blockchain proxy
- [backend/src/routes/staking.js](backend/src/routes/staking.js) — Staking
- [backend/src/routes/governance.js](backend/src/routes/governance.js) — Governance
- [backend/src/routes/transactions.js](backend/src/routes/transactions.js) — Transactions

**Controllers:**
- [backend/src/controllers/blockchainController.js](backend/src/controllers/blockchainController.js) — Blockchain logic
- [backend/src/controllers/stakingController.js](backend/src/controllers/stakingController.js) — Staking logic
- [backend/src/controllers/walletConnectionController.js](backend/src/controllers/walletConnectionController.js) — Wallet logic

**Services:**
- [backend/src/services/blockchainListener.js](backend/src/services/blockchainListener.js) — Transaction reconciliation
- [backend/src/services/stakingService.js](backend/src/services/stakingService.js) — Staking aggregation

**Go Blockchain:**
- [app/app.go](app/app.go) — App structure
- [app/custom_modules.go](app/custom_modules.go) — Custom module registration
- [cmd/marketplaced/main.go](cmd/marketplaced/main.go) — Entry point

**Explorer:**
- [explorer/backend/server.js](explorer/backend/server.js) — Server setup
- [explorer/backend/indexer.js](explorer/backend/indexer.js) — Main indexer loop
- [explorer/backend/db.js](explorer/backend/db.js) — Database connection
- [explorer/backend/indexers/blockIndexer.js](explorer/backend/indexers/blockIndexer.js) — Block indexing
- [explorer/backend/indexers/txIndexer.js](explorer/backend/indexers/txIndexer.js) — Transaction indexing

