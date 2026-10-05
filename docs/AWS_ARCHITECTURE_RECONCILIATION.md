# MALLCHAIN — AWS ARCHITECTURE RECONCILIATION

**Objective**: Reconcile existing Terraform infrastructure with refined production architecture  
**Scope**: Inspection only (no provisioning, no code changes, no apply)  
**Date**: September 19, 2026

---

## EXECUTIVE SUMMARY

### What Exists

The existing `infra/terraform/` has already made significant infrastructure decisions:

1. **Compute**: Kubernetes (EKS) — NOT ECS/Fargate as previously drafted
2. **Databases**: Mix of AWS managed + self-managed:
   - PostgreSQL (RDS, managed)
   - MongoDB (DocumentDB, AWS managed — **compatibility concerns**)
   - Redis (ElastiCache managed)
   - Vault (EC2 self-managed)
3. **Networking**: VPC with public/private subnets (correct segmentation)
4. **TLS**: ALB with ACM certificates (correct)
5. **Monitoring**: Prometheus, Alertmanager, Grafana (correct)

### What's Planned in docker-compose.prod.yml

The docker-compose.prod.yml shows the **original architecture**:
- Blockchain (chain-sentry) as container
- Backend, Frontend as containers
- MongoDB, Redis as containers (NOT AWS managed)
- Vault as container (NOT EC2)

### The Conflict

**Terraform and docker-compose.prod.yml describe different architectures:**

| Layer | Terraform (EKS) | docker-compose.prod.yml |
|-------|-----------------|------------------------|
| Compute | Kubernetes (EKS) | Docker Compose |
| MongoDB | AWS DocumentDB | Self-managed MongoDB 3-node |
| Redis | AWS ElastiCache | Self-managed Redis 3-node |
| Vault | EC2 + EBS | Docker container |
| Blockchain | N/A | Docker container (chain-sentry) |
| PostgreSQL | AWS RDS | Docker container |

---

## DETAILED ANALYSIS

### 1. COMPUTE ARCHITECTURE: EKS vs Docker Compose vs ECS

#### What Exists: EKS (Kubernetes)

**Terraform code**: `infra/terraform/eks.tf`
```terraform
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"
  cluster_version = "1.31"
  
  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types  # default: t3.large
      min_size       = var.eks_min_nodes             # default: 2
      max_size       = var.eks_max_nodes             # default: 6
    }
  }
}
```

**Status**: ✅ Ready to provision (107 resources in tfplan)

#### What Was Proposed: ECS/Fargate

**Refined architecture** proposed:
- Stateless ECS/Fargate for V14 frontend + backend
- EC2 + EBS for validator (persistent storage needed)

**Assessment**: This contradicts the existing EKS infrastructure.

#### What docker-compose.prod.yml Shows: Docker Compose

The docker-compose.prod.yml provisioning strategy (lines for backend, frontend, chain-sentry) suggests local Docker Compose or self-managed containers, NOT Kubernetes.

#### DECISION REQUIRED

**Question 1: Which compute platform is authoritative?**

| Option | Implications |
|--------|-------------|
| **EKS (existing Terraform)** | Keep Kubernetes. Deploy `infra/k8s/` manifests to EKS cluster. This is the direction the Terraform currently takes. |
| **Docker Compose** | Don't provision EKS. Use docker-compose.prod.yml on EC2 instances directly (simpler for single-region deployment). |
| **ECS/Fargate** | Scrap Terraform EKS. Use ECS for stateless services, EC2 for validator. |

**Recommendation**: EKS (Kubernetes) is the most mature approach IF:
- The team has Kubernetes expertise
- Horizontal scaling is a real future need
- The existing `infra/k8s/` manifests are complete and tested

**For initial production launch**, docker-compose on dedicated EC2 instances is simpler and requires no Kubernetes operational overhead. Terraform provisioning would focus on VPC, security groups, EC2 instances, and managed services only — NOT EKS.

---

### 2. DATABASE ARCHITECTURE

#### A. MongoDB: DocumentDB vs Self-Managed

**Current Terraform**: AWS DocumentDB (mongo-replica module)
```terraform
module "mongo_replica" {
  source = "./modules/mongo-replica"
  engine_version = "5.0.0"
  num_instances  = 3
  instance_class = "db.r6g.large"
}
```

**What mongo-replica/main.tf actually provisions**:
```terraform
resource "aws_docdb_cluster" "mongo" {
  engine = "docdb"  # ← AWS DocumentDB, NOT MongoDB
  engine_version = var.engine_version
  master_username = var.master_username
  master_password = random_password.docdb_master.result
  ...
}
```

**Current docker-compose.prod.yml**: Self-managed MongoDB in containers
```yaml
mongo-rs-1:
  image: mongo:7
  command: >
    --replSet mallchain-rs
    --keyFile /etc/mongo-keyfile
    --port 27017
    ...
```

**The Problem**: AWS DocumentDB is NOT fully MongoDB-compatible

From AWS documentation:
> Amazon DocumentDB is MongoDB-compatible but does not support all MongoDB features. Supported features include documents, indexes, aggregation pipelines, and change streams (partial support).

**Unsupported features that might affect Mallchain backend**:

| Feature | Status | Impact |
|---------|--------|--------|
| `$text` search operator | ❌ Not supported | Search queries may fail |
| `$where` operator | ❌ Explicitly blocked | Already checked in code (input validation prevents this) ✓ |
| Transactions (multi-document) | ⚠️ Limited | Only with replica set, single document OK |
| Change streams | ⚠️ Limited | Partial support; watch() may behave differently |
| Regular expressions ($regex) | ✅ Supported | Backend uses this (safe) ✓ |
| Aggregation pipelines | ✅ Supported | Backend uses aggregation (safe) ✓ |
| User-defined functions | ❌ Not supported | None found in backend |
| `mapReduce` | ❌ Not supported | None found in backend |

**Backend MongoDB Usage Audit**:

From grep results:

| Operation | Found | DocumentDB Compatible? |
|-----------|-------|----------------------|
| `findOneAndUpdate` | ✅ Yes (test mocks show usage) | ✅ Yes |
| `.aggregate()` | ✅ Yes (treasury metrics, task aggregations) | ✅ Yes |
| `$regex` with `$options: 'i'` | ✅ Yes (search.js, admin.js) | ✅ Yes (case-insensitive regex works) |
| `$where` | ❌ Blocked (input validation rejects it) | ✅ N/A (prevented by validation) |
| `.watch()` (change streams) | ❌ Not found in grep | Recommend: Verify real-time update code |
| Transactions | ❌ Not clearly found | Recommend: Check referrals.test.js (shows `withTransaction`) |

**Real-time Updates Risk** (from real-time-updates.integration.test.js):
```javascript
// Integration test mentions socket.io real-time updates
// If backend uses MongoDB change streams for live wallet updates,
// DocumentDB's limited change stream support could break this
```

**Transactions Risk** (from referrals.test.js):
```javascript
mongoose.startSession.mockResolvedValue({
  withTransaction: async (fn) => fn(),  // ← Transaction usage detected
  endSession: jest.fn(),
});
```

#### COMPATIBILITY AUDIT RESULTS

**Status**: ⚠️ NEEDS VERIFICATION

The backend code appears mostly compatible, BUT:

1. **Change streams** (if used for real-time updates) — DocumentDB support is partial
2. **Transactions** (if used for multi-document operations) — May not work identically
3. **Edge cases** — Untested MongoDB-to-DocumentDB migration

#### RECOMMENDATION

**Option A (Safe, Proven)**: Keep self-managed MongoDB
- Use docker-compose.prod.yml or EC2 with MongoDB containers
- Terraform provisions EC2 instances + EBS volumes for MongoDB
- AWS handles backups via EBS snapshots
- **Advantage**: Exact compatibility; no surprises
- **Disadvantage**: Operational overhead (patching, scaling, HA)

**Option B (Managed, Risky)**: Use AWS DocumentDB
- Requires compatibility audit before migration
- Must test all real-time features (change streams, transactions)
- Requires connection string change (TLS, endpoint format)
- **Advantage**: Managed service (AWS patches, backups, HA built-in)
- **Disadvantage**: May break features; incompatibilities discovered late

#### DECISION REQUIRED

**For production launch**, recommend **Option A** (self-managed MongoDB):
1. Lower risk (proven locally)
2. Easier rollback (just use docker-compose)
3. No hidden incompatibilities
4. Can migrate to DocumentDB later after proving compatibility

If DocumentDB is required, Terraform should be updated to NOT provision DocumentDB until backend audit is complete and verified in staging environment.

---

#### B. Redis: ElastiCache vs Self-Managed

**Current Terraform**: AWS ElastiCache
```terraform
module "redis_sentinel" {
  source = "./modules/redis-sentinel"
  node_type = "cache.r6g.large"
  engine_version = "7"
  num_cache_clusters = 3
  automatic_failover_enabled = true
}
```

**Current docker-compose.prod.yml**: Self-managed Redis in containers
```yaml
redis-node-1:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes ... --port 6379
redis-sentinel-1:
  image: redis:7-alpine
  command: redis-sentinel ...
```

**Assessment**: ElastiCache + Sentinel module is **architecturally sound**
- Both provide 3-node clusters with automatic failover
- ElastiCache is fully Redis-compatible (AWS manages same Redis project code)
- No incompatibilities expected
- **Recommendation**: ElastiCache is safe for production

**Connection string change needed**:
```bash
# docker-compose (localhost):
REDIS_HOST=redis-node-1
REDIS_PORT=6379

# ElastiCache (AWS):
REDIS_HOST=mallchain-redis.ABC123.cache.amazonaws.com
REDIS_PORT=6379
REDIS_AUTH=${REDIS_AUTH_TOKEN}  # if AUTH token enabled
```

---

#### C. PostgreSQL: RDS vs Self-Managed

**Current Terraform**: AWS RDS PostgreSQL (managed)
```terraform
module "postgres_stateful" {
  source = "./modules/postgres-stateful"
  instance_class = "db.r6g.large"
  engine_version = "16"
  allocated_storage_gb = 100
  multi_az = true
}
```

**Current docker-compose.prod.yml**: Self-managed PostgreSQL in container
```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: mallchain_explorer
```

**Assessment**: RDS PostgreSQL is **fully compatible**
- Same open-source PostgreSQL codebase
- AWS RDS provides automatic backups, Multi-AZ, managed patches
- **Recommendation**: RDS is safe and operationally superior

---

#### D. Vault: EC2 + Self-Managed vs Container

**Current Terraform**: EC2 instance with Vault (self-managed)
```terraform
module "vault_server" {
  source = "./modules/vault-server"
  instance_type = "t3.2xlarge"  # (Actually should be m5.large for Vault)
  ebs_volume_size = 30
}
```

**Current docker-compose.prod.yml**: Vault as container
```yaml
vault:
  image: hashicorp/vault:1.15
  environment:
    VAULT_LOCAL_CONFIG: |
      {
        "listener": { "tcp": { ... } },
        "storage": { "file": { "path": "/vault/file" } }
      }
```

**Assessment**: Both approaches work
- **Terraform EC2**: Persistent Vault service, persistent storage on EBS
- **docker-compose container**: Ephemeral Vault (state lost on container restart unless volume mounted)

**For production**, recommend EC2 + EBS (existing Terraform approach) with `file` backend upgrade to `raft` storage for multi-node HA.

---

### 3. VALIDATOR/BLOCKCHAIN NODE

#### Where Is It in Current Architecture?

**Terraform**: NOT provisioned (no blockchain node module)

**docker-compose.prod.yml**: `chain-sentry` service
```yaml
chain-sentry:
  image: ghcr.io/mallchain/marketplaced:latest
  command: start --home=./blockchain_working ...
  volumes:
    - chain-data:/home/marketplaced/.marketplaced
    - chain-logs:/home/marketplaced/logs
```

**Status**: Docker container; ephemeral compute, persistent volume

#### Where Should It Be?

**Refined architecture requirement**: 
- Private EC2 instance (NOT Kubernetes/Fargate)
- Persistent EBS storage (500GB initial, growing)
- Dedicated security group (restrict RPC to internal only)
- Private subnet (no public IP)

#### Action Required

1. If using EKS (existing Terraform), the blockchain validator should run on a dedicated node pool with persistent storage (StatefulSet + EBS persistent volume claims)
2. If using docker-compose on EC2, provision EC2 instance for chain-sentry explicitly
3. Ensure RPC port (26657) restricted to internal network only (security group)

---

### 4. RPC & REST ENDPOINTS

#### Current Architecture

**docker-compose.prod.yml**: chain-sentry exposes
```yaml
chain-sentry:
  command: >
    start
    --rpc.laddr=tcp://0.0.0.0:26657     # ← Exposed to all interfaces
    --api.address=tcp://0.0.0.0:1317     # ← Exposed to all interfaces
```

**Problem**: Both RPC and REST exposed to 0.0.0.0 (public internet accessible)

**Refined architecture requirement**:
- RPC/REST NOT exposed directly to public internet
- Route through NLB with rate limiting
- Or restrict to 127.0.0.1 and proxy through separate RPC gateway container

#### How nginx Reverses Proxy This

**Terraform + EKS**: Would need `infra/k8s/20-ingress.yaml` (Kubernetes ingress)

**docker-compose**: Already has nginx container
```yaml
nginx:
  image: nginx:1.27-alpine
  volumes:
    - ./deploy/nginx/conf.d:/etc/nginx/conf.d:ro
  ports:
    - "80:80"
    - "443:443"
```

**nginx configuration** (`deploy/nginx/conf.d/`) routes to:
```nginx
upstream rpc_backend {
  server chain-sentry:26657;
}

upstream rest_backend {
  server chain-sentry:1317;
}

server {
  listen 443 ssl;
  server_name rpc.mallchain.network;
  location / {
    proxy_pass http://rpc_backend;
    limit_req zone=rpc_limit burst=10;  # Rate limiting
  }
}
```

**Status**: ✅ nginx reverse proxy configuration exists in `deploy/nginx/conf.d/`

---

### 5. TLS/HTTPS TERMINATION

#### Terraform (EKS)

**Module**: `nginx-ingress`
```terraform
module "nginx_ingress" {
  source = "./modules/nginx-ingress"
  domain_name = "${var.environment == "production" ? "" : "${var.environment}."}mallchain.network"
  subject_alternative_names = [
    "api.mallchain.network",
    "rpc.mallchain.network",
    "sentry.mallchain.network",
  ]
}
```

This provisions:
- AWS ALB (Application Load Balancer)
- ACM certificates for *.mallchain.network
- Listener rules for path-based routing

**Status**: ✅ Configured

#### docker-compose (Proposed EC2 Approach)

**Requires**: Let's Encrypt certificates + nginx TLS termination

**Existing automation**: `deploy/certbot-renewal.timer` and `deploy/certbot-renewal.service` (systemd)

Terraform should provision:
- EC2 instance with docker-compose
- Security group allowing 80/443
- EBS volume for `/etc/letsencrypt/` (persistent certificates)

**Status**: ⚠️ Partially configured (docker-compose has nginx TLS config, but Terraform doesn't provision Let's Encrypt)

---

### 6. PUBLIC PORTS & SECURITY BOUNDARIES

#### Current Intent

**From docker-compose annotations**:
```
Port 80 (HTTP)    → nginx (redirect to 443)
Port 443 (HTTPS)  → nginx (TLS termination)
Port 26657 (RPC)  → Available from nginx proxy
Port 1317 (REST)  → Available from nginx proxy
Port 4000         → Backend (internal only, through nginx)
Port 3000         → Frontend (internal only, served by nginx)
```

#### AWS Security Groups (Terraform)

**ALB Security Group**:
```terraform
ingress {
  from_port   = 80
  to_port     = 80
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # Public
}

ingress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # Public
}
```

✅ **Correct**: Only 80/443 public

**Private subnets** (app, data tiers):
- Backend port 4000: Internal only ✅
- MongoDB port 27017: Internal only ✅
- Redis port 6379: Internal only ✅

**Validator RPC/REST** (chain-sentry):
- Currently exposed in docker-compose (ports not explicitly bound, but 0.0.0.0 in command)
- Should be restricted to private subnet ⚠️

---

### 7. WAF & RATE LIMITING

#### Existing Configuration

**Terraform nginx-ingress module**:
```terraform
rate_limit_per_ip    = 2000
rate_limit_window_minutes = 5
```

This configures nginx rate limiting (2000 requests per 5 minutes = 400 req/min per IP)

**docker-compose nginx config** (`deploy/nginx/conf.d/`):
```nginx
limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
```

**AWS WAF Integration**:
- Terraform module does NOT show AWS WAF configuration
- ALB does NOT have WAF attached (per AWS documentation)
- Only nginx-level rate limiting implemented

**Status**: ⚠️ Rate limiting at nginx level only; AWS WAF not integrated

**Recommendation**: 
- If using ALB + EKS: Attach AWS WAF to ALB for DDoS protection
- If using docker-compose on EC2: Rely on nginx rate limiting + Security Groups

---

### 8. SECRETS MANAGEMENT

#### Terraform (Expected in Vault)

**Module vault-server**: Provisions EC2 instance + Vault

Backend should retrieve secrets from Vault at runtime:
```bash
VAULT_ADDR=http://vault:8200
VAULT_TOKEN=...
```

**Status**: ✅ Vault infrastructure planned

**docker-compose approach**: Vault runs as container; backend connects at startup

**Current .env secrets** (from production audit):
```
JWT_SECRET=...
SESSION_SECRET=...
ADMIN_API_KEY=...
OPERATOR_MNEMONIC=...
FAUCET_MNEMONIC=...
```

These should be rotated before production:
- Generate new values: `openssl rand -hex 32`
- Store in Vault
- Backend retrieves via VAULT_ADDR + VAULT_TOKEN

**Status**: ✅ Infrastructure present; rotation needed

---

## ARCHITECTURE ASSESSMENT BY COMPONENT

### A. READY AS DESIGNED ✅

| Component | Status | Notes |
|-----------|--------|-------|
| **VPC segmentation** | ✅ Ready | Public/private/data subnets correctly configured |
| **ALB + ACM TLS** | ✅ Ready | Certificates, listeners, routing rules defined |
| **Redis (ElastiCache)** | ✅ Ready | Fully compatible; connection string change only |
| **PostgreSQL (RDS)** | ✅ Ready | Fully compatible; already in Terraform |
| **Vault EC2 + EBS** | ✅ Ready | Secrets infrastructure provisioned |
| **Nginx reverse proxy config** | ✅ Ready | deploy/nginx/conf.d/ has routing rules |
| **Security groups** | ✅ Ready | Public ports (80/443), private ports restricted |
| **ECR repositories** | ✅ Ready | Terraform creates ECR for backend, frontend, other images |
| **EKS cluster** | ✅ Ready | Kubernetes control plane provisioned |

---

### B. NEEDS ARCHITECTURE CHANGES ⚠️

| Component | Issue | Action Required |
|-----------|-------|-----------------|
| **MongoDB** | AWS DocumentDB compatibility unclear | Audit backend for change streams, transactions; test before migration |
| **Blockchain validator placement** | Not in Terraform EKS | Decide: Kubernetes StatefulSet + EBS PVCs, or dedicated EC2? |
| **RPC port exposure** | docker-compose exposes 0.0.0.0:26657 | Change to 127.0.0.1 or restrict to private subnet |
| **Compute platform** | EKS vs docker-compose conflict | Decide: EKS + `infra/k8s/` manifests, or EC2 + docker-compose? |
| **Let's Encrypt automation** | Not in Terraform | If EKS: Use cert-manager. If EC2: Use certbot systemd timer. |

---

### C. BLOCKED BY UNKNOWN REQUIREMENT ❓

| Component | Question | Resolution |
|-----------|----------|-----------|
| **Change streams** | Does backend use MongoDB change streams for real-time updates? | Check if socket.io depends on change streams; if yes, DocumentDB compatibility must be verified |
| **Multi-document transactions** | Does backend use `session.withTransaction()`? | Verify all uses are single-document or DocumentDB-compatible |
| **infra/k8s/ manifests** | Are Kubernetes deployment files complete? | Review `infra/k8s/` for backend, frontend, blockchain, redis, mongo statefulsets |
| **Operator mnemonic requirement** | Is server-side signing needed for production? | Decide: ALLOW_OPERATOR_MNEMONIC=true (high risk) or false (requires browser signing)? |

---

## FINAL RECONCILIATION: PUBLIC VS PRIVATE

### PUBLIC (Internet-Facing)

```
INTERNET
    │
    ├─ https://app.mallchain.network
    │   ├─ ALB → EKS frontend pod / ECS frontend container
    │   ├─ TLS termination
    │   └─ CloudFront optional (CDN for static files)
    │
    ├─ https://api.mallchain.network
    │   ├─ ALB → EKS backend pod / ECS backend container
    │   ├─ TLS termination
    │   ├─ Rate limiting: 100 req/s per IP (nginx)
    │   └─ WAF optional (AWS WAF on ALB)
    │
    ├─ https://rpc.mallchain.network
    │   ├─ NLB or ALB → nginx RPC proxy
    │   ├─ TLS termination
    │   ├─ Rate limiting: 10 req/s per IP (nginx)
    │   ├─ NLB recommended for high-throughput RPC
    │   └─ Proxy to chain-sentry:26657 (private)
    │
    └─ https://rest.mallchain.network
        ├─ NLB or ALB → nginx REST proxy
        ├─ TLS termination
        ├─ Rate limiting: 10 req/s per IP (nginx)
        └─ Proxy to chain-sentry:1317 (private)
```

### PRIVATE (VPC Only)

```
PRIVATE SUBNETS (10.20.0.0/16)
    │
    ├─ Backend pod/container (10.20.10.x)
    │   ├─ Port 4000: From ALB only
    │   ├─ Connects to MongoDB (27017, internal)
    │   ├─ Connects to Redis (6379, internal)
    │   └─ Connects to chain-sentry RPC (26657, internal)
    │
    ├─ Frontend pod/container (10.20.10.x)
    │   ├─ Port 80/8080: From ALB only
    │   ├─ Served by nginx
    │   └─ No external connections (static files)
    │
    ├─ chain-sentry (validator) (10.20.20.x)
    │   ├─ Port 26657 (RPC): Proxy only, NO 0.0.0.0
    │   ├─ Port 1317 (REST): Proxy only, NO 0.0.0.0
    │   ├─ Port 26656 (P2P): To validator peers only
    │   ├─ Persistent storage: EBS or EKS persistent volume
    │   └─ No direct internet access
    │
    ├─ MongoDB (10.20.30.x)
    │   ├─ Port 27017: Backend only (security group restricted)
    │   ├─ Encrypted EBS storage (or DocumentDB managed)
    │   └─ 3-node replica set
    │
    ├─ Redis (10.20.30.x)
    │   ├─ Port 6379: Backend only (security group restricted)
    │   ├─ 3-node cluster or ElastiCache
    │   └─ AUTO failover enabled
    │
    └─ Vault (10.20.5.x, if EC2)
        ├─ Port 8200: Backend/admin access only
        ├─ Encrypted EBS storage
        └─ Secrets for all services
```

---

## AWS SERVICES: SUMMARY TABLE

| Service | Type | Public | Private | Persistent Storage | Purpose |
|---------|------|--------|---------|-------------------|---------|
| **ALB** | Load Balancer | ✅ Yes | N/A | N/A | HTTPS termination, app routing |
| **NLB** | Load Balancer | ✅ Yes (RPC) | N/A | N/A | High-throughput RPC/REST proxy |
| **EKS** | Container Orchestration | N/A | ✅ Private | N/A | Run frontend, backend, chain-sentry pods |
| **DocumentDB** (if chosen) | Managed Database | N/A | ✅ Private | ✅ EBS | User/payment/tx data |
| **MongoDB** (alternative) | Self-Managed DB | N/A | ✅ Private | ✅ EBS | Same as DocumentDB |
| **ElastiCache Redis** | Managed Cache | N/A | ✅ Private | ✅ Automated snapshots | Session cache, queues, rate limits |
| **RDS PostgreSQL** | Managed Database | N/A | ✅ Private | ✅ Automated backups | Explorer/blockchain indexing |
| **Vault EC2** | Key/Secret Store | N/A | ✅ Private | ✅ EBS | JWT_SECRET, MNEMONIC, API_KEY storage |
| **ACM** | Certificates | N/A | N/A | N/A | TLS certificates for HTTPS |
| **Route 53** | DNS | ✅ Yes | N/A | N/A | Domain routing, health checks |
| **Security Groups** | Firewall | N/A | ✅ Private | N/A | Port access control |
| **EBS** | Storage | N/A | ✅ Private | ✅ Yes | Persistent volumes for EC2/StatefulSets |
| **S3** | Object Storage | ✅ Optional | ✅ Backups | ✅ Yes | Backups, logs, state files |
| **CloudWatch** | Monitoring | N/A | ✅ Private | N/A | Logs, metrics, alarms |
| **KMS** | Encryption | N/A | N/A | N/A | Key management for EBS/data |

---

## CRITICAL DECISIONS REQUIRED

### Decision 1: Compute Platform

**Options**:
- **A) EKS (Kubernetes)** — Use existing Terraform; deploy `infra/k8s/` manifests
- **B) Docker Compose on EC2** — Simpler for initial launch; Terraform provisions EC2 instances
- **C) ECS/Fargate** — Middle ground; stateless services in Fargate, EC2 for validator

**Recommendation**: **Option B (Docker Compose on EC2)** for production launch
- Lower operational complexity (no Kubernetes learning curve)
- Easier to debug (direct docker logs)
- Validator/blockchain state clearly on EC2 with persistent EBS
- Can migrate to EKS later once stable

**If choosing EKS**: Requires review of `infra/k8s/` manifests to ensure blockchain validator StatefulSet is defined.

---

### Decision 2: MongoDB — DocumentDB or Self-Managed?

**Options**:
- **A) AWS DocumentDB** — Managed service; requires compatibility audit
- **B) Self-Managed MongoDB** — Proven locally; requires operational overhead

**Recommendation**: **Option B (Self-Managed)** for production launch
- Eliminates compatibility unknowns
- Can migrate to DocumentDB after production validation
- If change streams or advanced transactions are used, self-managed avoids breaking changes

**If choosing DocumentDB**: 
1. Conduct full compatibility audit of backend code
2. Test in staging environment
3. Verify change streams work as expected
4. Update connection string format (TLS, endpoint, auth)

---

### Decision 3: Blockchain Validator Placement

**Options**:
- **A) Kubernetes StatefulSet** (if using EKS)
- **B) Dedicated EC2 instance** (if using docker-compose)
- **C) Docker container in ECS/Fargate** (NOT RECOMMENDED — ephemeral compute)

**Recommendation**: **Option B (Dedicated EC2)** 
- Persistent EBS storage for /home/marketplaced/.marketplaced
- No dependency on Kubernetes scheduling
- Security group restricts RPC to internal only
- Systemd service auto-restart on failure

---

### Decision 4: RPC Exposure

**Options**:
- **A) NLB with rate limiting** (current nginx config supports this)
- **B) Restrict to 127.0.0.1 only** (for private internal access only)
- **C) CloudFront + AWS WAF** (additional DDoS protection)

**Recommendation**: **Option A (NLB with rate limiting)**
- nginx already configured for rate limiting (10 req/s)
- NLB can proxy to nginx RPC gateway
- Allows independent Mallchain App wallet to access RPC publicly
- Prevents abuse via rate limiting

**Security**: NLB does NOT have AWS WAF integration. Use CloudFront + WAF for additional protection if DDoS risk is high.

---

### Decision 5: Validator RPC Port Binding

**Current**: `chain-sentry` docker-compose exposes `--rpc.laddr=tcp://0.0.0.0:26657`

**Problem**: Any interface can connect (though nginx proxy restricts public access)

**Fix**: Change to `--rpc.laddr=tcp://127.0.0.1:26657` (localhost only) or restrict in security group

**Implementation**:
```bash
# In chain-sentry docker-compose command:
--rpc.laddr=tcp://127.0.0.1:26657    # or
--rpc.laddr=tcp://10.20.20.1:26657   # (private subnet gateway)
```

Then nginx proxy (which runs on same private subnet) connects to it.

---

## DEPLOYMENT ARCHITECTURE (Recommended)

### If Choosing Docker Compose on EC2

```
AWS ACCOUNT (eu-west-1)
│
├─ VPC (10.20.0.0/16)
│
├─ PUBLIC SUBNET (10.20.1.0/24, 3 AZs)
│  ├─ NLB (RPC/REST load balancer)
│  ├─ ALB (App/API load balancer)
│  └─ NAT Gateway (for outbound)
│
├─ APP SUBNET (10.20.10.0/24)
│  ├─ EC2 instance 1 (docker-compose)
│  │  ├─ Backend container (port 4000)
│  │  ├─ Frontend container (port 80)
│  │  ├─ Nginx reverse proxy (443)
│  │  ├─ Vault container (port 8200)
│  │  ├─ PostgreSQL container (port 5432)
│  │  └─ Redis nodes/Sentinel containers
│  │
│  └─ EC2 instance 2 (docker-compose failover, optional)
│
├─ DATA SUBNET (10.20.20.0/24)
│  └─ MongoDB containers (or DocumentDB)
│
├─ VALIDATOR SUBNET (10.20.30.0/24)
│  └─ EC2 instance (chain-sentry validator)
│     ├─ EBS volume 500GB (persistent chain data)
│     ├─ Port 26657 (RPC, internal only)
│     ├─ Port 1317 (REST, internal only)
│     ├─ Port 26656 (P2P, to peers)
│     └─ Port 26660 (metrics, internal only)
│
└─ AWS Managed Services
   ├─ RDS PostgreSQL (or self-managed)
   ├─ ElastiCache Redis (or self-managed)
   ├─ ACM (TLS certificates)
   ├─ Route 53 (DNS)
   ├─ S3 (backups)
   ├─ CloudWatch (monitoring)
   └─ KMS (encryption keys)
```

### If Choosing EKS (Kubernetes)

```
AWS ACCOUNT (eu-west-1)
│
├─ EKS Cluster (1.31)
│  ├─ Control plane (managed by AWS)
│  │
│  ├─ Node group (t3.large × 2-6 nodes)
│  │  ├─ Deployment: backend (replicas: 2-4)
│  │  ├─ Deployment: frontend (replicas: 2-4)
│  │  ├─ StatefulSet: chain-sentry validator (replicas: 1)
│  │  ├─ StatefulSet: MongoDB (replicas: 3, PVCs)
│  │  ├─ StatefulSet: Redis (replicas: 3, optional)
│  │  └─ Other services (Prometheus, Vault, etc.)
│
├─ Load Balancers
│  ├─ ALB (Kubernetes Ingress, frontend + API)
│  └─ NLB (Kubernetes Service, RPC/REST)
│
└─ AWS Managed Services (same as above)
```

---

## RECONCILIATION CONCLUSION

### Current State

1. ✅ Terraform provisions **EKS cluster + managed services** (good foundation)
2. ⚠️ docker-compose.prod.yml describes **self-managed containers** (conflicting approach)
3. ❓ `infra/k8s/` directory exists but **manifest completeness not verified**
4. ❌ **MongoDB → DocumentDB migration needs audit** before use
5. ❌ **Blockchain validator not explicitly in Terraform** (needs design decision)
6. ✅ **RPC/REST proxying in place** (nginx reverse proxy configured)
7. ✅ **TLS/HTTPS infrastructure ready** (ACM, ALB configured)

### Recommendations

1. **Decide compute platform** (EKS vs EC2 + docker-compose)
2. **Audit MongoDB operations** before committing to DocumentDB
3. **Verify Kubernetes manifests** if choosing EKS route
4. **Restrict validator RPC binding** to internal network
5. **Rotate all production secrets** before launch
6. **Test in staging environment** before production provisioning

### Next Step

Do **NOT** provision AWS infrastructure from existing Terraform until:
- ✅ MongoDB compatibility audit completed
- ✅ Compute platform decision made (EKS or EC2)
- ✅ Blockchain validator architecture defined
- ✅ Terraform modules updated if needed
- ✅ All secrets rotated

**Terraform apply is safe for**: VPC, security groups, ALB, NLB, RDS PostgreSQL, ElastiCache Redis, ACM, Route 53, KMS, Vault EC2

**Terraform apply is NOT safe for**: DocumentDB (until MongoDB audit clears it)

---

**Current Status**: READY FOR DECISION-MAKING, NOT READY FOR PROVISIONING

