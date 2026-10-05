# Mallchain System Audit -- Phases 0-2

**Audit Date:** 2026-09-24  
**Auditor:** Automated System Audit  
**Repository:** /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/  
**Scope:** Read-only audit -- no files were modified  

---

## PHASE 0 -- Repository Discovery & Dependency Mapping

### 0.1 Directory Map & Purposes

| Directory | Purpose | Status |
|-----------|---------|--------|
| `backend/` | Express.js API server (Node.js). Central service handling auth, transactions, wallet, marketplace, blockchain proxy, real-time sockets, background workers. | **ACTIVE** -- Running on port 4000 |
| `blockchain_working/` | CometBFT blockchain node home directory. Contains config/ (genesis.json, config.toml, keys), data/ (block store, state). | **ACTIVE** -- Node producing blocks |
| `mallchain-os-v14/` | Primary frontend application (React + Vite + TypeScript). Full marketplace UI with 22 feature modules, pages, components, services. | **ACTIVE** -- Running on port 5173 |
| `mallchain-app/` | Secondary frontend application (React + Vite). Desktop-oriented app with wallet, blockchain integration, Tauri desktop support. Includes .deb packages. | **ACTIVE** -- Running on port 3000 |
| `x/` | Custom Cosmos SDK blockchain modules (Go). 12 custom modules. | Compiled into `marketplaced` binary |
| `go-src/` | Full Go toolchain source (go1.25.8). Contains Go standard library, compiler, tools. | Build dependency |
| `marketplace/` | Older/alternate marketplace implementation with separate backend/ and frontend/ subdirectories. | **NOT RUNNING** -- Appears legacy |
| `mallwallet/` | Mallwallet module within backend -- contains workers/, queue/, security/, services/, routes/, monitoring/. Handles treasury, payments, transaction processing. | **ACTIVE** -- Part of backend |
| `infra/` | Infrastructure-as-code: k8s/ (Kubernetes manifests), terraform/ (Terraform configs). | **NOT RUNNING** -- Deployment configs only |
| `deploy/` | Deployment configs: certbot-renewal service, nginx configs. | **NOT RUNNING** -- Config files only |
| `monitoring/` | Observability: grafana/ and prometheus/ dashboard/config definitions. | **NOT RUNNING** -- Config files only |
| `scripts/` | Operational scripts: genesis management, chain reset, validator setup, secrets generation, MongoDB init, Vault init, benchmarking, smoke tests. | Utility scripts |
| `sdk/` | Client SDKs in go/, js/, python/ for interacting with the Mallchain API. | Library code |
| `wasm/` | WebAssembly contract support -- CosmWasm integration for the blockchain. | Compiled into binary |
| `proto/` | Protocol Buffers definitions for marketplace module. Buf build system (buf.yaml, buf.gen.*.yaml). | Build definitions |
| `explorer/` | Standalone block explorer with backend/ and frontend/ subdirectories. Has own architecture docs. | **NOT RUNNING** -- Optional component |
| `tools/` | Development/testing tools: Go type checker, diagnostic probes, mock servers (mock_chain_server.js, mock_cosmos_rest.js, mock_tendermint_rpc.js). | Utility/test tools |
| `packages/` | Shared packages: shared-config/, shared-ui/ -- monorepo shared code. | Library code |
| `app/` | Application data directory with data/ subdirectory. | Data storage |
| `cmd/marketplaced/` | Blockchain binary entry point (main.go). | Compiled into `marketplaced` |
| `e2e/` | End-to-end test suite. | Test code |
| `tests/` | Additional test files. | Test code |
| `load-tests/` | Load testing scripts. | Test code |
| `docs/` | Documentation directory. | Documentation |

### 0.2 Backend Entry Point Analysis (`backend/src/index.js`)

The backend is a comprehensive Express.js application (1160 lines) that starts:

**Core Dependencies:**
- **MongoDB** -- Primary data store via Mongoose. Connection string from `MONGO_URI`. Supports TLS, connection pooling (max 20, min 2). AutoIndex disabled in production.
- **Redis** -- Required in production. Used for caching (`cacheService`), BullMQ background jobs, faucet cooldowns, auth cache. Falls back to per-instance in-memory state if unavailable in dev.
- **Blockchain (Cosmos SDK)** -- Connected via RPC (port 26657) and REST (port 1317). Health checked via `checkChainHealth()` with stale-block detection.

**Startup Sequence:**
1. Load environment variables (dotenv)
2. Validate runtime secrets (JWT_SECRET, SESSION_SECRET, ADMIN_API_KEY, etc.)
3. Connect to MongoDB (degraded mode if unavailable)
4. Connect to Redis (fatal in production if unavailable)
5. Initialize cache service
6. Create HTTP server + Socket.IO WebSocket server
7. Start listening on configured port (4000)
8. Start background workers (transaction workers, payment callback workers, convert liquidity workers, withdrawal liquidity workers)
9. Start blockchain event listener (`startBlockListener`)
10. Start scheduled jobs (daily volume reset, badge snapshots, operator stake watcher, treasury rewards sweeper)

**Security Middleware Stack:**
- Helmet (CSP, HSTS, frameguard, referrer policy)
- CORS with origin allowlist
- Rate limiting (apiLimiter, minesLimiter)
- CSRF protection
- Session management (express-session with passport)
- JWT authentication
- API key authentication (for admin and metrics)
- Request correlation IDs
- Sanitize sensitive data middleware
- Maintenance mode guards on financial routes

**Route Count:** 50+ route mounts covering auth, vault, transactions, market, blockchain, wallets, KYC, governance, liquidity, mallpoints, notifications, payments, staking, DEX, validators, faucet, admin, messaging, marketplace escrow, education, economy, rewards, search, and more.

**Socket.IO Real-Time System:**
- Wallet balance update subscriptions (with ownership verification)
- Market feed subscriptions
- Price update subscriptions
- Live block subscriptions
- Per-user notification subscriptions (with ownership verification)
- Per-conversation messaging subscriptions (with participant verification)
- Room cap: 20 rooms per socket
- JWT-based authentication via cookie or auth.token

### 0.3 Configuration Analysis (`backend/src/config/index.js`)

**Key Configuration Values:**
- Chain ID: `mallchain-1` (configurable via CHAIN_ID)
- Chain prefix: `mall` (bech32 address prefix)
- Base denom: `stake`
- Gas price: `0.01stake`
- RPC endpoint: `http://127.0.0.1:26657`
- REST endpoint: `http://127.0.0.1:1317`
- Broadcast mode: `BROADCAST_MODE_SYNC`
- TX confirm timeout: 120s
- Block listener interval: 3s

**Secrets Management:**
- JWT_SECRET: min 32 chars, placeholder detection
- SESSION_SECRET: min 32 chars, supports comma-separated rotation
- ADMIN_API_KEY: min 32 chars, comma-separated for rotation
- MONITORING_API_KEY: min 32 chars, must differ from ADMIN_API_KEY
- FIELD_ENCRYPTION_KEY: 32-byte hex (64 chars)
- FIELD_BLIND_INDEX_KEY: 32-byte hex, must differ from encryption key
- OPERATOR_MNEMONIC: required in production
- PAYMENT_WEBHOOK_SECRET: required in production
- VAULT_ADDR + VAULT_TOKEN: required in production for treasury signing

**Production Guards:**
- TEST_MODE=true is rejected in production
- TRUST_PROXY is required in production
- All secrets validated against known placeholder values
- MongoDB URI format validated

### 0.4 START_ALL.sh Analysis

**Startup Order:**
1. Stop any existing processes (SIGTERM, then SIGKILL)
2. Build blockchain binary if missing (`go build -o marketplaced ./cmd/marketplaced`)
3. Clean stale atomic-write temp files, recreate priv_validator_state.json if missing
4. Validate genesis integrity via `scripts/ensure_genesis.py`
5. Start MongoDB replica set (rs0) on port from backend/.env MONGO_URI
6. Initialize replica set if fresh
7. Start Redis (systemctl or manual)
8. Start blockchain: `marketplaced start` with gas prices, RPC on 0.0.0.0:26657, REST API on 0.0.0.0:1317, gRPC disabled
9. Install workspace dependencies (`npm ci`)
10. Start backend: `node src/index.js`
11. Start frontend: `npm run dev` in mallchain-os-v14

### 0.5 Inter-Service Dependency Map

```
                    +------------------+
                    |   Frontend OS    | (port 5173)
                    |  mallchain-os-   |
                    |      v14         |
                    +--------+---------+
                             | HTTP/WebSocket
                             v
+----------------+   +------+---------+   +------------------+
|  Mallchain App |-->|    Backend     |<--|    Blockchain     |
|  (port 3000)   |   |   (port 4000)  |   |  (RPC 26657,     |
+----------------+   +---+---+---+----+   |   REST 1317,     |
                          |   |   |       |   P2P 26656)     |
                    +-----+   |   +-----+ +------------------+
                    |         |         |
                    v         v         v
              +---------+ +------+ +---------+
              | MongoDB | |Redis | |PostgreSQL|
              | (27017) | |(6379)| | (5432)   |
              +---------+ +------+ +---------+
```

**Service -> Dependency Matrix:**

| Service | MongoDB | Redis | PostgreSQL | Blockchain |
|---------|---------|-------|------------|------------|
| Backend (port 4000) | REQUIRED | REQUIRED (prod) | Optional (explorer) | REQUIRED |
| Frontend OS (5173) | -- | -- | -- | -- (via backend) |
| Mallchain App (3000) | -- | -- | -- | -- (via backend) |
| Blockchain node | -- | -- | -- | Self |
| Explorer (if enabled) | -- | -- | REQUIRED | REQUIRED |

### 0.6 Port Map

| Port | Service | Bind Address | Process | Public/Private |
|------|---------|-------------|---------|----------------|
| 4000 | Backend API | 0.0.0.0 (all interfaces) | node (PID 16521) | **PUBLIC** |
| 5173 | Frontend (mallchain-os-v14) | 127.0.0.1 | node (PID 5463) | Private (localhost only) |
| 3000 | Mallchain App | 0.0.0.0 (all interfaces) | node (PID 5533) | **PUBLIC** |
| 26657 | Blockchain RPC | 127.0.0.1 | marketplaced (PID 35052) | Private (localhost only) |
| 1317 | Blockchain REST API | 127.0.0.1 | marketplaced (PID 35052) | Private (localhost only) |
| 26656 | Blockchain P2P | 0.0.0.0 (all interfaces) | marketplaced (PID 35052) | **PUBLIC** |
| 6060 | pprof (debug profiler) | 127.0.0.1 | marketplaced (PID 35052) | Private (localhost only) |
| 27017 | MongoDB | 127.0.0.1 | mongod | Private (localhost only) |
| 6379 | Redis | 0.0.0.0 (all interfaces) | redis-server (PID 4556) | **PUBLIC** |
| 5432 | PostgreSQL | 127.0.0.1 / ::1 | postgres | Private (localhost only) |

**Security Concerns:**
- **Redis (6379)** is bound to 0.0.0.0 -- accessible from any network interface. Should be bound to 127.0.0.1.
- **Backend (4000)** is bound to 0.0.0.0 -- expected for production behind a reverse proxy, but should be 127.0.0.1 if only accessed via nginx.
- **Mallchain App (3000)** is bound to 0.0.0.0 -- may be intentional for desktop app.
- **Blockchain P2P (26656)** is bound to 0.0.0.0 -- expected for peer connectivity.

---

## PHASE 1 -- Requirements & Architecture Audit

### 1.1 Actual vs. Described Architecture

**Running Architecture (Verified):**
- Single-node Cosmos SDK blockchain (CometBFT 0.38.19, Go 1.25.8)
- Express.js backend API server
- Two frontend applications (mallchain-os-v14 primary, mallchain-app secondary)
- MongoDB for application data
- Redis for caching and job queues
- PostgreSQL running but not actively used by core services (explorer optional)

**Architecture Matches Code:** The running architecture accurately reflects what the code describes. The START_ALL.sh script starts exactly the services observed running.

### 1.2 Service Boundaries & Trust Boundaries

**Trust Boundaries Identified:**

1. **Frontend -> Backend (HTTP/WebSocket)**
   - CORS enforced with origin allowlist
   - CSRF protection on authenticated routes
   - JWT in httpOnly cookies
   - Rate limiting on API and transaction endpoints

2. **Backend -> Blockchain (RPC/REST)**
   - Backend acts as the sole intermediary between users and the blockchain
   - Operator mnemonic signs transactions on behalf of users
   - Backend validates and sanitizes before building blockchain transactions

3. **Backend -> MongoDB**
   - Connection pooling with configurable limits
   - Field-level encryption for PII (FIELD_ENCRYPTION_KEY + FIELD_BLIND_INDEX_KEY)

4. **Backend -> Redis**
   - Used for shared state across instances
   - BullMQ job queues for async processing

5. **Socket.IO Authentication**
   - JWT verification on connect (cookie or auth.token)
   - Per-room ownership checks for wallet, user, and conversation subscriptions
   - Room cap (20) prevents resource exhaustion

**Custom Blockchain Modules (x/ directory):**

| Module | Purpose |
|--------|---------|
| `x/badge` | Badge issuance and management |
| `x/crosschain` | Cross-chain interoperability |
| `x/dex` | Decentralized exchange |
| `x/edu` | Education resource anchoring |
| `x/governance` | On-chain governance |
| `x/mallcoin` | Mallcoin token module |
| `x/mallpoints` | Mallpoints loyalty system |
| `x/marketplace` | Marketplace escrow and transactions |
| `x/mlcoin` | MLcoin token with emission control |
| `x/vault` | On-chain vault management |
| `x/wasm` | CosmWasm smart contract support |
| `x/wasmbridge` | Bridge between WASM and native modules |

### 1.3 Transaction Flow: Frontend -> Backend -> Blockchain

```
1. User initiates action in frontend (e.g., send tokens, create listing)
2. Frontend sends HTTP request to backend API with JWT auth
3. Backend validates request (auth, rate limit, CSRF, maintenance mode)
4. Backend builds Cosmos SDK transaction using appropriate TxBuilder
   (e.g., mallcoinTxBuilder, dexTxBuilder, eduTxBuilder, burnTxBuilder)
5. Transaction signed with operator mnemonic (or Vault in production)
6. Transaction broadcast to blockchain via RPC (BROADCAST_MODE_SYNC)
7. Backend polls for transaction confirmation (TX_CONFIRM_TIMEOUT_MS=120s)
8. On confirmation, backend updates MongoDB state
9. Backend emits Socket.IO event to update frontend in real-time
10. blockchainListener service continuously monitors for new blocks
```

### 1.4 Component Assessment

**Necessary Components:**
- backend/ -- Core API, all business logic
- blockchain_working/ -- Blockchain node data and config
- mallchain-os-v14/ -- Primary user-facing frontend
- x/ -- Custom blockchain modules
- cmd/marketplaced/ -- Blockchain binary entry point
- scripts/ -- Operational tooling

**Potentially Redundant/Optional:**
- marketplace/ -- Separate marketplace implementation appears to be legacy/unused while the same functionality exists in backend/ routes and x/marketplace
- explorer/ -- Standalone explorer is optional (backend has built-in explorer routes)
- go-src/ -- Full Go source tree (13GB+) is only needed for building the binary, not running it
- mallchain-app/ -- Secondary frontend; purpose overlaps with mallchain-os-v14
- app/ -- Data directory with unclear purpose
- graphify-out/ -- Output directory, possibly from code visualization

**Missing Components:**
- No CI/CD pipeline configs in repository (only .github/ exists with unknown content)
- No active monitoring stack running (Grafana/Prometheus configs exist but not deployed)
- PostgreSQL is running but not actively used by core services

---

## PHASE 2 -- Blockchain Core Audit

### 2.1 Test Results Summary

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Blockchain Status | **PASS** | Node responding, chain_id=mallchain-1, height=1257+ |
| 2 | Latest Block | **PASS** | Block 1259+ returned with valid header |
| 3 | Health Check | **PASS** | `{"jsonrpc":"2.0","id":-1,"result":{}}` |
| 4 | Genesis Query | **PASS** | chain_id=mallchain-1, genesis_time=2026-05-28T04:06:10Z |
| 5 | Validators Query | **PASS** | 1 validator, voting_power=1010, BONDED |
| 6 | Account Balances | **PASS** | mall130ec... = 1,000,000,000 stake; mall1msa4... = 1,484,965,000 stake |
| 7 | Node Info (REST) | **PASS** | CometBFT 0.38.19, Go 1.25.8, tx_index=on |
| 8 | ABCI Info | **PASS** | data=marketplace, last_block_height=1257 |
| 9 | Consensus State | **PASS** | Height/round/step progressing, single proposer |
| 10 | Mempool | **PASS** | 0 unconfirmed txs (empty mempool, healthy) |
| 11 | Block Height Increasing | **PASS** | Height went from 1261 to 1262 in 5 seconds |
| 12 | Chain ID Verification | **PASS** | chain_id = "mallchain-1" (matches expected) |
| 13 | Network Info | **PASS** | Listening=true, 0 peers (single-node, expected) |
| 14 | Backend Health | **PASS** | status=ok, chain=ok, database=ok, redis=ok |
| 15 | Frontend (OS v14) | **PASS** | HTTP 200 on port 5173 |
| 16 | Frontend (App) | **PASS** | HTTP 200 on port 3000 |
| 17 | Inflation Query | **PASS** | inflation=0.130016506681075544 (~13%) |
| 18 | Staking Validators (REST) | **PASS** | 1 validator, BONDED, tokens=1,010,000,000 |

### 2.2 Detailed Test Evidence

#### Test 1: Blockchain Status
```
Command: curl -s http://localhost:26657/status
Result: {
  "node_info": {
    "id": "57c770cb4072eaf15bf1314a35c43acb827c09a2",
    "listen_addr": "tcp://0.0.0.0:26656",
    "network": "mallchain-1",
    "version": "0.38.19",
    "moniker": "AvastaIan",
    "tx_index": "on",
    "rpc_address": "tcp://127.0.0.1:26657"
  },
  "sync_info": {
    "latest_block_height": "1257",
    "latest_block_time": "2026-09-24T09:23:57.403796812Z",
    "earliest_block_height": "1",
    "earliest_block_time": "2026-05-28T04:06:10.181913343Z",
    "catching_up": false
  },
  "validator_info": {
    "address": "8FA11154FAE4ECFB34ACFA7CAD8B07841F5BD676",
    "voting_power": "1010"
  }
}
Verdict: [PASS]
```

#### Test 2: Latest Block
```
Command: curl -s http://localhost:26657/block
Result: Block height 1259, chain_id "mallchain-1", valid block hash,
        last_commit_hash, validators_hash present.
Verdict: [PASS]
```

#### Test 3: Health Check
```
Command: curl -s http://localhost:26657/health
Result: {"jsonrpc":"2.0","id":-1,"result":{}}
Verdict: [PASS] -- Empty result object indicates healthy
```

#### Test 4: Genesis Configuration
```
Command: cat blockchain_working/config/genesis.json
Key findings:
  - chain_id: "mallchain-1"
  - genesis_time: "2026-05-28T04:06:10.181913343Z"
  - initial_height: 1
  - 1 validator: mallvaloper130ec9f903l5ylmztxzwzawpywy2s43xr5j6h0s
  - Validator power: 1 (genesis), now 1010 (after delegations)
  - Genesis accounts:
    - mall130ec9f903l5ylmztxzwzawpywy2s43xrfwfplu: 1,000,000,000 stake
    - mall1fl48vsnmsdzcv85q5d2q4z5ajdha8yu37gu5ml (bonded_tokens_pool): 1,000,000,000 stake
    - mall1msa4wcpvw20x4x60faywnfqws0v95plq6nsyp0: 2,000,000,000 stake
  - Custom modules registered: badge, mallcoin, mallpoints, mlcoin, dex, edu, marketplace, vault, wasm, wasmbridge, crosschain, governance
  - MLcoin emission state: total_supply=670T, circulating=4.5T, monthly_cap=250B, daily_limit=8.33B
  - Mint inflation: 13%, max 20%, min 7%
  - Governance: min deposit 10M stake, voting period 48h, quorum 33.4%
  - Staking: unbonding time 21 days, max 100 validators
  - IBC: enabled, all clients allowed
Verdict: [PASS]
```

#### Test 5: Validators
```
Command: curl -s http://localhost:26657/validators
Result: 1 validator
  - Address: 8FA11154FAE4ECFB34ACFA7CAD8B07841F5BD676
  - Voting power: 1010
  - Proposer priority: 0
Verdict: [PASS]
```

#### Test 6: Account Balances
```
Command: curl -s http://localhost:1317/cosmos/bank/v1beta1/balances/mall130ec9f903l5ylmztxzwzawpywy2s43xrfwfplu
Result: 1,000,000,000 stake (validator operator account)

Command: curl -s http://localhost:1317/cosmos/bank/v1beta1/balances/mall1msa4wcpvw20x4x60faywnfqws0v95plq6nsyp0
Result: 1,484,965,000 stake (treasury/faucet account -- started with 2B, spent on emissions)
Verdict: [PASS]
```

#### Test 7: Node Info (REST API)
```
Command: curl -s http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info
Result: CometBFT 0.38.19, Go 1.25.8 linux/amd64
Verdict: [PASS]
```

#### Test 8: ABCI Info
```
Command: curl -s http://localhost:26657/abci_info
Result: data="marketplace", last_block_height=1257
Verdict: [PASS]
```

#### Test 9: Consensus State
```
Command: curl -s http://localhost:26657/consensus_state
Result: height/round/step: 1260/0/1, single proposer, prevotes/precommits progressing
Verdict: [PASS]
```

#### Test 10: Mempool
```
Command: curl -s http://localhost:26657/num_unconfirmed_txs
Result: n_txs=0, total=0, total_bytes=0
Verdict: [PASS] -- Clean mempool
```

#### Test 11: Block Height Progression
```
Command: Two status queries 5 seconds apart
Result: Height1=1261, Height2=1262
Verdict: [PASS] -- Blocks are being produced at ~5s intervals (matching timeout_commit=5s)
```

#### Test 12: Chain ID
```
Verified across multiple endpoints:
  - RPC /status: "mallchain-1"
  - RPC /block header: "mallchain-1"
  - REST /node_info: "mallchain-1"
  - Genesis file: "mallchain-1"
  - Backend /api/health: "mallchain-1"
Verdict: [PASS] -- Consistent across all endpoints
```

#### Test 13: Network Info
```
Command: curl -s http://localhost:26657/net_info
Result: listening=true, n_peers=0, peers=[]
Verdict: [PASS] -- Single-node chain, no peers expected
```

#### Test 14: Backend Health
```
Command: curl -s http://localhost:4000/api/health
Result: {
  "status": "ok",
  "backend": "ok",
  "chain": { "status": "ok", "chainId": "mallchain-1", "latestHeight": "1263" },
  "database": { "status": "ok" },
  "redis": { "status": "ok" }
}
Verdict: [PASS] -- All subsystems healthy
```

### 2.3 Blockchain Configuration Analysis

**config.toml Key Settings:**
- CometBFT version: 0.38.19
- Moniker: "AvastaIan"
- DB backend: goleveldb
- RPC: tcp://127.0.0.1:26657 (localhost only)
- P2P: tcp://0.0.0.0:26656 (all interfaces)
- pprof: localhost:6060 (debug, localhost only)
- Mempool type: flood, size 5000
- Transaction indexer: kv (key-value)
- Consensus timeout_commit: 5s (block interval)
- Create empty blocks: true
- Prometheus metrics: disabled
- State sync: disabled
- No persistent peers or seeds configured (single-node)
- CORS: no origins allowed (empty array)
- TLS: not configured

**Block Production Rate:**
- timeout_commit = 5s
- Observed: ~1 block per 5 seconds (confirmed by height progression test)
- Empty blocks are created (create_empty_blocks = true)

### 2.4 Genesis Account Summary

| Address | Type | Genesis Balance | Current Balance | Notes |
|---------|------|----------------|-----------------|-------|
| mall130ec9f...wfplu | BaseAccount (validator operator) | 1,000,000,000 stake | 1,000,000,000 stake | Validator self-delegation |
| mall1fl48vs...u5ml | ModuleAccount (bonded_tokens_pool) | 1,000,000,000 stake | -- | Staking module pool |
| mall1msa4wcp...syp0 | BaseAccount (treasury/faucet) | 2,000,000,000 stake | 1,484,965,000 stake | ~515M spent on emissions/operations |

### 2.5 MLcoin Emission State (from Genesis)

| Parameter | Value |
|-----------|-------|
| Total Supply | 670,000,000,000,000 (670T) |
| Circulating | 4,500,000,000,000 (4.5T) |
| Monthly Cap | 250,000,000,000 (250B) |
| Daily Limit | 8,333,333,333 (~8.33B) |
| Current Month | 1 |
| Current Day | 1 |

**MLcoin Wallet Balances (from genesis):**

| Address | Balance | Locked |
|---------|---------|--------|
| mall1p9f39u...m6qg | 160,000,000,000,000 | 160,000,000,000,000 (100% locked) |
| mall1x9vewx...xm6 | 1,500,000,000,000 | 0 |
| mall1nma8m9...e4f | 3,000,000,000,000 | 0 |
| mall1fgfc4h...qa5 | 90,000,000,000,000 | 0 |
| mall1msa4wc...yp0 | 100,000,000,000 | 0 |

---

## Key Findings Summary

### Critical Findings

1. **[CRITICAL] Redis bound to 0.0.0.0** -- Redis (port 6379) is listening on all network interfaces. This exposes the cache/job queue to any network. Should be bound to 127.0.0.1.

2. **[CRITICAL] Backend bound to 0.0.0.0** -- The backend API (port 4000) is listening on all interfaces. While this may be intentional for reverse proxy setups, it means the API is directly accessible without going through nginx if no firewall rules exist.

3. **[HIGH] TEST_MODE=true in .env** -- The backend .env has TEST_MODE=true, which bypasses Vault-backed treasury signing. The config validates this is rejected in production, but the current dev environment could accidentally promote this configuration.

4. **[HIGH] Single validator chain** -- The blockchain has only 1 validator with voting power 1010. This is a single point of failure. If this validator goes down, the chain halts completely.

5. **[HIGH] No peer connections** -- The blockchain node has 0 peers. It is completely isolated. No state sync, no seed nodes, no persistent peers configured.

### Moderate Findings

6. **[MEDIUM] Block age staleness** -- The backend health check reported blockAgeMs=8017ms (8 seconds) which is above the default CHAIN_STALE_BLOCK_MS=60000ms threshold but shows the block production is not perfectly regular. This is within tolerance given the 5s timeout_commit.

7. **[MEDIUM] Prometheus metrics disabled** -- CometBFT's prometheus metrics are disabled (prometheus=false in config.toml). The backend has its own /metrics endpoint but blockchain-level metrics are not being exported.

8. **[MEDIUM] No TLS on any endpoint** -- No TLS certificates configured on any service. All communication is plaintext HTTP. This is expected for local development but must be addressed before production.

9. **[MEDIUM] Explorer not running** -- The standalone explorer backend is not running. The backend falls back to its built-in explorer routes, which provide limited functionality.

10. **[LOW] Mallchain App (port 3000) bound to 0.0.0.0** -- Secondary frontend is publicly accessible on all interfaces.

11. **[LOW] PostgreSQL running but underutilized** -- PostgreSQL is running on port 5432 but the core services don't require it. It's only needed if the standalone explorer is enabled.

12. **[LOW] App name in genesis is `<appd>`** -- The genesis app_name field shows `<appd>` (placeholder) rather than a proper application name like `marketplaced`.

### Positive Findings

- All 18 blockchain tests PASSED
- Block production is consistent and healthy
- Chain ID is consistent across all endpoints
- Backend health check confirms all subsystems operational
- Security middleware stack is comprehensive (Helmet, CORS, CSRF, rate limiting)
- Socket.IO has proper ownership verification for room subscriptions
- Secrets management has production guards (minimum lengths, placeholder detection)
- Field-level encryption for PII is implemented
- Circuit breaker pattern on explorer proxy
- Maintenance mode guards on financial routes
- Background workers properly gated on Redis availability

---

*End of Phases 0-2 Audit Report*
