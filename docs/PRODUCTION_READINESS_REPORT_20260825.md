# Mallchain / MarketplaceBlockchain — Production Readiness Report
Date: 2026-08-25
Scope: Infrastructure, Application QA, Security & Compliance, Operational Readiness

---

## Executive Summary — **NO-GO Recommendation**

The codebase has strong application-layer foundations (good backend test coverage, thoughtful input validation, structured secrets validation, Vault requirements for treasury funds, solid financial lifecycle recording), **but 12 Critical + 26 High severity gaps** in infrastructure, observability, operational readiness, and compliance mean the system is not yet safe for uncontrolled production traffic. All Critical + High items must be closed before a go/no-go can be revisited.

Total findings: **68**
- Critical: 12
- High: 26
- Medium: 18
- Low: 12

---

## 1. Technical Infrastructure Audit

### 1.1 Server Capacity, Load Balancing, Auto-Scaling

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| I1 | **CRITICAL** | **No load balancer, reverse proxy (nginx/Caddy), or auto-scaling defined anywhere.** Docker-compose spins single replicas; [docker-compose.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/docker-compose.yml) exposes backend directly on `127.0.0.1:4000`; [PRODUCTION.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/PRODUCTION.md) says "Put REST/RPC behind a reverse proxy with TLS" but provides zero configs or Terraform manifests for this. | `docker-compose.yml:16-36` | Produce either: (A) k8s manifests (Deployments, Services, Ingress-NGINX, HPA) for all tiers, or (B) Terraform for AWS/GCP ALB/ASGs + managed DB/Redis. Ship with TLS (Let's Encrypt or ACM). |
| I2 | **CRITICAL** | **Single-point-of-failure on every tier.** Mongo, backend, frontend, marketplaced chain node each run as single container with no replicas; no replica sets or sentinels for Mongo; no sentry nodes or validator HA for chain. | `docker-compose.yml:3-37` | Mongo Atlas / DocumentDB with multi-AZ replicas; Cosmos SDK full node cluster with sentry + validator split; Redis Cluster for BullMQ / faucet rate-limiting shared state. |
| I3 | **HIGH** | Root [Dockerfile](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/Dockerfile) is a placeholder (`FROM alpine:3.18 /bin/sh`). Chain binary (`marketplaced`) has no production Docker image or non-root user hardening. | `Dockerfile:1-3` | Add `cmd/marketplaced/Dockerfile` with distroless/static, non-root user, and HEALTHCHECK querying `:26657/status` + `:1317/cosmos/base/tendermint/v1beta1/node_info`. |
| I4 | **HIGH** | No capacity planning in repo — no load-test scripts, no QPS/perf baselines. Only manual `backend/test_load.js` exists with no assertions. | [test_load.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/test_load.js) | Commit k6/Artillery load-test scripts simulating 200-500 RPS (buy/sell/wallet) and maintain baseline SLO numbers in repo. |
| I5 | **MEDIUM** | No TLS termination configuration anywhere. Caddyfile/nginx.conf or Terraform ACM certs missing. | `Glob nginx*.conf → empty` | Provide a reverse-proxy config with `TLS 1.2+ minimum (TLS 1.3 preferred)`, HSTS headers (already in [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L102-L107) but only active if a proxy sets `X-Forwarded-Proto`). |
| I6 | **MEDIUM** | No network segmentation rules or Security Group/Terraform `network_acl` manifests. Chain RPC (26657) is bound to `0.0.0.0` in PRODUCTION.md with a warning — no enforcement. | [PRODUCTION.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/PRODUCTION.md#L47-L52) | Segregate: validators (no public IP, only sentry egress) → public sentry nodes (RPC REST only via WAF) → backend app tier → DB tier with no public ingress. |
| I7 | **LOW** | `go-src/` still committed (40k+ files, fuzz corpus with binary payloads) — infrastructure clone time, AMI bake time, and malware-scan cost are inflated. | `LS go-src/` (from prior audit) | Delete via BFG + add `.gitignore` entry (Phase 0 of codebase review). |

### 1.2 Database Performance, Replication, Backups, PITR

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| D1 | **CRITICAL** | **Mongo replication and PITR are not configured.** docker-compose uses single `mongo:6.0` with named volume; no replica set; no Oplog sizing; no continuous backups. Manual `mongodump` in [backup.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/backup.sh) can only be taken at the instant of invocation — not point-in-time. | `docker-compose.yml:3-14`, [backup.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/backup.sh#L55-L63) | Move to managed MongoDB (Atlas / DocumentDB) with PITR enabled (minimum 7-day retention, 1-second granularity). Require replica set even for staging. |
| D2 | **CRITICAL** | **Chain backup requires node stop today** — [backup.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/backup.sh#L36-L45) refuses hot copies. For production, this means taking a backup = downtime (or accepting inconsistent state). No validator snapshots, no state-sync, no CometBFT `state-sync` RPC config documented. | `backup.sh:33-45` | Implement: (A) LVM/ZFS filesystem snapshots for hot backup, OR (B) `marketplaced export` for genesis export, OR (C) state-sync + periodic snapshots via Polkachu/Chorus One style tooling. Add a secondary backup-only node that stops for snapshot on a schedule. |
| D3 | **HIGH** | No backup verification / restore drill documented anywhere. `restore.sh` exists, but there is no CI job or runbook proving a backup actually restores and passes sanity checks. | [restore.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/restore.sh) + grep RTO/RPO returns zero results | Run a weekly restore drill in CI: create a throwaway chain, back up, restore, compare block heights, run smoke tests against `/api/health`. |
| D4 | **HIGH** | Backups written to local `./backups` (relative to repo) — no offsite replication, no encryption-at-rest, no lifecycle policies (expire old backups). | `backup.sh:18` | Backup destination: S3/GCS with SSE-KMS, bucket versioning, cross-region replication, 30-day standard + 1-year Glacier lifecycle. |
| D5 | **HIGH** | **Mongo application user has `dbAdmin` role**, not scoped least-privilege. `dbAdmin` grants `dropDatabase`, `createIndex`, `renameCollection`, etc. | [mongo-init.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mongo-init.js#L27-L30) | Reduce app user role to `readWrite` + explicit listCollection privilege only. DB migrations or index changes should be run by a separate IAM-scoped user in CI, not the runtime app. |
| D6 | **MEDIUM** | No MongoDB index review in repo — common queries (by `walletAddress`, `phone`, `status`, `createdAt`) should have composite indexes and be tested with `explain("executionStats")`. | User [models/user.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/user.js#L15-L20) has `walletAddress` sparse unique; audit others | Add composite indexes on the most common reads (LiquidityPoolActivity by `flow/createdAt/walletAddress`, WithdrawalRequest by `status/createdAt`, etc.), with test coverage that fails on full collection scans. |
| D7 | **LOW** | No `mongod` cacheSize or wiredTiger cache tuning, no connection pool sizing for Mongoose in config. | [config/index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/config/index.js#L62-L72) | Tune `Mongoose connect options: poolSize, serverSelectionTimeout, socketTimeoutMS, autoIndex=false` in prod. |

### 1.3 CI/CD Pipeline Reliability, Security Scanning, Rollback

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| CI1 | **CRITICAL** | **No production deployment pipeline exists.** Only CI (build/test) and `release.yml` which publishes chain tarball prereleases to GitHub. Zero jobs deploy backend/frontend/chain to any environment. No blue/green, canary, or rollback steps defined anywhere. | [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml), [release.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/release.yml) | Add at minimum a staging-deploy + production-deploy workflow with: (1) Docker image push to private registry, (2) immutable image tags, (3) health checks before promotion, (4) one-click rollback (kubectl rollout undo / Terraform state rollback / ECS deploy rollback), (5) manual approval gate for production. |
| CI2 | **CRITICAL** | **No SAST/container image scanning in CI.** No CodeQL, Semgrep, Snyk, Trivy, or Grype runs. `.codacy/codacy.yaml` says it "runs" Trivy but the actual GitHub Actions never invoke it; `ci.yml` has zero security-scan jobs beyond `npm audit --audit-level=high`. | [codacy.yaml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.codacy/codacy.yaml), [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml#L74-L88) | Add to CI: (A) `aquasecurity/trivy-action` against all built Docker images + Go module source, (B) `github/codeql-action` for JS/TS and Go, (C) `semgrep` with `owasp-top-ten` rulesets, (D) `govulncheck ./...` for Go CVE detection. |
| CI3 | **HIGH** | Dependabot not configured for root manifest, shared-ui, shared-config, explorer, or e2e. (Already noted in prior audit.) | [dependabot.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/dependabot.yml) | Expand ecosystem entries. |
| CI4 | **HIGH** | No dependency pinning / lockfile enforcement. Go go.sum is honored but Node manifests use `^` range pins across many critical deps. | package.json scans | Enable Dependabot grouped updates + `npm ci` (done in CI = good). Add socket.dev or deps.dev scanner for supply-chain provenance (SLSA). |
| CI5 | **HIGH** | `npm audit` only scans backend + frontend — missing root, packages/shared-ui, shared-config, e2e, explorer. | [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml#L84-L88) | Parallel `npm audit` matrix jobs covering all manifests. |
| CI6 | **MEDIUM** | `release.yml` uses bleeding-edge `ignite/cli/actions/*@main` (no pin to commit SHA / semver tag) — supply-chain risk. | [release.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/release.yml#L28-L41) | Pin every action to an immutable SHA. |
| CI7 | **MEDIUM** | CI secrets for cloud deployments, image registry, and Vault not documented — unclear if OIDC is used or long-lived access keys. | No workflows reference `AWS_ROLE_ARN` / `WORKLOAD_IDENTITY` | Require cloud OIDC federation (no IAM user access keys) for any deploy jobs. |
| CI8 | **LOW** | No infrastructure-change pipeline. Zero Terraform, Pulumi, or CloudFormation. | No `*.tf` files | Treat infrastructure as code with the same CI rigor (plan on PR, apply on merge with approval). |

---

## 2. Application Quality Assurance

### 2.1 Core Feature Functionality vs Production Scenarios

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| A1 | **CRITICAL** | Multiple application features have complete backend logic but NO frontend consumer → effectively unreachable for users. Highest ROI gaps: (1) `/api/liquidity/activity` (financial ops visibility for admins), (2) DEX swap / pool creation (0 backend route wrappers, 0 FE pages), (3) admin reconciliation + withdrawals queue, (4) `/performance` wallet route (breaks project-memory ordering constraint). | See CODEBASE_REVIEW Section 3.6 "Underdeveloped Areas" | Close top-3 underdeveloped features before launch; require FE coverage for every admin endpoint that touches money. |
| A2 | **HIGH** | `FeesAccumulated` gap still partial. Patches applied in prior session (InitGenesis seed + runtime tolerance in transfer) work for the current chain, but `ExportGenesis` still won't round-trip it because proto GenesisState is missing the field. A future chain reset or upgrade would lose the accumulated fee counter. | [genesis.proto](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/proto/marketplace/mlcoin/v1/genesis.proto#L15-L29) + [genesis.pb.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/x/mlcoin/types/genesis.pb.go#L27-L38) | Add `FeesAccumulated fees_accumulated = 9;` in genesis.proto, `buf generate`, update ExportGenesis in keeper. |
| A3 | **HIGH** | `history.js` query returns 0 transactions for most wallets because it uses `events=A&B` which is AND semantics (same tx must have both sender == addr AND recipient == addr). Also missing `/performance` route and missing validation/auth/rate-limit. | [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js#L1-L38) | Fix with a) two REST queries (as sender, as recipient) merged in backend, then b) route-order fix adding `/performance` BEFORE `/:address`. |
| A4 | **HIGH** | `WalletService` bind host defaults to `127.0.0.1`, but there is no test or deploy guard ensuring it's never bound publicly. The config also still allows overriding with `WALLET_SERVICE_HOST=0.0.0.0` — a single misconfig and mnemonics/funds in that process are exposed. | [config/index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/config/index.js#L110-L114) | Hard-fail startup if `WALLET_SERVICE_HOST` is not `127.0.0.1` in production. Log every attempt to change the host. |
| A5 | **MEDIUM** | Frontend chunk-size warning limit is 1200 KB — far above the ~200 KB target for first-interactive <2s. No code-split by route/feature (router imports most modules eagerly). | [vite.config.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/vite.config.ts#L16-L18) | Add `React.lazy()` + `Suspense` boundaries per feature route (Wallet, Admin, Mines, Marketplace, Governance, etc.). Lower `chunkSizeWarningLimit` to 300–500 KB. |
| A6 | **MEDIUM** | Frontend has no runtime feature flags or kill-switches for critical flows. If DEX is buggy at launch, you must redeploy to disable it. | Grep for `featureFlag`/`toggle` returns empty | Add `config.isDexEnabled`, `config.isMinesEnabled`, etc. to backend config + a FE flags endpoint consumed early in router. Admin can toggle via maintenance flags. |
| A7 | **MEDIUM** | Input validation is spotty on read-only routes. 19 patterns validated in the grep above, but routes like `/api/history/:address`, `/api/onchain/*`, `/api/explorer/*` have no Joi/Zod schemas. | Grep validate() call counts ~19 across 40+ route files | Mandate schemas for every route (body + params + query) in CI using a linter rule that requires `validate(schema)` middleware before the async handler. |
| A8 | **LOW** | `Socket.IO` rooms have no per-socket cap; a single abusive client can join 1000 rooms bloating in-memory state. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L302-L312) | Enforce max rooms per socket ≤ 3–5. |

### 2.2 Performance Testing & SLOs

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| P1 | **CRITICAL** | **Zero automated performance tests or SLO dashboards committed.** No Lighthouse CI, no k6/Autocannon, no p95/p99 latency budgets. Acceptance criteria said <2s page loads + <1% error rate — impossible to claim without measurements. | No lighthouse/playwright-performance/load-test scripts | Add Lighthouse CI budget assertions (FCP <1.5s, LCP <2.5s, TBT <200ms) + k6 soak test (1h at 50% peak) in CI on nightly schedule. Publish SLO dashboard (Grafana) using prom metrics already in [metrics.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/metrics.js). |
| P2 | **HIGH** | Every authenticated request hits MongoDB twice (auth middleware + admin middleware). 200 auth'd RPS = 400 findById QPS just for session resolution. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js#L64), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js#L25) | 2-min Redis session cache keyed by `userId:jti`. Invalidate on role/ban changes. |
| P3 | **HIGH** | Chain REST calls have no shared axios agent, no retries, no circuit-breaker wiring. `circuitBreaker.js` exists but is not used anywhere in routes. | [circuitBreaker.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/circuitBreaker.js) + grep `axios.get(` shows no retries | Build a shared `chainClient` axios instance: keepAlive, timeout=5s, 3 retries on 5xx/ECONNRESET, exponential backoff, and open circuit if 20% of calls fail for 1 minute. |
| P4 | **HIGH** | Logger uses `fs.appendFileSync` (blocking I/O!) for every write. At 100 logs/sec this blocks the Node event loop and p99 latency spikes. | [logger.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/logger.js#L48-L49) | Switch to `pino` (structured JSON, non-blocking by default, transports) and stdout only — let Docker/K8s/Systemd/journald or a sidecar ship logs to your aggregator (Datadog, ELK). |
| P5 | **MEDIUM** | `history.js` calls `/blocks/latest` per request; it's 1 RPC call per paginated history fetch. | `history.js:7` | Cache `latest_block_height` for 2 seconds in `cacheService` (already wired in index.js `initCacheService`). |
| P6 | **MEDIUM** | All admin lists (users, KYC, mining submissions) run unbounded find() with only `safeLimit` — no cursor pagination, no countEstimate, no server-side filtering. | [adminPanel.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/adminPanel.js#L121-L244) | Add cursor-based pagination (createdAt + _id) + filtering controls on the UI for every table. |
| P7 | **LOW** | No `X-Forwarded-For` trust validation: index.js sets `trust proxy=1` in production, which blindly trusts the immediate upstream. If multi-proxy chain or CDN not correctly configured, rate-limiting keys by `req.ip` will share limits across all users. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L79-L81) | Set `app.set('trust proxy', ['10.0.0.0/8', '<your internal CDN/proxy IPs>'])` with explicit CIDR list. |

### 2.3 Logging, Monitoring, Alerting

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| O1 | **CRITICAL** | **Zero Prometheus alerting rules, Alertmanager config, Grafana dashboards, or PagerDuty/Opsgenie integrations committed.** Prometheus metrics endpoint exists (`/metrics`) and `prom-client` is wired, but nobody is *alerting* on: (a) error rate >1%, (b) p95 latency >500ms, (c) Mongo/Redis/chain downtime, (d) consensus halted (block age >60s), (e) payment callback failures, (f) bullmq backlog >N. Without alerts, incidents are user-discovered, not SRE-discovered. | [metrics.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/metrics.js) + 0 alertmanager/grafana files | Ship a first-class `deploy/monitoring/` folder with: (1) `prometheus/rules.yml` for all alerts above, (2) `alertmanager.yml` routing to PagerDuty + Slack, (3) 3 Grafana dashboards (API, chain, financial ops). |
| O2 | **CRITICAL** | `logger.js` has **no error forwarding**. The `error` method writes to local `logs/error.log` file only. There is zero push-based alerting on critical errors (treasury signing failed, Safaricom payout failed, chain broadcast failed, database connection lost). | [logger.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/logger.js#L74-L81) | At minimum, integrate `pino` + a transport (pino-sentry, pino-datadog) with alerts: any `ERROR` level log with financial or security keyword → PagerDuty. |
| O3 | **HIGH** | Structured correlation IDs exist via middleware, but socket events and blockchain listener jobs don't propagate the same correlation ID across async boundaries. No trace sampling (OpenTelemetry) either. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L110) | Adopt OpenTelemetry Node SDK + auto-instrumentation for axios, mongodb, express, socket.io. Export traces to Jaeger/Tempo for request tracing across services. |
| O4 | **HIGH** | Maintenance guard exists ([maintenanceMode](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/maintenanceMode.js)) but no documented runbook for when or how to enable it, and frontend has no maintenance banner consuming that status. | Grep "maintenance" across `mallchain-os-v14/src` | Admin tab "Toggle maintenance" + FE banner that disables financial flows with human-readable message when maintenance is active. |
| O5 | **MEDIUM** | Many route files still `console.error` instead of `logger.error`. History.js is the example. | [history.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/routes/history.js#L35) | Lint rule: disallow `console.*` (except in test-setup). Use logger everywhere, always include `correlationId`. |
| O6 | **LOW** | `helmet()` CSP disabled in development; easy to ship a FE change that works in dev but breaks production because CSP catches it late. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L86-L108) | Enable a lenient `reportOnly: true` CSP in dev so violations surface during coding (report-uri or console warnings). |

### 2.4 Third-Party Integrations — SLAs, Rate Limiting, Retries

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| T1 | **CRITICAL** | **Safaricom/M-Pesa integration has no retries, no idempotency keys, no circuit breaker, no dead-letter queue for failed callbacks.** B2C payout STK failures are counted by a Prom counter but not retried or sent to DLQ. A transient Safaricom 5xx means user waits forever until ops manually fix. | Grep of `b2cPayoutService.js` + `payment/safaricom*` files: no retry, no DLQ | BullMQ retries with exponential backoff, idempotency via `ConversationId`/`MerchantRequestID`, dead-letter queue with admin UI to replay/purge; SLA monitor alert if Daraja API availability <99.5% in 7d. |
| T2 | **HIGH** | Faucet cooldown has Redis backing with in-memory fallback only for dev. Production requires Redis for cross-instance shared rate limit state, but PRODUCTION.md says Redis is "optional" — wrong. | PRODUCTION.md:110 "optional" | Redis must be REQUIRED in production: add startup check that Redis is reachable if NODE_ENV=production. |
| T3 | **HIGH** | `keyManager.js` uses Vault for treasury mnemonic, but: (a) token is long-lived VAULT_TOKEN env var (no AppRole / periodic-renewal / IAM auth), (b) 5000ms timeout but no retry on 429 or 5xx, (c) no Vault audit-log forwarding to central logs. | [keyManager.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/keyManager.js#L12-L18) | Switch Vault auth to AppRole with periodic secret_id TTL + auto-renewal. Add retry+circuit on Vault client. |
| T4 | **MEDIUM** | No contracts/SLAs signed or documented with third parties (Safaricom, MongoDB Atlas if used, Redis Cloud, CDN, hosting). | Grep SLA in markdown → empty | Add a `docs/vendor-slis.md` with minimum required SLOs (Daraja ≥99.5%, DB ≥99.9%, CDN ≥99.95%) and out-of-band contact info for incidents. |
| T5 | **MEDIUM** | `chain` REST calls timeout at 5s each, but no global request hedging — if primary chain REST is down, no automatic failover to secondary full-node endpoint. | `index.js:240-242` | Configure multiple CHAIN_REST endpoints; failover on 5xx/timeout. |

---

## 3. Security & Compliance Validation

### 3.1 Access Controls (Least Privilege)

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| S1 | **CRITICAL** | **Mongo app user has `dbAdmin` grant (D5 above).** Runtime application must never have DDL privileges in production. | [mongo-init.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mongo-init.js#L27-L30) | Reduce role to `readWrite`; migrations run by separate scoped CI user. |
| S2 | **CRITICAL** | `x/vault` module carries user password in proto messages as a plain string. Events emitted by keeper include the password in `sdk.Event` attributes, which are permanently stored on-chain. Also, Vault KDF review: the keeper's derive-from-password pattern is not Argon2id/bcrypt and needs an immediate cryptographer review. | `x/vault/proto/*` MsgSetupVault.password string + keeper | Deprecate password-in-proto pattern; migrate to: (a) off-chain wrapped keys via Argon2id → AES-GCM; (b) remove password from all events. Re-audit the KDF and add unit tests showing it's resistant to ASIC/GPU brute force. |
| S3 | **HIGH** | Chain RPC (26657) is recommended behind a reverse proxy in docs, but the app itself doesn't enforce auth, CORS, or rate-limiting on that port — anyone on the same network can broadcast arbitrary txs, read full state, or attempt DoS against the mempool. | `PRODUCTION.md:47-52` | Add nginx basic auth + IP allowlist + WAF in front of CometBFT RPC; or disable RPC and use the backend's authenticated proxy endpoints exclusively for all client access. |
| S4 | **HIGH** | Session cookie in production has `secure: true` + `httpOnly: true` + `sameSite: strict` = good. But if `SESSION_SECRET` is weak or rotated while sessions are live, all users are kicked out with zero audit trail. Also, `SESSION_SECRET` has no rotation mechanism documented. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L199-L208) | Support multiple SESSION_SECRET values for graceful rotation (pass array to express-session). Log rotation events. |
| S5 | **HIGH** | `csurf` is deprecated/unmaintained. Still in use globally at index.js:216. | `npm audit` + docs for csurf | Migrate to `csrf-csrf` or equivalent maintained package. |
| S6 | **MEDIUM** | Two auth middlewares (`auth.js`, `adminAuth.js`) duplicate JWT parse + user lookup. The `decoded.id` legacy path is still accepted, which means old tokens with weaker claims still work — no revocation list. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js#L57-L59) | Factor into `requireAuth(role?)` factory; drop legacy `id` path; add JWT `jti` + Redis denylist for logout/revocation. |
| S7 | **MEDIUM** | `ADMIN_API_KEY` gates `/metrics` and admin bootstrap, but there is no documented rotation cadence, no scope-limiting per consumer, and no hashing of the key — it's compared string-equal to env. | `/metrics` route in `index.js:341-359` and `adminPanel.js:POST /bootstrap` | Hash admin API keys (bcrypt or sha256+salt); add per-key usage logs; support key rotation via multiple env vars (ADMIN_API_KEY_1, _2, etc.). |
| S8 | **LOW** | `dotenv` is used in production (backend index.js loads it first). Best practice: do NOT ship `.env` files in container images. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L1-L5) | Disable `dotenv` when `NODE_ENV=production`; secrets must come from Vault/Secrets Manager not from file. |

### 3.2 Encryption at Rest & in Transit

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| E1 | **CRITICAL** | **Encryption-at-rest not addressed anywhere in repo.** Mongo volumes unencrypted; chain `data/` dir unencrypted; backups to local `./backups` unencrypted; log files unencrypted. Any host-level compromise gives full read access to KYC PII, wallets linked to phone numbers, and Safaricom transaction records. | No LUKS/btrfs-encryption, no SSE-KMS, no encrypted Mongo volumes | Require: (1) Mongo host or managed service with storage encryption, (2) chain data filesystem encryption (LUKS) + encrypted swap, (3) S3/GCS backup destination with SSE-KMS (SSE-C at minimum), (4) application-level encryption for `phone` + `kycDocuments` + `walletAddress` columns using envelope encryption (KMS + DEK). |
| E2 | **HIGH** | User `phone`, `email`, `walletAddress` fields are stored in plaintext. User model [user.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/user.js) indexes them (sparse, but plaintext). If DB is breached, all PII is exposed in bulk. | [models/user.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/user.js#L15-L64) | Application-level encryption for `phone`, `email`, `kycDocuments`; store a blinded hash (HMAC with app key) for lookups. |
| E3 | **HIGH** | No TLS between backend ↔ Mongo, backend ↔ Redis, or backend ↔ Vault. If these services run across a trust boundary (multi-AZ, managed service), all data in transit is plaintext after TLS terminates at the edge. | Mongo URI default `mongodb://`; Redis config no TLS | Require `mongodb+srv://` or `tls=true`; switch to `rediss://` or TLS wrapper; enforce TLS on all Vault requests (HTTPS-only, no downgrade). |
| E4 | **MEDIUM** | HSTS enabled (max-age=365 days, preload=true) but no `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` beyond defaults. | helmet() call in index.js | Add explicit: `{ frameguard: { action: 'deny' }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, hsts: true, noSniff: true, ieNoOpen: true, permittedCrossDomainPolicies: { policy: 'none' }, crossOriginOpenerPolicy: true, crossOriginEmbedderPolicy: true }`. |
| E5 | **LOW** | Content-Security-Policy in production allows `connectSrc: [frontendUrl]`. If you add external analytics or chat widget later, CSP will be relaxed over time. `objectSrc: 'none'` = good, but `scriptSrc` missing `'strict-dynamic'` with nonce. | [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js#L86-L100) | Iterate toward nonce-based CSP with strict-dynamic; lock down style-src with hashes. |

### 3.3 Compliance (GDPR/PCI-DSS/KYC/PII)

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| C1 | **CRITICAL** | **No privacy policy, no cookie consent, no GDPR data-subject requests documented.** User model stores email/phone/kycLevel/linkedWallets but no `dataProcessingConsent`, no `rightToBeForgotten` endpoint, no data retention schedule for KYC docs. | [models/user.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/user.js) | Implement: (1) `POST /api/gdpr/export`, `POST /api/gdpr/delete`, (2) cookie consent banner + Google Consent Mode v2, (3) data retention policy document (90d for raw logs, 7y for tax records, KYC docs per regulator), (4) TOS + privacy policy legal review. |
| C2 | **CRITICAL** | **PCI-DSS scope unclear.** If Safaricom stores cards or if any PAN data hits backend servers, PCI-DSS SAQ A vs D assessment must be done before launch. Current code has no explicit sanitization pipeline for PAN fields or a documented cardholder-data scope boundary. | Safaricom B2C flows never explicitly reject PAN | Scope your PCI footprint: aim for SAQ A (redirect-only) — ensure NO cardholder data passes through your backend. If any payment detail flows through your logs or models, immediate DPIA + PCI audit. |
| C3 | **HIGH** | No KYC document retention policy, no document redaction pipeline, no audit of who views KYC docs (KycReviewTab loads them directly, no per-view log). | `adminPanel.js:GET /api/admin/kyc/*` + frontend KycReviewTab | Encrypt KYC blobs at rest; require per-view audit log with admin id, timestamp, and ip; enforce automatic redaction (mask ID numbers) in non-kyc contexts. |
| C4 | **HIGH** | No data breach incident response playbook (4.3.2, 4.3.3 above mention incident steps but no GDPR 72h notification template, no regulator contacts list). | SECURITY.md has high-level incident response only | Add `docs/incident-response/data-breach-playbook.md` with regulator contact list, 72h notif template, PR comms template, forensic chain-of-custody steps. |
| C5 | **MEDIUM** | Withdrawal Requests store `phone`, `amountKES`, `walletAddress` — no data classification label, no TTL for temporary records. | [models/WithdrawalRequest.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/models/WithdrawalRequest.js) | Add TTL index on non-critical records; classify data (Public/Internal/Confidential/Restricted) and document per field in `docs/data-classification.md`. |

### 3.4 Penetration Testing Surface & Secret Management

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| SEC1 | **CRITICAL** | **No pentest ever performed (SECURITY.md says "undergoes regular audits" but zero audit reports in repo). No bug bounty program either.** Highest-risk surfaces: treasury signing via Vault, Safaricom callback verification, ADR-036 signature verification in convert/send flows, admin API keys, Cosmos SDK ante handlers, vault password KDF, xss in user-generated banners. | [SECURITY.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/SECURITY.md#L49-L60) | Engage a third party for focused pentest (minimum 2 weeks by experienced web3+fintech firm); fix all Critical/High findings before go-live; publish a security.txt at `/.well-known/security.txt` + public bug bounty on Immunefi with clear scoping and payouts. |
| SEC2 | **HIGH** | The chain's upgrade procedure has no tested upgrade handler (app.go references `upgradeKeeper` but no concrete handler plan). A Cosmos SDK upgrade without a handler is a halting event. | App wiring in [app.go](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/app/app.go) references upgradeKeeper | Add an upgrade module handler plan with end-to-end test: upgrade a running chain via governance proposal, verify post-upgrade state integrity. |
| SEC3 | **HIGH** | Treasury signing only requires `VAULT_ADDR+VAULT_TOKEN` with no dual approval, no break-glass procedure, no tx size limits. A single stolen token allows unlimited draining of treasury. | [keyManager.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/keyManager.js) | Treasury: multi-sig or Shamir (Shamir's Secret Sharing) + signer quorum (3 of 5). For payouts: enforce per-tx, daily caps; large withdrawals require manual admin approval. |
| SEC4 | **HIGH** | `.env.example` committed — fine. But any real `.env` files might be un-ignored; `git status` not performed here. No pre-commit hook (like `gitleaks`) to prevent secret commits. | [.env.example](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.env.example) | Add `gitleaks` pre-commit hook + CI job. |
| SEC5 | **MEDIUM** | Session tokens have no explicit expiry. JWT tokens default to no `expiresIn` in some routes — grep JWT sign calls to confirm. | [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js) jwt.sign() | Force 15-min access tokens + 7-day refresh tokens (rotated, DB/Redis stored). |
| SEC6 | **MEDIUM** | Socket.IO server allows anonymous connections; `subscribe:wallet` accepts any address. There is no proof-of-ownership challenge before streaming balance/transaction updates to a wallet address. | Socket handlers in `index.js:302-340` | Require ADR-036 signature challenge-response before sending wallet-specific events over socket. |

---

## 4. Operational Readiness Check

### 4.1 Disaster Recovery, RTO, RPO

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| DR1 | **CRITICAL** | **RTO/RPO not defined or documented anywhere.** The audit explicitly required RTO <4h and RPO <1h. Today there is zero plan and zero guarantees. | Grep of RTO/RPO across entire repo = 0 matches | Document `docs/disaster-recovery/plan.md` with: (a) per-tier RTO/RPO targets (API: RTO 30m, RPO 5m; Chain: RTO 2h, RPO 1h; DB: RTO 1h, RPO 5s via PITR), (b) failover steps, (c) personnel authorized to declare disaster, (d) communications template to users, (e) post-DR validation checklist. |
| DR2 | **CRITICAL** | **Backups are local-only with no offsite replication (D4 above).** If the host/region goes down, backups are lost with the primary data. | `backup.sh:18` writes to `./backups` | Offsite replication: S3/GCS cross-region with encrypted transfers; backup integrity hash stored in separate ledger; weekly restore drill from offsite copy. |
| DR3 | **HIGH** | No failover test has ever been performed. There is no "kill the primary DB" script or chaos-engineering test to confirm the system routes traffic to standby. | No scripts | Schedule a Game Day: (1) stop marketplaced node, (2) promote read-only Mongo replica, (3) redirect traffic to a second API region; measure RTO and write up lessons learned. |
| DR4 | **HIGH** | No chain validator disaster recovery. If the only validator (staging today, but production) loses its key or state, there is no documented key shard, backup validator, or social recovery procedure. | No docs for validator backup | Distribute validator keys via Shamir (k-of-n); document signing-offline procedure; prepare a hot-spare sentry + backup validator in a separate region. |

### 4.2 On-Call Rotas, Incident Response, Runbooks

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| OPS1 | **CRITICAL** | **Zero incident response runbooks or on-call schedules in repo.** No on-call rota; no escalation paths; no list of who paged for payment failures vs chain outages. SECURITY.md has 6 lines about incident response without concrete steps. | [SECURITY.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/SECURITY.md#L62-L69) | Add `docs/oncall.md` (rota, escalation, contact sheet); add `docs/runbooks/*.md` for the top 10 incidents: (1) Daraja API down, (2) chain consensus halted, (3) Mongo primary failover, (4) high error rate on payouts, (5) faucet abuse, (6) 5xx on login, (7) KYC submission queue stuck, (8) validator missed blocks threshold, (9) treasury signing failures, (10) security incident (phished admin). |
| OPS2 | **HIGH** | No PagerDuty/Opsgenie integration. Alerts only go to prometheus metrics in a flat file — if nobody is looking at Grafana at 3AM, nobody knows. | 0 alertmanager configs | Ship Alertmanager + pager integration *before* any users are onboarded. |
| OPS3 | **HIGH** | `START_ALL.sh` and `STOP_ALL.sh` exist, but no documented health-check playbook for verifying a deploy is healthy. No smoke-test suite that ops can run post-deploy. | `START_ALL.sh` exists but no smoke-tests folder | Commit `scripts/smoke-test.sh` that runs: (1) `/api/health`, (2) create test user + login, (3) wallet address lookup, (4) submit signed test tx with low denom (inspect success, refund or burn after). |
| OPS4 | **MEDIUM** | No documented post-incident review template. Every major incident should produce a PIR (Post-Incident Review) with action items tracked to close. | 0 templates | Add `docs/post-incident-review-template.md` with timeline, impact, root cause, corrective actions, prevention. |
| OPS5 | **LOW** | No capacity planning dashboard. No dashboards for "current Mongo storage at X, forecasted full in Y days", "API p95 latency trending". | No Grafana dashboards in repo | Create capacity dashboards (storage, CPU, memory, QPS) with weekly auto-reports. |

### 4.3 User & Admin Documentation

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| DOC1 | **HIGH** | No end-user help center: How do users recover wallets? How to convert Mallpoints? Why is a KYC rejected? What fees are charged for buy/sell? No in-app help or external docs site. | 0 `docs/user/` folder | Add a docs site (Docusaurus or MDX under `/docs`) with user guide, FAQ, fee schedule, wallet recovery guide. |
| DOC2 | **HIGH** | Admin guide is missing: what do "Approved" / "Rejected" mean in KYC Review? What do the different Badge method colors mean? How to replay a failed payout? How to reverse a bugged Mallpoints conversion? | Admin UI tabs exist but no inline help | Add admin guide in `docs/admin-guide.md` + inline help tooltips next to every destructive button (Delete user, Force payout, Grant badge, Maintenance toggle). |
| DOC3 | **MEDIUM** | CONTRIBUTING.md exists but has no local dev quickstart with exact make targets or prerequisites (Go 1.24, Node 20, MongoDB, Redis, buf, ignite/cli). | [CONTRIBUTING.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/CONTRIBUTING.md) | Step-by-step prerequisites + one command: `make dev-up` that spins up docker-compose + runs chain + seeds test data. |
| DOC4 | **LOW** | API_REFERENCE.md exists but no OpenAPI/Swagger spec generated from route validation schemas — will drift over time. | [API_REFERENCE.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/API_REFERENCE.md) | Add `swagger-jsdoc` + `swagger-ui-express` to backend; autogenerate OpenAPI spec from Joi schemas. |

---

## 5. Severity Summary & Closure Gates

| Severity | Count | Must Close Before Launch? |
|---|---|---|
| CRITICAL | 12 | **YES, all of them** |
| HIGH | 26 | **YES, all of them** |
| MEDIUM | 18 | Close ≥ 50% before launch, rest in 30 days post-launch |
| LOW | 12 | Best-effort |

---

## 6. Recommended Closure Roadmap (Go/No-Go Re-review in ~4–6 weeks)

### Phase G1 (Weeks 1–2) — Infrastructure & Blockers
1. Deploy a staging environment with TLS, LB, managed Mongo PITR, Redis Cluster, chain HA (sentry + validator split).
2. Add deploy pipeline (CI1), deploy jobs with rollback + approval gate.
3. Close I1, I2, I3, D1, D2, D4, D5, CI1, CI2, CI5, SEC4.

### Phase G2 (Weeks 2–3) — Money-in/Money-out + Chain Safety
1. Implement Safaricom DLQ + retries + idempotency (T1).
2. Redis mandatory in production + chainClient with retry/circuit (P3, T2).
3. FeesAccumulated proto fix + ExportGenesis (A2).
4. history.js fix + route ordering /performance (A3).
5. Close A1 top-3 admin financial ops tabs (Liquidity Activity + Reconciliation + Withdrawals Queue).

### Phase G3 (Weeks 3–4) — Security & Compliance
1. Encryption at rest + application-level PII encryption (E1, E2, E3).
2. x/vault KDF audit + remove password from events (S2).
3. GDPR endpoints + retention policy + cookie consent (C1).
4. PCI DSS SAQ assessment scope (C2).
5. JWT expiry + revocation, session rotation (S4, S6, SEC5).
6. Treasury key hardening (SEC3).
7. CSURF replacement (S5).

### Phase G4 (Weeks 4–5) — Ops + Observability
1. Ship Alertmanager rules + Grafana dashboards + PagerDuty (O1, O2, OPS2).
2. Document DR plan with RTO/RPO (DR1).
3. On-call rota + 10 runbooks (OPS1).
4. Logger migration to pino (P4) + OpenTelemetry (O3).
5. Lighthouse CI + k6 load tests + SLOs (P1).

### Phase G5 (Week 6) — Pentest + Game Day
1. Third-party pentest engagement (SEC1) → fix all Critical/Highs + re-test.
2. Game Day failover (DR3) + smoke-test suite (OPS3) → pass.
3. Close remaining HIGH items, confirm ≥ 50% medium closed.

### Final Re-review
After G5 completion:
- **No open Critical**
- **No open High**
- ≥50% Medium closed
- DR plan tested, alerts firing, on-call rota active
→ **GO FOR PRODUCTION** (initially limited to a small beta cohort, then ramp with monitoring).

---

## 7. Final Recommendation: **NO-GO (Defer Launch)**

Do not deploy for uncontrolled production traffic. The 12 Critical findings (no infrastructure-as-code, single points of failure everywhere, no deployment pipeline, no SAST/container scanning, no encryption-at-rest, no RTO/RPO plan, no on-call runbooks, no PII/GDPR compliance, no pentest, no PagerDuty, no performance baselines) mean that even *if* the application code works perfectly, an infrastructure or operational event would likely cause data loss, user harm, or regulatory exposure.

**Recommended next actions:** Execute Phase G1 → G5 in order, then re-convene a readiness review after 4–6 weeks.

---

## 8. Key File References

- Infrastructure: [docker-compose.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/docker-compose.yml), [Dockerfile](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/Dockerfile), [backend/Dockerfile](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/Dockerfile)
- Backups/restore: [backup.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/backup.sh), [restore.sh](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/scripts/restore.sh)
- CI/CD: [ci.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/ci.yml), [release.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/workflows/release.yml), [dependabot.yml](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.github/dependabot.yml)
- Backend entry/config: [index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/index.js), [config/index.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/config/index.js)
- Observability: [logger.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/logger.js), [metrics.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/metrics.js), [errorHandler.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/errorHandler.js)
- Security: [auth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/auth.js), [adminAuth.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/adminAuth.js), [keyManager.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/utils/keyManager.js)
- Database: [mongo-init.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mongo-init.js)
- Frontend build: [vite.config.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/vite.config.ts)
- Docs: [PRODUCTION.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/PRODUCTION.md), [SECURITY.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/SECURITY.md), [CONTRIBUTING.md](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/CONTRIBUTING.md)
