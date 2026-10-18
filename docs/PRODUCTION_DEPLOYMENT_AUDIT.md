# MALLCHAIN — PRODUCTION DEPLOYMENT READINESS AUDIT

**Date**: September 19, 2026  
**Scope**: READ-ONLY production deployment requirements analysis  
**Status**: Audit complete — No code modifications made

---

## EXECUTIVE SUMMARY

The local Mallchain stack is operational and demonstrates correct wallet data integration. Transitioning to production requires significant infrastructure work organized across 18 categories below.

**Current Gap**: All 18 categories require configuration or setup. This is not a small change—it's a comprehensive infrastructure transition.

---

## AUDIT METHODOLOGY

This audit inspects existing production configuration files:
- `PRODUCTION.md` — Official production deployment guide
- `docker-compose.prod.yml` — Production service stack (13 services, 5 exporters)
- `deploy/nginx/conf.d/` — Reverse proxy configuration  
- `infra/terraform/` — Infrastructure-as-code
- Backend `.env` configuration requirements
- Frontend `.env` configuration requirements

---

## CATEGORY 1: SERVER/INFRASTRUCTURE

| Item | Status | Details |
|------|--------|---------|
| Server provisioning | ⏳ NEEDS CONFIGURATION | docker-compose.prod.yml requires Docker host with ~16GB RAM |
| Docker installed | ⏳ MISSING | Production assumes Docker + Docker Compose installed |
| Docker Compose v2 | ⏳ MISSING | docker-compose.prod.yml syntax requires v2+ |
| Minimum hardware | ⏳ NEEDS VERIFICATION | Backend: 4 CPU, 4GB RAM; Chain sentry: 4 CPU, 8GB RAM; Redis cluster: 3x node |
| Network infrastructure | ⏳ NEEDS CONFIGURATION | docker-compose.prod.yml defines custom network 10.30.0.0/16 |
| Resource limits | ⏳ READY | Configured in docker-compose.prod.yml (CPU/memory constraints per service) |

**Minimum Checklist**:
- [ ] Server provisioned (cloud provider or self-hosted)
- [ ] Docker installed and verified
- [ ] Docker Compose v2+ installed
- [ ] Network accessibility confirmed
- [ ] Hardware meets minimum specs

---

## CATEGORY 2: BLOCKCHAIN NODE

| Item | Status | Details |
|------|--------|---------|
| Binary built | ✅ READY | Dockerfile exists, builds from source |
| Genesis configuration | ⏳ NEEDS CONFIGURATION | Must match chain_id and denoms |
| Chain ID | ⏳ NEEDS VERIFICATION | Current: "mallchain-1" (must align across all systems) |
| Base denom | ⏳ NEEDS VERIFICATION | Current: "stake" (production may use different denom) |
| Minimum gas prices | ⏳ READY | Set to "0.01stake" (configurable) |
| Validator setup | ⏳ NEEDS CONFIGURATION | Requires validator key and stake |
| Node moniker | ⏳ READY | "validator1" in local, configurable for production |
| Unsafe RPC exposure | ❌ NEEDS CONFIGURATION | Current: RPC listens on 0.0.0.0:26657 — should be restricted |

**Production Issues Found**:
1. RPC exposed to 0.0.0.0 — MUST restrict to reverse proxy or internal network
2. No sentry node architecture — production should separate validator from sentry nodes
3. Genesis file location not specified — requires dedicated volume or init

**Minimum Checklist**:
- [ ] Genesis file created and validated
- [ ] Chain ID aligned across all systems (backend, frontend, blockchain)
- [ ] Validator keys generated (or imported if testnet replay)
- [ ] RPC restricted to reverse proxy or internal network (NOT 0.0.0.0)
- [ ] Sentry node architecture implemented (if production grade)
- [ ] Minimum gas prices confirmed
- [ ] Validator stake configured

---

## CATEGORY 3: PUBLIC RPC (BLOCKCHAIN REST)

| Item | Status | Details |
|------|--------|---------|
| REST API enabled | ✅ READY | `--api.enable --api.address=tcp://0.0.0.0:1317` in docker-compose.prod.yml |
| REST port binding | ⏳ NEEDS CONFIGURATION | Currently 0.0.0.0:1317 — should be internal only |
| Rate limiting | ⏳ MISSING | No rate limit configured for REST endpoints |
| CORS | ⏳ NEEDS CONFIGURATION | Not configured at REST level (nginx handles this) |
| Reverse proxy | ⏳ NEEDS CONFIGURATION | nginx should proxy REST requests with TLS |
| Domain configuration | ⏳ MISSING | Nginx configured for "rpc.mallchain.co.ke" — needs DNS/TLS cert |

**nginx configuration found**:
- REST should be served at: `https://rpc.mallchain.co.ke`
- Rate limiting: 10 req/s zone, 50 burst allowed
- Access control: Restricted to 10.20.0.0/16 (internal network only)

**Minimum Checklist**:
- [ ] REST port binding restricted to internal network
- [ ] Rate limiting implemented (10 req/s configured in nginx)
- [ ] CORS headers configured (if external clients needed)
- [ ] Reverse proxy (nginx) configured
- [ ] Domain name "rpc.mallchain.co.ke" registered
- [ ] TLS certificate provisioned
- [ ] Access control list configured

---

## CATEGORY 4: PUBLIC REST/API (BACKEND)

| Item | Status | Details |
|------|--------|---------|
| Backend containerized | ✅ READY | backend/Dockerfile exists |
| Port binding | ⏳ NEEDS CONFIGURATION | docker-compose.prod.yml: backend:4000 (internal only) |
| Health endpoint | ✅ READY | GET /api/health implemented |
| Reverse proxy | ⏳ NEEDS CONFIGURATION | nginx location /api/ → upstream backend:4000 |
| Domain configuration | ⏳ MISSING | Nginx configured for "api.mallchain.co.ke" |
| CORS | ⏳ NEEDS CONFIGURATION | Backend: set CORS_ORIGINS env var (not in current .env) |
| Rate limiting | ⏳ NEEDS CONFIGURATION | No rate limits in docker-compose.prod.yml (only nginx has RPC limits) |
| Authentication | ✅ READY | JWT tokens implemented, EMAIL verification required |

**nginx configuration found**:
- Backend served at: `https://api.mallchain.co.ke/api/`
- Timeout: 60s read/write
- Max body size: 4MB

**Environment Variables Missing**:
- `CORS_ORIGINS` — Not set in current .env
- `FRONTEND_URL` — Set to localhost:5173 locally

**Minimum Checklist**:
- [ ] Backend running in docker-compose.prod.yml configuration
- [ ] Backend port 4000 exposed only internally
- [ ] CORS_ORIGINS set to production frontend domain
- [ ] FRONTEND_URL set to production frontend URL
- [ ] Reverse proxy (nginx) configured for /api/ path
- [ ] Domain "api.mallchain.co.ke" registered
- [ ] TLS certificate provisioned
- [ ] Rate limiting configured (if needed)
- [ ] Health endpoint verified

---

## CATEGORY 5: BACKEND

| Item | Status | Details |
|------|--------|---------|
| NODE_ENV | ⏳ NEEDS CONFIGURATION | Must be "production" (currently "development") |
| JWT_SECRET | ⏳ NEEDS ROTATION | Current value hardcoded — MUST rotate for production |
| SESSION_SECRET | ⏳ NEEDS ROTATION | Current value hardcoded — MUST rotate for production |
| ADMIN_API_KEY | ⏳ NEEDS ROTATION | Current value hardcoded — MUST rotate for production |
| PAYMENT_WEBHOOK_SECRET | ⏳ NEEDS ROTATION | Current value hardcoded — MUST rotate for production |
| CHAIN_ID alignment | ⏳ NEEDS VERIFICATION | "mallchain-1" must match blockchain config |
| CHAIN_PREFIX | ✅ READY | Set to "mall" |
| GAS_PRICE alignment | ⏳ NEEDS VERIFICATION | "0.01stake" must match blockchain minimum-gas-prices |
| VAULT_ADDR | ⏳ NEEDS CONFIGURATION | docker-compose.prod.yml includes vault service (must be initialized) |
| VAULT_ROLE_ID | ⏳ NEEDS ROTATION | Current hardcoded — rotate for production |
| VAULT_SECRET_ID | ⏳ NEEDS ROTATION | Current hardcoded — rotate for production |
| OPERATOR_MNEMONIC | ❌ NEEDS CONFIGURATION | ALLOW_OPERATOR_MNEMONIC=true allows plaintext mnemonic (unsafe) |
| FAUCET_MNEMONIC | ❌ NEEDS ROTATION | Current mnemonic public — rotate for production |
| FAUCET_ENABLED | ⏳ NEEDS CONFIGURATION | Should be true for testnet, false for production mainnet |
| MONGO_URI | ⏳ NEEDS CONFIGURATION | Must point to docker-compose.prod.yml MongoDB replica set |
| REDIS_HOST/PORT | ⏳ NEEDS CONFIGURATION | Must point to docker-compose.prod.yml Redis sentinel setup |

**Critical Security Issues Found**:
1. All secrets hardcoded in .env file — MUST use vault or external secret management
2. ALLOW_OPERATOR_MNEMONIC=true — allows hot wallet signing on server (high risk)
3. Faucet mnemonic public — funds at risk
4. No environment rotation strategy documented

**Minimum Checklist**:
- [ ] NODE_ENV=production
- [ ] All secrets rotated (JWT, SESSION, ADMIN_API_KEY, WEBHOOK_SECRET)
- [ ] OPERATOR_MNEMONIC: Either use Vault OR set ALLOW_OPERATOR_MNEMONIC=false if not needed
- [ ] FAUCET_MNEMONIC: Use Vault (configured in docker-compose.prod.yml)
- [ ] VAULT_ADDR/ROLE_ID/SECRET_ID: Vault server initialized and configured
- [ ] MONGO_URI: Points to docker-compose.prod.yml MongoDB replica set
- [ ] REDIS_HOST: Points to docker-compose.prod.yml Redis Sentinel
- [ ] CORS_ORIGINS: Set to production frontend domain
- [ ] FRONTEND_URL: Set to production frontend URL
- [ ] FAUCET_ENABLED: Set appropriately for network (testnet vs mainnet)
- [ ] All secrets managed via Vault or Docker secrets (not .env)

---

## CATEGORY 6: MONGODB

| Item | Status | Details |
|------|--------|---------|
| Single node → Replica set | ✅ READY | docker-compose.prod.yml configures 3-node replica set |
| Data persistence | ✅ READY | Named volumes configured (mongo-data-1, mongo-data-2, mongo-data-3) |
| Authentication | ✅ READY | MONGO_INITDB_ROOT_USERNAME/PASSWORD in docker-compose.prod.yml |
| Keyfile generated | ⏳ MISSING | Production requires mongo-keyfile for intra-replica auth |
| Root password | ⏳ NEEDS CONFIGURATION | Referenced via Docker secret (secrets/mongo_root_password.txt) |
| App user password | ⏳ NEEDS CONFIGURATION | Referenced via Docker secret (secrets/mongo_app_password.txt) |
| Memory limits | ✅ READY | Each node: 4GB limit, 1GB reservation |
| CPU limits | ✅ READY | Each node: 2.0 CPU limit, 1.0 reservation |
| Backup strategy | ❌ MISSING | No backup configuration documented |
| Point-in-time recovery | ⏳ NEEDS CONFIGURATION | Oplog configured but no backup/restore script |

**Production Readiness**:
1. Keyfile must be generated: `openssl rand -base64 756 > mongo-keyfile && chmod 400 mongo-keyfile`
2. Secrets directory must be created: `secrets/mongo_root_password.txt` and `secrets/mongo_app_password.txt`
3. Replica set configured to replicate across 3 nodes (good for HA)

**Minimum Checklist**:
- [ ] mongo-keyfile generated and deployed to docker-compose volume
- [ ] secrets/mongo_root_password.txt created with strong password
- [ ] secrets/mongo_app_password.txt created with strong password
- [ ] MongoDB replica set initialized (automatic in docker-compose.prod.yml)
- [ ] Database backup strategy implemented (oplog-based or external)
- [ ] Point-in-time recovery tested

---

## CATEGORY 7: REDIS

| Item | Status | Details |
|------|--------|---------|
| Single node → Cluster | ✅ READY | docker-compose.prod.yml configures 3-node Redis cluster with Sentinel |
| Persistence | ✅ READY | RDB + AOF enabled (`--appendonly yes`) |
| Memory limits | ✅ READY | Each node: 512MB maxmemory with LRU eviction |
| Sentinel setup | ✅ READY | 3 Sentinel nodes configured for automatic failover |
| Monitoring | ✅ READY | redis-exporter service included |
| Cluster initialization | ⏳ NEEDS CONFIGURATION | Redis cluster must be initialized (`redis-cli --cluster create...`) |
| Password authentication | ⏳ NEEDS CONFIGURATION | No password set in docker-compose.prod.yml (open cluster) |
| Data backup | ⏳ MISSING | No backup script for Redis cluster snapshots |

**Current Local Setup vs Production**:
- Local: Single daemonized Redis instance :6379 (no persistence)
- Production: 3-node cluster + 3 Sentinel nodes + AOF/RDB persistence

**Production Readiness**:
1. Cluster initialization must be done after containers start
2. Authentication should be added for security (not currently configured)
3. Backup strategy required for production

**Minimum Checklist**:
- [ ] Redis cluster initialized via redis-cli commands
- [ ] Sentinel nodes responding on ports 26379, 26380, 26381
- [ ] Master election working (test by stopping primary node)
- [ ] Persistence enabled (RDB + AOF in place)
- [ ] Backup strategy for Redis cluster implemented
- [ ] Redis password configured (optional but recommended)
- [ ] Backend configured to use Redis Sentinel (redis-node-1:6379 + sentinel ports)

---

## CATEGORY 8: FRONTEND

| Item | Status | Details |
|------|--------|---------|
| Build process | ✅ READY | Dockerfile exists, npm run build configured |
| Static files | ✅ READY | dist/ directory served by nginx |
| Environment config | ⏳ NEEDS CONFIGURATION | VITE_API_BASE_URL must be set to https://api.mallchain.co.ke |
| Chain ID | ⏳ NEEDS VERIFICATION | VITE_CHAIN_ID="mallchain-1" (must match backend/blockchain) |
| Chain prefix | ✅ READY | VITE_CHAIN_PREFIX="mall" |
| Gas price | ⏳ NEEDS VERIFICATION | VITE_GAS_PRICE="0.01stake" (must match backend) |
| Session TTL | ⏳ READY | VITE_SESSION_TTL=120 (configurable, default OK) |
| Network label | ⏳ NEEDS CONFIGURATION | VITE_NETWORK="testnet" → change to "mainnet" for production |
| Reverse proxy | ⏳ NEEDS CONFIGURATION | nginx location / → upstream frontend:80 |
| Domain configuration | ⏳ MISSING | Nginx configured for "app.mallchain.co.ke" |
| TLS certificate | ⏳ MISSING | HTTPS required for production |
| Cache headers | ⏳ READY | nginx handles static caching |

**Frontend Environment (from .env.example)**:
```
VITE_API_BASE_URL=https://api.mallchain.co.ke
VITE_CHAIN_ID=mallchain-1
VITE_CHAIN_PREFIX=mall
VITE_GAS_PRICE=0.01stake
VITE_NETWORK=mainnet (change from testnet)
VITE_SESSION_TTL=120
```

**Build Location**:
- Frontend built to `frontend/dist/`
- Served by nginx from upstream `frontend:80`
- Production domain: `https://app.mallchain.co.ke`

**Minimum Checklist**:
- [ ] Frontend .env.production created with production values
- [ ] VITE_API_BASE_URL set to backend HTTPS domain
- [ ] VITE_NETWORK set to "mainnet" (if production mainnet)
- [ ] Chain ID/prefix/gas price match backend
- [ ] npm run build executed successfully
- [ ] dist/ directory verified (contains index.html, JS/CSS)
- [ ] Reverse proxy (nginx) configured for static files
- [ ] Domain "app.mallchain.co.ke" registered
- [ ] TLS certificate provisioned

---

## CATEGORY 9: DNS

| Item | Status | Details |
|------|--------|---------|
| Domain registration | ⏳ MISSING | Three domains needed (see nginx config) |
| DNS A records | ⏳ MISSING | Must point to nginx reverse proxy IP |
| DNS TTL | ⏳ NEEDS CONFIGURATION | Recommend 3600 (1 hour) for easier troubleshooting |

**Domains Required** (from nginx config):
1. `api.mallchain.co.ke` → Backend API (nginx reverse proxy)
2. `app.mallchain.co.ke` → Frontend (nginx reverse proxy)
3. `rpc.mallchain.co.ke` → Blockchain RPC (nginx reverse proxy, restricted)

**DNS Setup**:
- All three domains must resolve to the same nginx reverse proxy IP address
- nginx determines routing based on SNI (Server Name Indication in TLS)

**Minimum Checklist**:
- [ ] Domain registrar account created (Namecheap, GoDaddy, etc.)
- [ ] Three domains registered or transferred
- [ ] DNS A records created (all pointing to nginx IP)
- [ ] DNS propagation verified (nslookup/dig confirms)
- [ ] TTL appropriate for environment (3600 recommended)

---

## CATEGORY 10: TLS/HTTPS

| Item | Status | Details |
|------|--------|---------|
| Certificate authority | ⏳ MISSING | Recommendations: Let's Encrypt (free) or commercial CA |
| Certificate provisioning | ⏳ MISSING | docker-compose.prod.yml includes certbot + renewal.timer |
| Wildcard certificate | ⏳ OPTION | Could use *.mallchain.co.ke for all subdomains |
| Certificate renewal | ✅ READY | certbot-renewal.service and certbot-renewal.timer in deploy/ |
| Protocol version | ✅ READY | nginx configured for TLS 1.3 only (excellent) |
| Cipher suites | ✅ READY | Strong ciphers configured (TLS_AES_256_GCM_SHA384, etc.) |
| HSTS header | ✅ READY | "max-age=63072000; includeSubDomains; preload" configured |
| OCSP stapling | ✅ READY | Configured in nginx |
| Certificate location | ⏳ NEEDS CONFIGURATION | Mounted to nginx container at /etc/nginx/ssl |

**Production Certificate Options**:
1. Let's Encrypt (free, automated renewal) — Recommended
2. Commercial CA (DigiCert, Comodo, etc.)
3. Self-signed (development only)

**Current Nginx Configuration** (from mallchain.tls.conf):
- TLS 1.3 only (strict, modern)
- Strong cipher suites
- HSTS enabled with 2-year preload
- OCSP stapling enabled
- Certificate paths: /etc/nginx/ssl/fullchain.pem, /etc/nginx/ssl/privkey.pem

**Minimum Checklist**:
- [ ] SSL certificate obtained (Let's Encrypt or CA)
- [ ] fullchain.pem deployed to nginx container
- [ ] privkey.pem deployed to nginx container (permissions: 0400)
- [ ] Certificate renewal automated (certbot cron or timer)
- [ ] TLS configuration tested (SSL Labs score)
- [ ] HSTS preload list submission considered

---

## CATEGORY 11: CORS

| Item | Status | Details |
|------|--------|---------|
| CORS at nginx level | ✅ READY | Access-Control-* headers not explicitly set (defaults to restrictive) |
| CORS at backend level | ⏳ NEEDS CONFIGURATION | Backend config.js supports CORS_ORIGINS env var (not set) |
| Backend validation | ❌ MISSING | No CORS_ORIGINS value in .env files |
| Allowed origins | ⏳ NEEDS CONFIGURATION | Should be limited to frontend domain (app.mallchain.co.ke) |
| Preflight requests | ✅ READY | Browser handles automatically with modern CORS |

**CORS Configuration**:
- Frontend domain: `https://app.mallchain.co.ke`
- API domain: `https://api.mallchain.co.ke`
- Both under same base domain (mallchain.co.ke) — some CORS restrictions may be relaxed

**Environment Variable Needed**:
```
CORS_ORIGINS=https://app.mallchain.co.ke
```

**Minimum Checklist**:
- [ ] CORS_ORIGINS set to production frontend domain in backend/.env
- [ ] Backend restarted to apply CORS configuration
- [ ] Browser requests tested (verify no CORS errors in console)
- [ ] Preflight requests (OPTIONS) return 200 OK

---

## CATEGORY 12: FIREWALL/NETWORK PORTS

| Item | Status | Details |
|------|--------|---------|
| Port 80 (HTTP) | ✅ READY | nginx listens, redirects to HTTPS |
| Port 443 (HTTPS) | ✅ READY | nginx listens for TLS traffic |
| Port 26657 (Blockchain RPC) | ⏳ NEEDS CONFIGURATION | Currently 0.0.0.0:26657 in docker-compose — restrict to internal |
| Port 1317 (Blockchain REST) | ⏳ NEEDS CONFIGURATION | Currently 0.0.0.0:1317 — restrict to internal or reverse proxy only |
| Port 27017-27019 (MongoDB) | ✅ READY | Internal only (no external exposure in docker-compose.prod.yml) |
| Port 6379-6381 (Redis) | ✅ READY | Internal only (no port mappings in production) |
| Port 26379-26381 (Redis Sentinel) | ✅ READY | Internal only |
| Port 8200 (Vault) | ⏳ NEEDS CONFIGURATION | Internal only (no external binding recommended) |
| Port 5432 (PostgreSQL) | ✅ READY | Internal only (explorer database) |
| Port 9090 (Prometheus) | ✅ READY | Bound to 127.0.0.1:9090 only (internal monitoring) |
| Port 3000 (Grafana) | ✅ READY | Bound to 127.0.0.1:3000 only (internal monitoring) |

**Current Issues**:
1. Blockchain RPC/REST exposed to 0.0.0.0 (should be 127.0.0.1 or internal network)
2. No firewall rules documented

**Network Architecture**:
- Public: 80, 443 (nginx reverse proxy)
- Internal (docker network 10.30.0.0/16): All other services
- Monitoring (localhost only): Prometheus (9090), Grafana (3000)

**Minimum Checklist**:
- [ ] Firewall allows 80 (HTTP) and 443 (HTTPS) from public internet
- [ ] Firewall denies all other inbound traffic
- [ ] RPC/REST ports restricted to internal network or via nginx only
- [ ] VPN or SSH bastion for administrative access
- [ ] Port scans confirm only 80/443 visible
- [ ] Internal network isolated from public internet

---

## CATEGORY 13: SECRETS/ENVIRONMENT VARIABLES

| Item | Status | Details |
|------|--------|---------|
| JWT_SECRET | ⏳ NEEDS ROTATION | 64-char hex, must be unique per environment |
| SESSION_SECRET | ⏳ NEEDS ROTATION | 64-char hex, must be unique per environment |
| ADMIN_API_KEY | ⏳ NEEDS ROTATION | 64-char hex for metrics access |
| PAYMENT_WEBHOOK_SECRET | ⏳ NEEDS ROTATION | 64-char hex for Safaricom M-Pesa webhooks |
| FIELD_ENCRYPTION_KEY | ⏳ NEEDS ROTATION | 64-char hex for PII encryption |
| FIELD_BLIND_INDEX_KEY | ⏳ NEEDS ROTATION | 64-char hex for searchable encryption |
| OPERATOR_MNEMONIC | ⏳ NEEDS CONFIGURATION | Use Vault, not plaintext .env |
| FAUCET_MNEMONIC | ⏳ NEEDS CONFIGURATION | Use Vault, not plaintext .env |
| MONGO_ROOT_PASSWORD | ⏳ NEEDS CONFIGURATION | Use Docker secret, not .env |
| MONGO_APP_PASSWORD | ⏳ NEEDS CONFIGURATION | Use Docker secret, not .env |
| GRAFANA_ADMIN_PASSWORD | ⏳ NEEDS CONFIGURATION | Use Docker secret, not .env |
| POSTGRES_PASSWORD | ⏳ NEEDS CONFIGURATION | Use Docker secret, not .env |

**Secret Rotation Process** (Required for production):
```bash
# Generate strong random hex values
openssl rand -hex 32  # 64-char hex

# Store in Vault or Docker secrets, NOT in .env
docker secret create jwt_secret jwt_secret.txt
```

**Docker Secrets** (docker-compose.prod.yml expects):
- `secrets/postgres_password.txt`
- `secrets/mongo_root_password.txt`
- `secrets/grafana_admin_password.txt`

**Vault Configuration** (docker-compose.prod.yml includes vault service):
- All mnemonics should be stored in Vault KV engine
- Backend queries Vault at startup (env vars VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID)

**Minimum Checklist**:
- [ ] Generate new random secrets (not the hardcoded dev values)
- [ ] Create secrets/ directory with Docker secret files
- [ ] Initialize Vault service and load secrets
- [ ] .env files never contain production secrets
- [ ] Backend startup verifies Vault or Docker secrets are available
- [ ] Secret rotation schedule established (quarterly minimum)
- [ ] Emergency secret revocation procedure documented

---

## CATEGORY 14: MONITORING/LOGGING

| Item | Status | Details |
|------|--------|---------|
| Prometheus | ✅ READY | Service included in docker-compose.prod.yml |
| Alertmanager | ✅ READY | Service included with alert rules |
| Grafana | ✅ READY | Service included with dashboards |
| Node exporter | ✅ READY | System metrics collection |
| MongoDB exporter | ✅ READY | Database metrics |
| PostgreSQL exporter | ✅ READY | Explorer database metrics |
| Redis exporter | ✅ READY | Cache layer metrics |
| Nginx exporter | ✅ READY | Reverse proxy metrics |
| Vault exporter | ✅ READY | Secret store metrics |
| Metrics retention | ✅ READY | Prometheus configured for 30-day retention |
| Log aggregation | ⏳ MISSING | Logs in docker-compose (json-file driver, 100MB max) |
| Centralized logging | ❌ MISSING | No ELK/Loki configuration |
| Alert rules | ⏳ NEEDS CONFIGURATION | alertmanager.yml references rules not documented |
| Dashboards | ⏳ NEEDS CONFIGURATION | Grafana dashboards referenced but not provided |

**Monitoring Stack Included**:
- Prometheus (metrics database)
- Grafana (visualization, dashboards)
- Alertmanager (alert routing and dedup)
- 8 exporters (node, mongo, postgres, redis, nginx, vault, etc.)

**Logging**:
- Each service: json-file driver with 100MB/10 file rotation
- No centralized log collection (should consider ELK or Loki)

**Minimum Checklist**:
- [ ] Prometheus initialized and scraping all exporters
- [ ] Grafana dashboards created (or imported from community)
- [ ] Alertmanager configured for SMS/email/PagerDuty
- [ ] Alert rules created for critical metrics (disk, CPU, memory, Redis down, etc.)
- [ ] Log retention verified (100MB per container OK for moderate workload)
- [ ] Consider centralized logging (Loki/ELK) for long-term analysis
- [ ] Monitoring access restricted to admin network (Prometheus/Grafana on 127.0.0.1)

---

## CATEGORY 15: BACKUPS/RECOVERY

| Item | Status | Details |
|------|--------|---------|
| MongoDB backup | ⏳ MISSING | Replica set oplog-based, but no backup script documented |
| MongoDB restore | ⏳ MISSING | Point-in-time recovery not documented |
| Redis backup | ⏳ MISSING | RDB/AOF persistence configured, but no backup strategy |
| Redis restore | ⏳ MISSING | No documented recovery procedure |
| Backup frequency | ❌ MISSING | Not specified (recommend daily) |
| Backup retention | ❌ MISSING | Not specified (recommend 30 days) |
| Off-site storage | ❌ MISSING | No backup to S3/GCS/Azure recommended |
| Disaster recovery | ❌ MISSING | No RTO/RPO targets or DR procedure |
| Backup testing | ❌ MISSING | No documented restore tests |

**Backup Recommendations**:
1. MongoDB: mongodump daily to S3
2. Redis: RDB snapshots to S3 every 4 hours
3. Frontend/Config: Git repository (already done)
4. Database exports: Full monthly export

**Recovery Procedures Needed**:
1. MongoDB replica set recovery
2. Redis cluster recovery
3. Full system rebuild from docker-compose

**Minimum Checklist**:
- [ ] Backup script created for MongoDB (mongodump)
- [ ] Backup script created for Redis (bgsave, copy to S3)
- [ ] Cron/scheduler set up for automated backups (daily MongoDB, 4-hourly Redis)
- [ ] Backups tested: Restore from backup into dev environment
- [ ] Off-site storage (AWS S3, GCS, Azure) configured
- [ ] Backup retention policy enforced (30-day minimum)
- [ ] RTO/RPO targets defined (Recovery Time/Point Objective)
- [ ] Disaster recovery runbook written

---

## CATEGORY 16: WALLET/NETWORK CONFIGURATION

| Item | Status | Details |
|------|--------|---------|
| Chain ID | ⏳ NEEDS ALIGNMENT | "mallchain-1" across all: blockchain, backend, frontend |
| Chain prefix | ✅ READY | "mall" configured everywhere |
| Base denom | ⏳ NEEDS VERIFICATION | "stake" (check if production uses different) |
| Tokens | ⏳ NEEDS CONFIGURATION | MLCNS, MLPTS, MALL symbols mapped |
| Decimal places | ⏳ NEEDS VERIFICATION | 6 decimals (mlc → MLCNS conversion factor 10^6) |
| Wallet service | ✅ READY | Disabled by default (wallets sign in browser) |
| Faucet address | ⏳ NEEDS CONFIGURATION | Funded address for test network only |
| Validator setup | ⏳ NEEDS CONFIGURATION | Validator keys and stake configuration |

**Wallet Security**:
- Wallets sign transactions in browser (not on server) ✅ GOOD
- Server should NOT expose wallet service endpoint ✅ GOOD
- Private keys stored in user browser localStorage (should consider hardware wallet support)

**Token Mapping** (from investigation):
- Blockchain native denom: `mlc` (base unit)
- Display denom: `MLCNS` (after ÷10^6)
- Wallet UI symbol: `MALL`
- Mallpoints: `MLPTS` (separate token)

**Minimum Checklist**:
- [ ] Chain ID consistent across all systems
- [ ] Token decimals verified and documented
- [ ] Wallet service endpoint NOT publicly exposed
- [ ] Validator configured with sufficient stake (if validator network)
- [ ] Faucet configured (testnet) or disabled (mainnet)
- [ ] Token symbols correctly mapped in UI

---

## CATEGORY 17: TESTNET VS MAINNET SEPARATION

| Item | Status | Details |
|------|--------|---------|
| Network label | ⏳ NEEDS CONFIGURATION | Frontend: VITE_NETWORK env var (testnet vs mainnet) |
| Chain ID | ⏳ NEEDS VERIFICATION | Testnet: mallchain-1, Mainnet: separate chain ID? |
| Faucet | ⏳ NEEDS CONFIGURATION | Testnet: enabled, Mainnet: disabled |
| Genesis file | ⏳ NEEDS VERIFICATION | Different for testnet and mainnet |
| Validators | ⏳ NEEDS CONFIGURATION | Different validator sets for testnet vs mainnet |
| Wallet funding | ⏳ NEEDS CONFIGURATION | Test funds (testnet) vs real funds (mainnet) |
| Domain names | ⏳ NEEDS CONFIGURATION | Separate domains for testnet (api-testnet.mallchain.co.ke?) |
| Frontend warnings | ✅ READY | Frontend shows "testnet" label when VITE_NETWORK=testnet |

**Current Setup**:
- All configurations appear to be testnet-focused
- No mainnet separation documented

**Minimum Checklist**:
- [ ] Testnet and mainnet chains have different chain IDs
- [ ] Separate deployment environments (testnet vs mainnet)
- [ ] Testnet configuration documented (VITE_NETWORK=testnet, faucet enabled)
- [ ] Mainnet configuration documented (VITE_NETWORK=mainnet, faucet disabled)
- [ ] Separate domain names or flags for each network
- [ ] Frontend prominently displays "TESTNET" for non-mainnet
- [ ] Mainnet validators distinct from testnet
- [ ] Mainnet genesis separate from testnet

---

## CATEGORY 18: SECURITY HARDENING

| Item | Status | Details |
|------|--------|---------|
| Secrets in .env | ❌ FOUND | All secrets currently hardcoded in .env — MUST move to Vault/secrets |
| NODE_ENV | ⏳ NEEDS CONFIGURATION | Must be "production" to enable security checks |
| Plaintext mnemonics | ❌ FOUND | OPERATOR_MNEMONIC and FAUCET_MNEMONIC visible — use Vault |
| ALLOW_OPERATOR_MNEMONIC | ❌ FOUND | Set to true (allows server-side signing, high risk) |
| Wallet service exposure | ✅ READY | Wallet service not exposed publicly (default) |
| HTTPS only | ⏳ NEEDS CONFIGURATION | HTTP redirects to HTTPS ✅, but must enforce strictly |
| CORS validation | ⏳ NEEDS CONFIGURATION | CORS_ORIGINS not set in .env |
| Rate limiting | ⏳ NEEDS CONFIGURATION | RPC rate limited (10 req/s), API not explicitly limited |
| SQL injection | ✅ READY | MongoDB (not SQL) with parameterized queries |
| XSS prevention | ✅ READY | React framework provides built-in protection |
| CSRF tokens | ✅ READY | Backend generates session tokens |
| Authentication | ✅ READY | Email + password OR Google OAuth |
| Authorization | ✅ READY | User roles (user, admin, superadmin) configured |
| Audit logging | ⏳ NEEDS CONFIGURATION | Backend should log auth events to audit trail |
| Penetration testing | ❌ MISSING | Should be done before production launch |
| Security headers | ✅ READY | nginx configured with HSTS, X-Frame-Options, etc. |
| Dependency scanning | ⏳ NEEDS CONFIGURATION | npm audit and dependency updates not automated |

**Critical Security Findings**:

1. **Secrets in Version Control**
   - All production secrets hardcoded in .env
   - Action: Use Vault or Docker secrets
   - Risk: HIGH (anyone with repo access has all secrets)

2. **Operator Mnemonic Plaintext**
   - ALLOW_OPERATOR_MNEMONIC=true
   - Action: Use Vault for mnemonic storage
   - Risk: HIGH (server-side signing exposed to breaches)

3. **Faucet Mnemonic Public**
   - Mnemonic in .env file
   - Action: Move to Vault, rotate faucet address
   - Risk: MEDIUM (faucet funds at risk if mnemonic leaked)

4. **No Audit Trail**
   - Authentication events not logged
   - Action: Add audit logging for auth/admin actions
   - Risk: MEDIUM (compliance/forensics)

5. **No Dependency Scanning**
   - npm audit not in CI/CD
   - Action: Add Dependabot or npm audit to pipeline
   - Risk: MEDIUM (dependency vulnerabilities)

**Minimum Checklist**:
- [ ] All secrets moved to Vault or Docker secrets
- [ ] NODE_ENV set to "production"
- [ ] OPERATOR_MNEMONIC disabled (or use Vault only)
- [ ] FAUCET_MNEMONIC moved to Vault
- [ ] CORS_ORIGINS set to frontend domain only
- [ ] Rate limiting configured for API endpoints
- [ ] Audit logging implemented for authentication
- [ ] HTTPS enforced everywhere
- [ ] Security headers verified (HSTS, CSP, X-Frame-Options)
- [ ] npm audit run and vulnerabilities fixed
- [ ] Penetration test scheduled
- [ ] DDoS protection considered (Cloudflare, AWS Shield)

---

## SUMMARY CHECKLIST: MINIMUM STEPS TO PRODUCTION

Based on the audit, here's the minimum sequence to make Mallchain publicly accessible:

### Phase 1: Infrastructure Setup (Day 1-2)
1. Provision server (VPS or cloud: 16GB RAM, 8 CPU minimum)
2. Install Docker and Docker Compose v2
3. Create docker secrets directory with strong passwords
4. Register three domains (api, app, rpc subdomains)

### Phase 2: Certificate and Networking (Day 2-3)
5. Obtain TLS certificates (Let's Encrypt recommended)
6. Deploy certificates to docker-compose volume
7. Configure DNS A records (all three domains → nginx IP)
8. Verify DNS resolution and TLS

### Phase 3: Secrets Management (Day 3)
9. Initialize Vault service
10. Generate new production secrets (not dev hardcoded values)
11. Store all secrets in Vault or Docker secrets
12. Update docker-compose.prod.yml env vars to reference secrets

### Phase 4: Service Deployment (Day 4)
13. Pull and build production Docker images
14. Start docker-compose.prod.yml stack
15. Initialize MongoDB replica set
16. Initialize Redis cluster (redis-cli --cluster create)
17. Initialize Vault AppRole

### Phase 5: Configuration and Testing (Day 5-6)
18. Set backend environment variables (CHAIN_ID, GAS_PRICE, CORS_ORIGINS)
19. Set frontend environment variables (VITE_API_BASE_URL, VITE_NETWORK)
20. Test blockchain connection (curl http://localhost:1317/status)
21. Test backend API (curl http://localhost:4000/api/health)
22. Test frontend loading (verify dist/ assets)
23. Verify nginx routing for all three domains
24. Test TLS certificate validation (SSL Labs score)

### Phase 6: Monitoring and Hardening (Day 6-7)
25. Configure Grafana dashboards
26. Set up Alertmanager notifications
27. Implement backup strategy (MongoDB, Redis)
28. Configure audit logging
29. Run security scan (npm audit)
30. Document disaster recovery procedure

### Phase 7: Launch Validation (Day 7)
31. Internal testing: All APIs working
32. Wallet creation and balance verification
33. Transaction testing (if testnet)
34. Stress testing (load test, if prepared)
35. Penetration testing (if possible)
36. Launch monitoring and alerts active

---

## OUTSTANDING DECISIONS REQUIRED

Before production deployment, these decisions must be made:

1. **Network Type**: Testnet or Mainnet?
   - If testnet: Faucet enabled, small initial validators
   - If mainnet: Separate genesis, validator consensus

2. **Validator Configuration**:
   - Number of validators?
   - Validator stake amount?
   - Geographic distribution?

3. **Storage**: Where to run?
   - Self-hosted (VPS)
   - Cloud provider (AWS, GCP, DigitalOcean)
   - Kubernetes cluster?

4. **High Availability**:
   - Single server (current docker-compose.prod.yml supports this)
   - Multi-region failover?
   - Kubernetes StatefulSets?

5. **Mainnet Readiness**:
   - Code audit complete?
   - Security audit complete?
   - Testnet validation period?
   - Mainnet genesis parameters finalized?

---

## CONCLUSION

### Current Status
✅ Local stack operational  
✅ Wallet data flow verified  
✅ Architecture proven  
❌ Production infrastructure: NOT STARTED (18 categories, most need configuration)

### Effort Required
**Estimate: 1-2 weeks** for full production deployment with experienced DevOps/SRE support.

### Critical Path
1. Secrets management (Vault/Docker secrets) — **BLOCKING**
2. TLS certificates and DNS — **BLOCKING**
3. Database initialization (MongoDB RS, Redis cluster) — **BLOCKING**
4. Backend/Frontend configuration — **BLOCKING**
5. Monitoring and logging — **RECOMMENDED**
6. Backup and DR — **RECOMMENDED**

### Risk Assessment
- **Low**: Docker containerization (reduces deployment variance)
- **Medium**: Secrets management (currently hardcoded, fixable)
- **Medium**: Network architecture (RPC exposed, needs restriction)
- **Low-Medium**: TLS/DNS (standard production practice)

---

## NO CODE MODIFICATIONS MADE

This audit is READ-ONLY. All findings document required configuration, not code changes to the application itself.

The wallet signing logic, private key handling, mnemonic management, and transaction broadcasting remain untouched.

---

**Audit Complete**

Generated: 2026-09-19  
Scope: Production deployment readiness  
Next Phase: Infrastructure planning and provisioning

