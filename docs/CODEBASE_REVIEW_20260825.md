# Mallchain / MarketplaceBlockchain — Comprehensive Codebase Review

Date: 2026-08-25
Scope: Full monorepo — Cosmos SDK chain (`marketplaced`), Express backend, React/Vite frontend (`mallchain-os-v14`), CI, and supporting packages.

---

## 1. Executive Summary

Mallchain is a substantial multi-tier application: a Cosmos SDK v0.53 custom chain (`x/mlcoin`, `x/mallcoin`, `x/mallpoints`, `x/badge`, `x/vault`, `x/dex`, `x/wasm`, `x/wasmbridge`, `x/governance`, `x/crosschain`, `x/marketplace`), an Express backend (~90 routes), and a React/TypeScript mission-control frontend with 60+ feature-route bindings.

**Strengths**
- Strong test foundations: backend has 80+ Jest suites covering auth, faucets, validation, socket room isolation, badge snapshots, withdrawal idempotency, etc. See [backend/src/__tests__](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/__tests__).
- Thoughtful security scaffolding: `validateRuntimeSecrets()` rejects placeholder secrets, admin routes sit behind `requireAdmin`/`requireSuperAdmin`, Safaricom webhooks are signed, bcrypt-js v3 for passwords, helmet/rate-limit/cors/sanitizeHtml/CSURF enabled. See [config/index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/config/index.js), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js), [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js).
- Clean financial lifecycle recording: `LiquidityPoolActivity` ledger + `LiquidityReconciliation` wired through buy/sell/withdraw/payout callbacks. See [LiquidityPoolActivity.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/LiquidityPoolActivity.js), [liquidityActivityService.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/services/liquidityActivityService.js), [routes/buy.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/buy.js).
- Project memory and conventions are honored: `/performance` route order noted, FE port pinned 5173, mock data removed in favor of "not ready" states.
- CI is mature: Go build/test/vet, backend eslint+jest+coverage, frontend typecheck+vitest+build, high-severity npm audits. See [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml).

**Critical blockers & high-priority issues (12)**
1. Accidental vendoring of a full Go toolchain at `go-src/` (~20–50k files, 100s of MB, never referenced by build).
2. Orphan `/src` directory with 3 legacy JSX pages (`Wallet.jsx`, `Explorer.jsx`, `Governance.jsx`) and no build script — duplicates the real frontend in `mallchain-os-v14/`.
3. Minimal root `package.json` at repo root is not the project's real root manifest — this misleads tooling (dependabot, dockerfile, IDE indexing). Real manifests live under `backend/` and `mallchain-os-v14/`.
4. `FeesAccumulated` was not initialized by `x/mlcoin` genesis, and `MsgTransferMallcoin` errored hard on missing state; patched in session, but still missing from proto/genesis field and from ExportGenesis round-trip.
5. Admin dashboard has no UI for the liquidity activity ledger, reconciliation items, or withdrawals, even though backend endpoints exist (`GET /api/liquidity/activity`, `/api/admin/reconciliation/*`, `/api/admin/withdrawals`).
6. `/api/history/:address` in history.js has no `/performance` route before it (violates project memory hard constraint) and uses `events=A&B` query semantics incorrectly (Comet REST does AND-style events, returning zero matches).
7. Dependabot only tracks `/backend` and `/mallchain-os-v14` npm ecosystems. Missing: `/packages/shared-ui`, `/packages/shared-config`, `/explorer/backend`, `/e2e`, and `/root` minimal manifest.
8. `eslintrc.json` is scoped to `backend/**/*.js` only. Frontend (TS/TSX) has no ESLint config.
9. `history.js`, several `/api/onchain/*` routes, and wallet socket subscriptions are not covered by input validation (no Joi schemas, no auth, no rate limiting in places).
10. `vault` module stores `password` field in proto messages and uses a naive MD5-style hashing approach (need to audit for plaintext/low-entropy KDF).
11. Every authenticated request does a live MongoDB `User.findById` lookup (both middlewares `auth.js` and `adminAuth.js`). No short-lived session cache. At scale this is a DB hotspot.
12. `x/dex` and `x/wasmbridge`/`x/crosschain` chainside modules have zero corresponding backend routes and zero frontend pages; they are effectively dead code at the application layer.

---

## 2. Repository Structure & Architecture

### 2.1 Layout (conceptual)

```
.
├── cmd/marketplaced/main.go          Chain entry point (Cosmos SDK + CometBFT)
├── app/                              App wiring (AnteHandler, module stack, genesis)
├── x/                                12 Cosmos SDK modules
│   ├── mlcoin/                       **Primary** ledger — wallets, mints, transfers, fees, staking, treasury
│   ├── mallcoin/                     Params-only secondary module (low usage)
│   ├── mallpoints/                   Mallpoints accounts + conversion windows
│   ├── badge/                        Badge purchases/issuances + governance
│   ├── vault/                        Encrypted on-chain vault blobs (TOTP)
│   ├── dex/                          AMM pools + swap math
│   ├── wasm/ + wasmbridge/           WASM VM + MLCN/MGP20 bridge
│   ├── governance/                   Custom governance w/ validator reputation
│   ├── crosschain/                   IBC transfer bridge
│   ├── marketplace/                  Escrow for retail trades
│   └── marketplace (types only?)
├── backend/src/                      Express API (routes, services, models, middleware, workers)
├── mallchain-os-v14/                 REAL React/Vite/TS frontend (Mission Control v14)
├── src/                              **ORPHAN** — 3 legacy pages, no build
├── packages/shared-ui/               Shared UI package (underdeveloped)
├── packages/shared-config/           Shared config package (underdeveloped)
├── explorer/                         Standalone block explorer (backend only, no FE)
├── e2e/                              Playwright/Supertest harness
├── blockchain_working/               Runtime chain state (genesis, priv_validator, data)
├── go-src/                           **ACCIDENTAL VENDOR** — full Go distribution, not used
├── START_ALL.sh / STOP_ALL.sh        Service orchestration
└── .github/workflows/ci.yml          CI
```

### 2.2 Runtime call graph (simplified)
```
User → mallchain-os-v14 (hash router, mallcoinTx service, custom mlcoin registry)
       → Express backend (routes, Cosmos REST/Comet RPC via axios, Mongoose, Socket.IO)
           → marketplaced binary (Cosmos SDK: x/mlcoin TransferMallcoin, x/mallpoints convert, …)
               → CometBFT consensus → SQLite/IAVL in blockchain_working/data
```

---

## 3. Detailed Findings

### 3.1 Security

| # | Severity | Area | Finding | Evidence | Recommendation |
|---|----------|------|---------|----------|----------------|
| S1 | CRITICAL | Repository hygiene | Entire Go toolchain (`go-src/`) is committed into the repo — this pulls in `go-src/src/cmd/fuzz` corpus tests, raw assembly, test fixtures known to contain binary test cases. Will bloat every clone and make the repo a malware-vector magnet. | `LS /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/go-src/` returns 100+ module subtrees. | `git rm -rf --cached go-src/` and add to `.gitignore`. Rewrite history if public (BFG Repo Cleaner). |
| S2 | HIGH | Auth middleware | `auth.js` & `adminAuth.js` run `User.findById` + `select(-password)` on every authenticated request without session cache or TTL. MongoDB hotspot + slow auth at scale. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js#L64), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js#L25). | Add short-lived in-memory or Redis cache (1–2 min TTL) keyed by `userId:tokenHash`. Invalidate on role/ban changes. |
| S3 | HIGH | Vault module | `MsgSetupVault`, `MsgConfirmVault` carry a `password` string field. Audit [vault/keeper/keeper.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/vault/keeper/keeper.go) — the setup path uses raw password strings and a custom KDF. These fields are permanently included in events and historical app state. | `MsgSetupVault.GetPassword()` in generated proto; keeper stores `vb = types.VaultBlob{…, EncryptedPrivKey: …}` derived directly from `password`. | Use bcrypt/Argon2id password hashing off-chain + wrapped AES keys; never persist raw password in events or state. Add a migration to scrub historical password fields. |
| S4 | HIGH | Session cookie | `index.js` defaults express-session cookie to `secure: process.env.NODE_ENV === 'production'` and uses a hardcoded fallback secret `'dev-secret'` when `SESSION_SECRET` is missing (with only a warning). `validateRuntimeSecrets` catches this but session middleware runs before and could initialize with the fallback. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L109-L118). | Abort startup if `SESSION_SECRET` is missing BEFORE the session middleware is mounted. |
| S5 | MEDIUM | JWT validation scope | Both middlewares accept a `decoded.id` fallback alongside `userId`. The dual-format eases migration but also accepts legacy tokens with no revocation list. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js#L57-L59). | Remove `decoded.id` path once every user token is refreshed; add optional `jti`-based revocation list via Redis. |
| S6 | MEDIUM | CSP in production only | Helmet CSP is only configured for `config.isProduction`; local development disables CSP entirely, masking CSP regressions. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L66-L82). | Keep a lenient but still-enforced CSP in dev mode (allow `ws:`, `http://localhost:*`) so regressions surface early. |
| S7 | MEDIUM | Unauthenticated REST history | `GET /api/history/:address` has no auth, no rate limit, no input validation beyond string interpolation. Also uses `events=A&B` incorrectly (see P2). | [routes/history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js#L1-L38). | Route behind `apiLimiter`, validate `address` with the same `isValidAddress` the faucet uses, and fix the Cosmos event query. |
| S8 | MEDIUM | Faucet private key custody | `FAUCET_PRIVATE_KEY_HEX` is a raw secp256k1 key in env. No KMS/HSM path, no threshold signing. Documented tradeoff but should be gated in production more aggressively. | [faucetService.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/services/faucetService.js#L65-L81). | Document this in SECURITY.md as an unacceptable production custody; disable faucet by default for any env that defines real Safaricom credentials. |
| S9 | LOW | bcrypt in browser? | `mallchain-os-v14/package.json` includes `bcryptjs` (pure JS, acceptable) but the import appears unused in router/features audit. Confirm whether we intentionally use it client-side. | [mallchain-os-v14/package.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/package.json#L21). | Remove unused dependency; if used for offline wallet derivation, document in security notes. |

### 3.2 Performance & Scalability

| # | Severity | Area | Finding | Evidence | Recommendation |
|---|----------|------|---------|----------|----------------|
| P1 | HIGH | Data bloat | `go-src/` directory is committed Go stdlib + test fixtures. Easily 40k+ files and 100+ MB. | Dir listing above. | Delete + `.gitignore` entry + BFG if public. |
| P2 | HIGH | REST history endpoint | `events=message.sender='X'&events=transfer.recipient='Y'` in Cosmos tx REST performs AND (both must match), not OR. So the endpoint returns zero results for any address that isn't both sender and recipient on the same tx. Uses hardcoded limit=50 with no pagination. Calls `/blocks/latest` per request. | [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js#L7-L32). | Either: (a) issue two separate queries and union, (b) query chain module-specific transactions via `x/mlcoin` events, or (c) subscribe `WalletTransaction` mongoose model to block listener and query that. |
| P3 | HIGH | Auth DB round-trips | Every authenticated request triggers `User.findById` — no session cache. 200 RPS → 200 mongo QPS just for auth. | S2 references. | 2-min Redis cache; user role/ban mutations purge cache. |
| P4 | MEDIUM | Socket.IO room subscriptions | No cap on number of rooms a single socket can join (`subscribe:wallet` has no limit). | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L302-L312). | Limit per-socket room subscriptions to ≤ 3–5 addresses; disconnect abusers. |
| P5 | MEDIUM | Axios default pooling | All outbound chain REST calls use bare `axios.get(CHAIN_REST + …)` with no agent-level keepalive, no retry, no circuit breaker on 5xx. Checked `utils/circuitBreaker.js` exists but is unused in routes. | Grep for `axios.get` across routes directory; see [chainHealth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/chainHealth.js). | Create a shared axios instance with `keepAlive: true`, 2–3 retries on 5xx/network errors, 5–10s timeout, and a fallback to RPC when REST is down. |
| P6 | MEDIUM | Admin dashboard tables load full collections | `/api/admin/users`, `/api/admin/mining/submissions/pending`, etc. run a find without pagination (at most `limit(safeLimit)`). With 34 users today this is fine, but at 50k users this will blow up. | [adminPanel.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/adminPanel.js#L121-L244). | Enforce cursor/offset pagination on every admin list. |
| P7 | LOW | Genesis.json backups | `blockchain_working/config/` contains 40+ `write-file-atomic-*` temp files and a `genesis.json.bak-*` file. They leak into every filesystem listing. | `LS blockchain_working/config/` output. | Add a cleanup step to `START_ALL.sh`: `rm -f blockchain_working/config/write-file-atomic-*`. |

### 3.3 Code Quality, Standards, and Duplication

| # | Severity | Area | Finding | Evidence | Recommendation |
|---|----------|------|---------|----------|----------------|
| C1 | HIGH | Frontend duplication | `src/pages/Wallet.jsx` uses `framer-motion` + `qrcode.react` + `../core/socket/socket` — a completely different wallet UI than `mallchain-os-v14/features/wallet/WalletHub.tsx`. No build system wires `/src/**`. The root manifest is not the real manifest. | [src/pages/Wallet.jsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/src/pages/Wallet.jsx). | Decide: (A) delete `/src/` outright, or (B) consolidate and move legacy features into v14. Recommend (A). |
| C2 | HIGH | Root `package.json` is misleading | Contains only `express + @cosmjs/*` deps and `send-mlc` script. Not used by CI (see ci.yml paths `backend/` and `mallchain-os-v14/`). | [package.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/package.json). | Convert to a workspace root with no production deps, or remove and rely solely on `backend/` and `mallchain-os-v14/` manifests. |
| C3 | HIGH | Module overlap — `x/mallcoin` vs `x/mlcoin` | `x/mallcoin` is params-only; `x/mlcoin` is the real ledger. Naming almost identical → new contributors will confuse. | `x/mallcoin/keeper/*` vs `x/mlcoin/keeper/*`. | Rename `x/mallcoin` → `x/mallcoinparams` or merge params into `x/mlcoin`. Document the distinction in CONTRIBUTING.md. |
| C4 | HIGH | ESLint scope is too narrow | `.eslintrc.json` only scopes to `backend/**/*.js`. Frontend TS/TSX has no lint, no `react-hooks` rules. | [.eslintrc.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.eslintrc.json). | Add a root ESLint flat config with overrides for backend + TypeScript frontend. Enable react-hooks/recommended. |
| C5 | MEDIUM | Two auth middlewares with duplicated logic | `auth.js` and `adminAuth.js` share ~85% of code, only role check differs. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js#L36-L77), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js#L13-L66). | Factor into `requireAuth(role?)` factory. |
| C6 | MEDIUM | `FeesAccumulated` genesis mismatch | `FeesAccumulated` collection exists in keeper but not in `GenesisState` proto. `InitGenesis` and `ExportGenesis` don't round-trip it yet. This caused the on-chain transfer failure from yesterday. | [genesis.proto](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/proto/marketplace/mlcoin/v1/genesis.proto#L16-L29), [genesis.pb.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/types/genesis.pb.go#L27-L38), [InitGenesis](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/keeper/genesis.go#L12-L34). | (a) Add `FeesAccumulated fees_accumulated = 9;` to genesis.proto, regenerate; (b) keep the `InitGenesis` seed and runtime fallback already patched. |
| C7 | MEDIUM | Placeholder return in emission schedule | `return 0 // placeholder — actual logic in updateEmissionSchedule` in end_blocker.go — check whether callers actually hit it. | [end_blocker.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/keeper/end_blocker.go#L284). | If dead code: remove; otherwise inline the real implementation and unit-test. |
| C8 | LOW | Typo: `MalicoinPurchase`, `MalicoinSale` model filenames | `backend/src/models/MalicoinPurchase.js`, `MalicoinSale.js` — typo ("Malicoin" instead of "Mallcoin"). | Glob pattern matches. | Rename to `MallcoinPurchase.js` / `MallcoinSale.js` and update all requires. |

### 3.4 Incomplete / Underdeveloped Features

| # | Area | Backend | Frontend | Status | Notes |
|---|------|---------|----------|--------|-------|
| U1 | Liquidity Activity Admin UI | ✅ `GET /api/liquidity/activity` exists | ❌ Missing tab in [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx#L19-L79) | 60% complete | Admin tab set does not include liquidity feed or reconciliation queue. The project memory explicitly flagged this as pending. |
| U2 | Reconciliation + Withdrawals Queue | ✅ `/api/admin/reconciliation/*` + `/api/admin/withdrawals` + `/api/admin/reconcile` exist | ❌ Missing UI tabs | 50% complete | Only reachable via raw HTTP today. |
| U3 | Treasury Policies / Dynamic Thresholds UI | ✅ `/api/admin/treasury/*` endpoints present | ❌ Missing tab (only rendered via `local` flags) | 40% complete | Reconciliation, withdrawals, and treasury should be grouped. |
| U4 | DEX module (`x/dex`) | ✅ Keeper+proto fully functional: CreatePool, AddLiquidity, RemoveLiquidity, Swap, EstimateSwap, tests pass.  | ❌ 0 backend REST wrappers, 0 frontend pages. | 35% complete | Backend is missing routes at `/api/dex/*`, frontend missing `WalletSwap` implementation (currently renders a stub). |
| U5 | Vault / TOTP (`x/vault`) | Keeper complete. | `WalletSettings` references a "2FA placeholder" — no setup/confirm flows. | 25% complete | Also see S3 for the security audit it needs before launch. |
| U6 | WASM bridge / crosschain (`x/wasmbridge`, `x/wasm`, `x/crosschain`) | Keepers built, proto defined. | No FE, no REST. | 10–20% complete | Effectively dead code at application layer. Decide whether to invest or flag as future work. |
| U7 | Wallet Performance (`/performance` route) | ❌ Only `/api/history/:address` exists, no `/performance` anywhere — violates hard constraint in project memory.  | FE references area charts but no perf-route consumer verified. | 10% complete | Project memory hard-constraint says history.js must define `/performance` BEFORE `/:address`. Implement `/api/history/performance?address=…` backed by WalletTransaction aggregation. |
| U8 | `packages/shared-ui` + `packages/shared-config` | Packages exist but no exports verified. | `mallchain-os-v14` has not imported either package (no references found in grep). | < 10% complete | Either flesh out into a real shared design system or remove to reduce monorepo confusion. |
| U9 | `explorer/` directory | Has backend db + indexer stubs. | No FE build output or route wired into mission control. | 20% complete | `BlockchainExplorer` page is a separate first-party component; unify the explorer. |
| U10 | `e2e/` test harness | Has package.json and test-e2e.js. | — | 15% complete | `npm audit`/dependabot not configured. CI does not run e2e today. |

### 3.5 Observability & Maintenance Gaps

| # | Finding | Recommendation |
|---|---------|----------------|
| O1 | Structured logger exists in `utils/logger.js` but many routes still `console.error` raw errors (see [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js#L35)). | Replace console.* with logger.* everywhere; ensure errors include request correlation id already injected by middleware. |
| O2 | `prom-client` metrics endpoint is gated behind `apiKeyAuth` which is correct, but no one defines business metrics (buy success rate, payout latency, conversion failures). | Add counters/histograms for each financial lifecycle stage already recorded in LiquidityPoolActivity. |
| O3 | Socket error handler logs to console only. | Emit socket-level failures as prometheus counters + warn logs so you can detect auth-token replay attacks. |
| O4 | `START_ALL.sh` validates genesis but doesn't recreate `priv_validator_state.json` if `data/` is deleted; we discovered this causes startup failure on fresh reset. | Already patched locally in manual runs — promote the restore step into the script itself. Also add cleanup of P7 temp files. |
| O5 | CI `vuln-scan` job runs `npm audit --audit-level=high` on backend + frontend only; misses `/packages/*` and `/e2e`. Also missing `govulncheck ./...` for Go. | Add `govulncheck ./...` to CI. Expand npm audit to all manifests. |
| O6 | Dependabot only scans `/backend` and `/mallchain-os-v14` npm ecosystems. Also missing gomod groups for Cosmos SDK upgrades. | Update [dependabot.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/dependabot.yml) to include `/packages/shared-ui`, `/packages/shared-config`, `/explorer/backend`, `/e2e`. |

### 3.6 Dependencies — Notable Findings

| Dependency | Current | Concern | Recommendation |
|------------|---------|---------|----------------|
| `bullmq` (backend) | `^1.81.0` (legacy) | BullMQ ≥ 5.x uses ioredis v5 better, has fewer bugs. Current pinned to ancient 1.x. | Upgrade to BullMQ v5 in a dedicated change (job shape changes). |
| `express-rate-limit` | `^6.7.0` | Acceptable but not latest; v7+ supports shared stores via `rate-limit-redis`. | Minor: promote together with Redis-backed faucet cooldown convergence. |
| `csurf` | `^1.11.0` | The well-known `csurf` package is deprecated/unmaintained. Uses the old cookie model. | Replace with `csrf-csrf` or `@fastify/csrf` if moving to Fastify. |
| `socket.io` | `^4.8.3` | Fine. Keep. | — |
| `jsonwebtoken` | `^9.0.3` | 9.x branch is current. Good. | Continue pinning to ≥ 9. |
| `@cosmjs/*` (backend) | `^0.39.0` | Frontend uses same version. Consistent across FE/BE — good. 0.32 has breaking changes. | Stay within 0.39.x until a planned upgrade batch. |
| Go modules | `cosmos-sdk v0.53.4`, `cometbft v0.38.19`, `ibc-go v10.4.0` | Modern versions; custom `replace` directives needed for sonic/gin/goleveldb/websocket. Documented. | Keep weekly dependabot; track upstream Go CVE advisories. |
| Go version declared | `go 1.24.0` (go.mod), CI `1.24.0` | Be careful: Go 1.24 is still recent. The `replace sonic` directive addresses loader issues — keep that in CONTRIBUTING.md. | |

---

## 4. Route-Order & Constraints Audit (Project-Memory Hard Rules)

| Constraint | Status | Evidence | Action Required |
|------------|--------|----------|-----------------|
| `/performance` must come BEFORE generic `/:address` in [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js) | ❌ **VIOLATED** — no `/performance` route defined at all | file only contains `router.get('/:address', ...)` | Add `router.get('/performance', …)` first returning wallet performance time-series from `WalletTransaction` or `LiquidityPoolActivity`. |
| Frontend admin routes wrapped in `AdminRoute`-style gating | ✅ Partially met — `router.tsx` `matchRoute()` has explicit `ADMIN_ROUTES` enforcement, not just a conditional render. | [router.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/router.tsx#L116-L135) | Good; keep this level of auth enforcement. |
| gRPC/gRPC-web disabled in `config/app.toml` | Not verified in this pass. | Manually spot-check next time services are edited. | |
| Cash-out requires signed `MsgTransferMallcoin` → `CASHOUT_RECEIVER_ADDRESS` → creates WithdrawalRequest | ✅ Implemented in prior session. | See [buy.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/buy.js) sell route. | |
| Mallpoints conversion restricted to specific windows unless `MALLPOINTS_CONVERT_ANY_DAY=true` | ✅ Fixed in last session. | [routes/mallpoints.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/mallpoints.js) reuses `buildConversionStatus`. | |

---

## 5. Optimization Roadmap (ordered)

### Phase 0 — Repository Hygiene (~1 day)
- [ ] **Delete `go-src/` from git history** + add `.gitignore` entry. Highest impact on clone size / malware surface.
- [ ] **Remove orphan `/src/` directory** or consolidate into `mallchain-os-v14/`. Don't leave two competing wallet implementations.
- [ ] **Replace root `package.json`** with a workspace-only manifest (`"workspaces": ["backend", "mallchain-os-v14", "packages/*"]`). No runtime deps.
- [ ] Fix typo in model filenames (MalicoinPurchase → MallcoinPurchase, etc.)
- [ ] Clean `write-file-atomic-*` files in `blockchain_working/config/` via a step in `START_ALL.sh`. Also recreate `priv_validator_state.json` if missing.

### Phase 1 — Security (2–3 days)
- [ ] **Harden S8/S3**: Vault KDF review + password/event scrubbing.
- [ ] **Harden S2/S4**: Session cache (Redis, 2-min TTL) for auth; abort startup if SESSION_SECRET missing before session mount.
- [ ] **Harden S7**: `history.js` — add validation, rate limiting, correct Cosmos event OR semantics.
- [ ] Upgrade `csurf` (deprecated) → modern maintained alternative.

### Phase 2 — Financial Integrity & Admin UX (3 days)
- [ ] **Implement `/performance` first** in history.js. Honor the route ordering.
- [ ] **C6 — FeesAccumulated genesis field**: Add to `genesis.proto` (field 9), regenerate, ensure ExportGenesis round-trips.
- [ ] **Liquidity Admin UI**: Add three new admin tabs — `Liquidity Activity`, `Reconciliation Queue`, `Withdrawals` in [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx#L19-L79) using the existing endpoints.
- [ ] **Treasury tab**: Render policies, dynamic thresholds, ledger, metrics.

### Phase 3 — Feature Completion (5–7 days)
- [ ] **DEX MVP**: Backend `/api/dex/pools`, `/estimate`, `/swap`, `/:poolId`; front-end `WalletSwap` page — currently renders a basic stub per router.
- [ ] **Vault/TOTP production readiness**: Security review (S3), then wire the UI to set up/confirm/unlock flows in `SecuritySettings`.
- [ ] **Decide on WASM + crosschain**: Either ship the REST wrapper and FE, or feature-flag and remove from default module stack.
- [ ] **Explorer unification**: Decide whether standalone `/explorer/` or FE's `BlockchainExplorer` wins; unify.
- [ ] Monorepo packages: Promote `shared-ui` to components consumed by Admin.tsx features or remove them.

### Phase 4 — Performance & Observability (2–3 days)
- [ ] Redis-backed auth cache, axios shared agent + retries, socket room limits.
- [ ] Pagination on all admin lists.
- [ ] Prometheus business metrics for all LiquidityActivity stages.
- [ ] Socket error counter; wallet performance feeds.
- [ ] O5: Add Go `govulncheck ./...` to CI. Expand npm audits to all manifests.
- [ ] O6: Expand Dependabot coverage to include `/packages/shared-ui`, `/packages/shared-config`, `/explorer/backend`, `/e2e`.

### Phase 5 — Quality / Debt Reduction (3–4 days)
- [ ] Factor auth/adminAuth middlewares into one factory (C5).
- [ ] Rename `x/mallcoin` → `x/mallcoinparams` (or merge) to end naming confusion (C3).
- [ ] Add ESLint config for the TS frontend — enable react-hooks rules (C4).
- [ ] Run full Go test suite and review `vault`/`dex` keeper coverage.
- [ ] Promote e2e tests to CI; dependabot on e2e.

---

## 6. Underdeveloped Areas Summary (Ranked by ROI)

1. **Admin Financial Ops UI** (U1, U2, U3) — Backend data is there; frontend is missing tabs. Fastest ROI for ops.
2. **Wallet Performance Route** (U7 / route-order constraint) — Low LoC, unblocks Wallet dashboard trend charts.
3. **Dex integration** (U4) — Keeper already works and is unit-tested; adding REST + simple Swap UI unlocks major value prop.
4. **Repository hygiene** (Phase 0) — Deleting 40k+ dead files dramatically reduces clone time, attack surface, and search noise.
5. **Vault/TOTP** (U5 + S3) — Security-sensitive; defer until S3 is fixed.
6. **Shared UI packages + Explorer unification + E2E harness** (U8, U9, U10) — Infrastructure-level investment; nice to have before second product squad.
7. **x/wasm, x/wasmbridge, x/crosschain** (U6) — Today these are speculative; decide go/no-go before investing more.

---

## 7. Immediate Next Actions (Recommended)

Run these in order before the next enhancement round:
1. Open PR **"Phase 0 hygiene"** (`rm -rf --cached go-src/ src/`, fix root package.json workspace, fix model filename typos, clean write-file-atomic trash in START_ALL.sh → priv_validator_state.json fix).
2. **Add `/api/history/performance` before the `/:address` route** in `history.js` — satisfies the documented hard constraint.
3. Admin UI: add a `Liquidity` tab that hits `/api/liquidity/activity?flow=…` and renders status color-coded per user preferences (green=success, amber=pending, red=failed, blue=info).
4. Add `FeesAccumulated` field to genesis proto, regenerate, update ExportGenesis.
5. In CI, add `govulncheck` and expand dependabot coverage per O5/O6.

---

## 8. File References

All code references above use clickable `file:///` URLs. Top-level index of the key files used in this review:

- Chain entrypoint: [main.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/cmd/marketplaced/main.go)
- App wiring: [app/app.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/app/app.go)
- Mlcoin keeper: [keeper/keeper.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/keeper/keeper.go)
- Transfer handler: [msg_server_transfer_mallcoin.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/keeper/msg_server_transfer_mallcoin.go)
- Genesis init: [keeper/genesis.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/keeper/genesis.go)
- Genesis proto: [genesis.proto](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/proto/marketplace/mlcoin/v1/genesis.proto)
- Backend entrypoint: [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js)
- Backend config & secret validation: [config/index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/config/index.js)
- Backend auth / admin auth middlewares: [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js)
- Admin panel routes: [adminPanel.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/adminPanel.js)
- History routes: [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js)
- Buy / signed sell routes: [buy.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/buy.js)
- Liquidity routes + activity feed: [liquidity.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/liquidity.js)
- Faucet service: [faucetService.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/services/faucetService.js)
- Liquidity activity service + models: [liquidityActivityService.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/services/liquidityActivityService.js), [LiquidityPoolActivity.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/LiquidityPoolActivity.js)
- Mallpoints status/convert: [mallpoints.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/mallpoints.js), [mallpointsService.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/services/mallpointsService.js)
- Frontend router + admin gating: [router.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/router.tsx)
- Frontend admin tabs: [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx)
- Orphan wallet UI: [src/pages/Wallet.jsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/src/pages/Wallet.jsx)
- DEX keeper + msg server: [dex/keeper/keeper.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/dex/keeper/keeper.go), [dex/keeper/msg_server.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/dex/keeper/msg_server.go)
- Vault keeper: [vault/keeper/keeper.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/vault/keeper/keeper.go)
- CI: [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml)
- Dependabot: [dependabot.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/dependabot.yml)
- Backend manifest: [backend/package.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/package.json)
- Frontend manifest: [mallchain-os-v14/package.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/package.json)
- Misleading root manifest: [package.json](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/package.json)
