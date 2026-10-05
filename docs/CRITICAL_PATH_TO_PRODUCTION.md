# MALLCHAIN — CRITICAL PATH TO PRODUCTION

**Objective**: Identify minimum, blocking tasks required before public launch  
**Scope**: Infrastructure only (no code changes)  
**Target**: Publicly accessible Mallchain within 1-2 weeks

---

## BLOCKING ISSUES (Must Complete)

### 🔴 BLOCKING #1: SECRETS MANAGEMENT

**Current State**: All secrets hardcoded in .env (HIGH RISK)

**What's Blocked**: Everything — backend won't start in production without this

**Required Actions**:
1. Initialize Vault service (included in docker-compose.prod.yml)
2. Generate new production secrets (128-bit random):
   ```bash
   openssl rand -hex 32  # JWT_SECRET
   openssl rand -hex 32  # SESSION_SECRET
   openssl rand -hex 32  # ADMIN_API_KEY
   openssl rand -hex 32  # PAYMENT_WEBHOOK_SECRET
   ```
3. Create Docker secrets directory:
   ```
   secrets/
   ├── mongo_root_password.txt
   ├── mongo_app_password.txt
   └── grafana_admin_password.txt
   ```
4. Update backend .env to reference Vault/secrets (not hardcoded values)
5. Rotate OPERATOR_MNEMONIC and FAUCET_MNEMONIC to Vault

**Time**: 2-3 hours  
**Owner**: DevOps  
**Unblock**: Allows backend to start in production mode

---

### 🔴 BLOCKING #2: TLS CERTIFICATES

**Current State**: Missing

**What's Blocked**: HTTPS, nginx reverse proxy cannot start

**Required Actions**:
1. Register three domains:
   - `api.mallchain.co.ke` (backend API)
   - `app.mallchain.co.ke` (frontend)
   - `rpc.mallchain.co.ke` (blockchain RPC)

2. Obtain certificates (Let's Encrypt recommended):
   ```bash
   certbot certonly --standalone \
     -d api.mallchain.co.ke \
     -d app.mallchain.co.ke \
     -d rpc.mallchain.co.ke
   ```

3. Deploy to docker volume:
   ```
   /etc/nginx/ssl/
   ├── fullchain.pem
   └── privkey.pem
   ```

4. Configure automatic renewal (certbot timer in docker-compose)

**Time**: 1-2 hours  
**Owner**: DevOps/SRE  
**Unblock**: Allows nginx to serve HTTPS traffic

---

### 🔴 BLOCKING #3: DNS CONFIGURATION

**Current State**: Missing

**What's Blocked**: Users cannot reach any service by domain name

**Required Actions**:
1. Register three domains (or subdomains of existing domain)
2. Create DNS A records (all pointing to nginx server IP):
   ```
   api.mallchain.co.ke     A  <nginx-ip>
   app.mallchain.co.ke     A  <nginx-ip>
   rpc.mallchain.co.ke     A  <nginx-ip>
   ```

3. Wait for DNS propagation (~24-48 hours)
4. Verify: `nslookup api.mallchain.co.ke`

**Time**: 30 minutes setup + 24-48 hours propagation  
**Owner**: DevOps/Network  
**Unblock**: Allows users to access by domain names

---

### 🔴 BLOCKING #4: RPC PORT RESTRICTION

**Current State**: Blockchain RPC exposed to 0.0.0.0:26657

**What's Blocked**: Fixes high-severity network exposure

**Required Actions**:
1. Update docker-compose.prod.yml:
   ```diff
   - --rpc.laddr=tcp://0.0.0.0:26657
   + --rpc.laddr=tcp://127.0.0.1:26657
   ```

2. Verify nginx upstream can still reach it (same container network)
3. Restart blockchain service

**Time**: 15 minutes  
**Owner**: DevOps  
**Risk**: CRITICAL (RPC currently public without auth)

---

### 🟡 BLOCKING #5: BACKEND ENVIRONMENT VARIABLES

**Current State**: Set to localhost values

**What's Blocked**: Backend cannot route API calls correctly

**Required Actions**:
1. Update backend/.env for production:
   ```
   NODE_ENV=production
   FRONTEND_URL=https://app.mallchain.co.ke
   CORS_ORIGINS=https://app.mallchain.co.ke
   CHAIN_ID=mallchain-1  (verify alignment)
   CHAIN_RPC=http://chain-sentry:26657  (internal docker network)
   CHAIN_REST=http://chain-sentry:1317  (internal docker network)
   ```

2. Move all secrets to Vault (see Blocking #1)
3. Restart backend service

**Time**: 30 minutes  
**Owner**: Backend Engineer  
**Unblock**: Backend can connect to blockchain

---

### 🟡 BLOCKING #6: FRONTEND ENVIRONMENT VARIABLES

**Current State**: Set to localhost values

**What's Blocked**: Frontend cannot reach backend API

**Required Actions**:
1. Create frontend/.env.production:
   ```
   VITE_API_BASE_URL=https://api.mallchain.co.ke
   VITE_CHAIN_ID=mallchain-1
   VITE_CHAIN_PREFIX=mall
   VITE_GAS_PRICE=0.01stake
   VITE_NETWORK=mainnet  (or testnet)
   VITE_SESSION_TTL=120
   ```

2. Build frontend: `npm run build`
3. Verify dist/ directory created
4. docker-compose.prod.yml will mount and serve it

**Time**: 20 minutes  
**Owner**: Frontend Engineer  
**Unblock**: Frontend can connect to backend

---

### 🟡 BLOCKING #7: DATABASE INITIALIZATION

**Current State**: Ready to initialize, not yet done

**What's Blocked**: Applications cannot persist data

**Required Actions**:
1. Start MongoDB container (docker-compose.prod.yml)
2. Wait for replica set to initialize
3. Verify: `mongosh --port 27017 --eval 'rs.status().ok'`
4. Start Redis container
5. Initialize Redis cluster:
   ```bash
   redis-cli --cluster create \
     127.0.0.1:6379 127.0.0.1:6380 127.0.0.1:6381
   ```

**Time**: 1-2 hours  
**Owner**: DevOps  
**Unblock**: Data persistence and caching working

---

## NON-BLOCKING (Recommended Before Launch)

### 🟡 Backup Strategy
- MongoDB backups to S3 (daily)
- Redis snapshots to S3 (4-hourly)
- **Effort**: 4-6 hours | **Timeline**: Day 6

### 🟡 Monitoring Configuration
- Grafana dashboards
- Alertmanager notifications
- **Effort**: 2-3 hours | **Timeline**: Day 6-7

### 🟡 Security Hardening
- Penetration testing
- npm audit and dependency updates
- **Effort**: 4-8 hours | **Timeline**: Day 7+

---

## SEQUENTIAL DEPLOYMENT PATH

### Day 1-2: PREPARATION
1. ✅ Server provisioned (Docker, Docker Compose installed)
2. ✅ Three domains registered
3. ✅ New secrets generated (not using dev hardcoded values)

### Day 3: INFRASTRUCTURE
4. ✅ Vault service initialized, secrets stored
5. ✅ TLS certificates obtained from Let's Encrypt
6. ✅ DNS records created (A records for three subdomains)

### Day 4: DEPLOYMENT
7. ✅ docker-compose.prod.yml started
8. ✅ MongoDB replica set initialized
9. ✅ Redis cluster initialized
10. ✅ Nginx reverse proxy started

### Day 5: CONFIGURATION
11. ✅ Backend environment variables set
12. ✅ Frontend built and configured
13. ✅ Backend service restarted
14. ✅ Health check: `GET /api/health` returns all ok

### Day 6: VALIDATION
15. ✅ Test API endpoints (curl)
16. ✅ Test frontend loading (browser)
17. ✅ Wallet creation test
18. ✅ Transaction test (if testnet)

### Day 7: LAUNCH
19. ✅ Monitoring alerts active
20. ✅ Backups running
21. ✅ Public announcement ready
22. ✅ Launch at chosen time

---

## CRITICAL DECISIONS BEFORE STARTING

**Must decide to proceed:**

1. **Testnet or Mainnet?**
   - Testnet: Faucet enabled, testing focus
   - Mainnet: Real validator network, real tokens

2. **Validator Setup**
   - Single validator? (for launch)
   - Multi-validator consensus? (for production)

3. **Hosting Provider**
   - Self-hosted (VPS)?
   - AWS/GCP/Azure?
   - Kubernetes?

4. **Network Configuration**
   - Public blockchain?
   - Permissioned testnet?
   - Private sidechain later?

---

## UNBLOCKING SEQUENCE

**This is the ONLY sequence that works:**

```
Secrets Ready
    ↓ (must complete before next)
TLS Certificates + DNS
    ↓ (must complete before next)
RPC Port Restriction
    ↓ (must complete before next)
Database Initialization
    ↓ (must complete before next)
Backend Environment Setup
    ↓ (must complete before next)
Frontend Build + Deploy
    ↓ (must complete before next)
Health Check Pass
    ↓ (must complete before next)
LAUNCH READY
```

**Each step depends on previous ones.**  
**Cannot parallelize across this critical path.**

---

## VERIFICATION CHECKLIST AT EACH GATE

### Before TLS Certificates
- [ ] Server provisioned and accessible via SSH
- [ ] Docker and Docker Compose v2 installed
- [ ] Vault service can start (test locally)
- [ ] All new production secrets generated

### Before Database Init
- [ ] TLS certificates in /etc/nginx/ssl/
- [ ] DNS records created and propagating
- [ ] nginx can start with TLS config
- [ ] RPC port changed to 127.0.0.1 only

### Before Launch
- [ ] `curl https://api.mallchain.co.ke/api/health` returns ok
- [ ] `curl https://app.mallchain.co.ke/` returns index.html
- [ ] Frontend can reach backend (no CORS errors)
- [ ] Wallet balance queries work
- [ ] Prometheus/Grafana accessible on localhost
- [ ] Backups running (test restore)

---

## RISK & MITIGATION

| Risk | Mitigation |
|------|-----------|
| Secrets leak in git | Use Vault, never commit secrets |
| Certificate expiry | Certbot renewal automated (timer configured) |
| Database corruption | Daily backups, replica set redundancy |
| Redis data loss | AOF + RDB persistence, backups |
| RPC DDoS | Rate limiting (10 req/s) via nginx |
| Frontend misconfiguration | Test all env vars before build |

---

## ROLLBACK PROCEDURE

If launch fails:

1. Keep local development environment running (untouched)
2. docker-compose.prod.yml can be stopped: `docker-compose down`
3. Previous backups available for recovery
4. No data loss if backups taken

---

## SUCCESS CRITERIA

Launch is successful when:

✅ Users can reach https://app.mallchain.co.ke  
✅ Frontend loads without errors  
✅ Wallet authentication works  
✅ Wallet balance displays correctly  
✅ Backend health: `GET /api/health` returns all ok  
✅ Blockchain producing blocks  
✅ Monitoring alerts active  
✅ No critical errors in logs  

---

## TIMELINE SUMMARY

**Absolute Minimum: 7 days**
- Day 1-2: Infrastructure
- Day 3-5: Deployment & Configuration  
- Day 6: Testing
- Day 7: Launch validation

**With Recommended Steps: 10-14 days**
- Includes security hardening, penetration testing, load testing

**Most Likely: 10-12 days** (realistic with typical delays)

---

## FINAL CHECKLIST

Before marking "PRODUCTION READY":

- [ ] All 7 blocking items complete
- [ ] Health checks passing
- [ ] Backup/restore tested
- [ ] Monitoring active
- [ ] Team trained on ops procedures
- [ ] Security review passed
- [ ] Rollback procedure tested
- [ ] Launch communication ready

---

**This is the critical path. Follow it sequentially.**  
**Deviation or parallelization will cause failures.**

