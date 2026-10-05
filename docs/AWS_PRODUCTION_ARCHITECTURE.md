# MALLCHAIN — AWS PRODUCTION ARCHITECTURE DESIGN

**Objective**: Design production deployment on AWS  
**Scope**: Architecture planning only (no resource provisioning, no code changes)  
**Target Users**: V14 web OS + independent Mallchain App wallet  
**Date**: September 19, 2026

---

## EXECUTIVE SUMMARY

This architecture separates public-facing services (RPC, REST, API, frontend) from private blockchain infrastructure (validator node, databases). The validator/node runs in a private subnet and is never exposed directly to the internet.

**Key principle**: Users access Mallchain through reverse proxies and gateways, not directly to the validator node.

```
┌─ PUBLIC INTERNET ─────────────────────────────────────────────┐
│                                                                 │
│  ┌── HTTPS/TLS (AWS Certificate Manager) ──────────────────┐  │
│  │                                                           │  │
│  ├─ https://app.mallchain.network   → V14 Frontend          │  │
│  │                                                           │  │
│  ├─ https://api.mallchain.network   → Backend API           │  │
│  │                                                           │  │
│  ├─ https://rpc.mallchain.network   → RPC Gateway           │  │
│  │                                                           │  │
│  └─ https://rest.mallchain.network  → REST Gateway          │  │
│                                                               │  │
└───────────────────────────────────────────────────────────────┘
         ↓ ALB/NLB routing within VPC
┌─ PRIVATE AWS VPC (10.0.0.0/16) ────────────────────────────────┐
│                                                                  │
│  ┌─ PUBLIC SUBNET (10.0.1.0/24) ──────────────────────────────┐│
│  │                                                             ││
│  │  ┌─ ALB (Application Load Balancer) ──────────────────────┐││
│  │  │  • HTTPS termination (ACM certificates)               │││
│  │  │  • Path-based routing (/api → backend, / → frontend) │││
│  │  │  • Health check configuration                         │││
│  │  │  • WAF attached (optional: CloudFront)                │││
│  │  └────────────────────────────────────────────────────────┘││
│  │                    ↓                                        ││
│  │  ┌─ NLB (Network Load Balancer) ─────────────────────────┐││
│  │  │  • High-throughput RPC/REST traffic                   │││
│  │  │  • TCP proxy to private RPC gateway                   │││
│  │  │  • Connection limit: configurable                     │││
│  │  └────────────────────────────────────────────────────────┘││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│           ↓                          ↓                          │
│  ┌─ PRIVATE SUBNET (10.0.2.0/24) ─────────────────────────────┐│
│  │                                                             ││
│  │  ┌─ APP TIER ────────────────────────────────────────────┐││
│  │  │                                                        │││
│  │  │  ┌─ ECS/Fargate Cluster ──────────────────────────┐  │││
│  │  │  │  • Backend container (4 CPU, 8GB RAM)          │  │││
│  │  │  │  • Frontend container (nginx, 2 CPU, 2GB RAM)  │  │││
│  │  │  │  • RPC gateway container (2 CPU, 4GB RAM)      │  │││
│  │  │  │  • Auto-scaling: 2-4 instances per service    │  │││
│  │  │  │  • Secrets: AWS Secrets Manager injected       │  │││
│  │  │  └────────────────────────────────────────────────┘  │││
│  │  │                                                        │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│           ↓                          ↓                          │
│  ┌─ DATA TIER (10.0.3.0/24) ────────────────────────────────┐  │
│  │                                                           │  │
│  │  ┌─ DocumentDB (MongoDB) ───────────────────────────────┐ │  │
│  │  │  • 3-node cluster (Multi-AZ: us-east-1a/b/c)        │ │  │
│  │  │  • Replication lag: <1ms                             │ │  │
│  │  │  • Backup: Automated daily + manual snapshots        │ │  │
│  │  │  • Encryption: KMS (at-rest + in-transit)           │ │  │
│  │  │  • Security group: only app tier access             │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  │  ┌─ ElastiCache (Redis) ────────────────────────────────┐ │  │
│  │  │  • 3-node cluster (Multi-AZ enabled)                │ │  │
│  │  │  • Replication mode: automatic failover             │ │  │
│  │  │  • Backup: Automated daily snapshots to S3           │ │  │
│  │  │  • Encryption: KMS (at-rest + in-transit)           │ │  │
│  │  │  • AUTH token: 32-char random (Secrets Manager)     │ │  │
│  │  │  • Security group: only app tier access             │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  └─────────────────────────────────────────────────────────────┘ │
│           ↓                                                       │
│  ┌─ VALIDATOR TIER (10.0.4.0/24) ────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌─ EC2 Instance (Mallchain Validator) ──────────────────┐│  │
│  │  │  • Instance type: t3.2xlarge (8 CPU, 32GB RAM)       ││  │
│  │  │  • Root volume: gp3 (500GB, encrypted)               ││  │
│  │  │  • RPC port 26657: internal only (10.0.0.0/16)       ││  │
│  │  │  • REST port 1317: internal only (10.0.0.0/16)       ││  │
│  │  │  • P2P port 26656: to validator peers only           ││  │
│  │  │  • Monitoring: CloudWatch agent + custom metrics     ││  │
│  │  │  • Backup: EBS snapshots (daily)                     ││  │
│  │  │  • Secrets: AWS Secrets Manager (mnemonic, keys)     ││  │
│  │  └────────────────────────────────────────────────────────┘│  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         ↑
    VPC Endpoints (if needed):
    - S3 (backups, logs)
    - ECR (private container registry)
    - CloudWatch (logs/metrics)
    - Secrets Manager (for secret access)
```

---

## 1. AWS SERVICES BREAKDOWN

### A. NETWORKING & LOAD BALANCING

#### VPC Architecture
- **VPC**: 10.0.0.0/16 (us-east-1 multi-AZ)
- **Public Subnets** (10.0.1.0/24, 10.0.5.0/24):
  - NAT Gateway (for app tier outbound)
  - Load balancers (ALB, NLB)
  - No EC2 instances (stateless)

- **Private Subnets**:
  - 10.0.2.0/24 (App tier: ECS/Fargate)
  - 10.0.3.0/24 (Data tier: DocumentDB, ElastiCache)
  - 10.0.4.0/24 (Validator tier: EC2)

#### Load Balancers

**ALB (Application Load Balancer)** — HTTPS frontend
```
Port 80  → redirect to 443
Port 443 → ACM Certificate (mallchain.network + *.mallchain.network)

Routing rules:
  Host: app.mallchain.network        → ECS Frontend (port 80)
  Host: api.mallchain.network        → ECS Backend (port 4000)
  Path: /metrics                     → DENY (internal only)
  
Health checks:
  Backend:  GET /api/health          (200 OK)
  Frontend: GET /index.html          (200 OK)
```

**NLB (Network Load Balancer)** — High-throughput RPC/REST
```
Port 26657 (RPC) → NLB → ECS RPC Gateway (1000 concurrent connections max)
Port 1317 (REST) → NLB → ECS RPC Gateway (same container)

Connection limits:
  - New connections: 1000/sec
  - Total active: 50,000
  - Timeout: 300 seconds

TLS termination: No (TCP proxy only, let container handle encryption if needed)
```

#### Internet Gateway & NAT
- **IGW**: Attached to VPC for public subnet outbound
- **NAT Gateway**: In public subnet for private subnet outbound (S3, CloudWatch)
- **Route 53**: DNS (A records + health checks for failover)

---

### B. COMPUTE

#### ECS on Fargate (Containerized Services)

**Task 1: Backend**
```yaml
Name: mallchain-backend
Image: ECR:mallchain-backend:latest
Port: 4000
CPU: 4
Memory: 8GB
Replicas: 2-4 (auto-scaling)
Placement: Private subnet (10.0.2.0/24)

Environment Variables:
  NODE_ENV: production
  CHAIN_ID: mallchain-1
  CHAIN_PREFIX: mall
  CHAIN_RPC: http://validator-instance:26657 (internal)
  CHAIN_REST: http://validator-instance:1317 (internal)
  MONGO_URI: mongodb://documentdb-cluster:27017/mallchain
  REDIS_HOST: elasticache-cluster.cache.amazonaws.com
  REDIS_PORT: 6379
  CORS_ORIGINS: https://app.mallchain.network
  FRONTEND_URL: https://app.mallchain.network
  ADMIN_API_KEY: (from Secrets Manager)
  JWT_SECRET: (from Secrets Manager)
  SESSION_SECRET: (from Secrets Manager)
  FAUCET_ENABLED: false (for mainnet)

Secrets (AWS Secrets Manager):
  JWT_SECRET
  SESSION_SECRET
  ADMIN_API_KEY
  PAYMENT_WEBHOOK_SECRET
  FIELD_ENCRYPTION_KEY
  FIELD_BLIND_INDEX_KEY
  OPERATOR_MNEMONIC (if needed)
  FAUCET_MNEMONIC (if needed, disabled for mainnet)

Logs: CloudWatch (JSON format, 30-day retention)
Health Check: GET /api/health (5 sec interval, 3 failures = restart)
```

**Task 2: V14 Frontend**
```yaml
Name: mallchain-frontend
Image: ECR:mallchain-frontend:latest
Port: 80 (nginx serving static files)
CPU: 2
Memory: 2GB
Replicas: 2-4 (auto-scaling)
Placement: Private subnet (10.0.2.0/24)

Build arguments (baked into image):
  VITE_API_BASE_URL: https://api.mallchain.network
  VITE_CHAIN_ID: mallchain-1
  VITE_CHAIN_PREFIX: mall
  VITE_GAS_PRICE: 0.01stake
  VITE_NETWORK: mainnet (or testnet)
  VITE_SESSION_TTL: 120

Nginx config:
  • Serve static files from dist/
  • Cache headers: max-age=31536000 for .js/.css (hash-busted)
  • Cache headers: no-cache for index.html
  • Security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff

Logs: CloudWatch (30-day retention)
Health Check: GET /index.html (5 sec interval)
```

**Task 3: RPC/REST Gateway**
```yaml
Name: mallchain-rpc-gateway
Image: ECR:mallchain-rpc-gateway:latest (nginx reverse proxy)
Port: 26657 (RPC), 1317 (REST)
CPU: 2
Memory: 4GB
Replicas: 2-4 (auto-scaling)
Placement: Private subnet (10.0.2.0/24)

Configuration:
  Upstream (internal): validator-instance:26657, validator-instance:1317
  Rate limiting: 10 req/s per IP (nginx limit_req_zone)
  Connection pool: 100 connections to upstream
  Timeout: 30 seconds
  Max body size: 1MB

Logs: CloudWatch (request logs, 30-day retention)
Health Check: GET /health or RPC method (5 sec interval)
```

#### EC2 Instance (Mallchain Validator)

```yaml
Name: mallchain-validator
Instance Type: t3.2xlarge (8 vCPU, 32 GB RAM, $0.33/hr)
AMI: Ubuntu 22.04 LTS (latest)
Placement: Private subnet (10.0.4.0/24)
Security Group: Validator-SG (see below)

Storage:
  Root volume: gp3 (500GB, encrypted with KMS, provisioned IOPS 3000, throughput 125 MB/s)
  EBS snapshot schedule: Daily (7-day retention)

Networking:
  Private IP: 10.0.4.x (within security group only)
  Public IP: None (no internet exposure)
  ENI: Standard (no enhanced networking needed)

Software:
  OS: Ubuntu 22.04
  Mallchain binary: /usr/local/bin/mallchaind
  Systemd service: mallchain-validator.service (auto-restart on failure)
  Monitoring agent: CloudWatch agent + custom metrics

Ports (internal only):
  26656 (P2P): To other validator peers (security group scoped)
  26657 (RPC): To RPC gateway (10.0.2.0/24 only)
  1317 (REST): To RPC gateway (10.0.2.0/24 only)
  26660 (metrics): To Prometheus collector (10.0.0.0/16 only)

Secrets (AWS Secrets Manager):
  VALIDATOR_MNEMONIC
  VALIDATOR_KEYS

Backups:
  EBS snapshots: Daily at 2 AM UTC (7-day rotation)
  State export: Weekly to S3 (disaster recovery)

Monitoring:
  CloudWatch metrics: CPU, memory, disk, network I/O
  Custom metrics: Block height, validator status, consensus rounds
  Alarms: High CPU (>80%), low disk space (<10%), validator offline
```

---

### C. STORAGE & PERSISTENCE

#### Amazon DocumentDB (MongoDB)

```yaml
Cluster Name: mallchain-documentdb
Engine: MongoDB 5.0 (AWS managed)
Instances: 3 (Multi-AZ: us-east-1a, 1b, 1c)
Instance Type: db.r6g.xlarge (4 vCPU, 32 GB RAM, $2.5/hr each)
Placement: Private subnet (10.0.3.0/24)
Security Group: DocumentDB-SG (only app tier)

Replication:
  Mode: Primary + 2 read replicas
  Sync replication: Yes (wait for all replicas)
  Backup retention: 7 days (automatic)

Encryption:
  At-rest: KMS (aws/rds)
  In-transit: TLS 1.2 (enforced)
  Backups: Encrypted with KMS

Authentication:
  Master user: admin (strong password in Secrets Manager)
  App user: mallchain_app (limited permissions, Secrets Manager)

Backup strategy:
  Automated: Daily (7-day retention)
  Manual: Before major updates
  Export: Weekly to S3 (long-term archive)

Point-in-time recovery: 7 days (CloudTrail enabled)
Monitoring: CloudWatch (CPU, memory, storage, connections)
Logs: Audit logs to CloudWatch (30-day retention)

Connection string:
  mongodb://mallchain_app:PASSWORD@documentdb-cluster:27017/mallchain?tls=true&tlsCertificateKeyFile=...
```

#### Amazon ElastiCache (Redis)

```yaml
Cluster Name: mallchain-redis
Engine: Redis 7.x (managed)
Cluster mode: Enabled (3 shards, 1 replica each)
Node type: cache.r6g.xlarge (4 vCPU, 25.55 GB RAM, $1.35/hr each)
Placement: Private subnet (10.0.3.0/24)
Security Group: Redis-SG (only app tier)

Replication:
  Shards: 3 (automatic sharding by key hash)
  Replicas: 1 per shard (Multi-AZ failover)
  Automatic failover: Yes (if primary fails, replica promoted)

Persistence:
  RDB snapshots: Daily at 3 AM UTC (1-day retention)
  AOF (append-only file): Enabled (fsync every 1 second)
  Backup to S3: Daily snapshots

Encryption:
  In-transit: TLS 1.2 (enforced)
  At-rest: KMS (aws/elasticache)
  AUTH token: 32-char random (Secrets Manager)

Configuration:
  Maxmemory policy: allkeys-lru (evict least-recently-used)
  Eviction ratio: 10% (when at max capacity)
  Timeout: 300 seconds (idle connections)

Monitoring: CloudWatch (CPU, memory, network, evictions)
Logs: Redis slow logs to CloudWatch (10ms threshold)
Alarms: Memory utilization >80%, evictions>1000/sec

Connection string:
  redis://AUTH_TOKEN@mallchain-redis-primary.abc123.cache.amazonaws.com:6379
```

---

### D. DATABASES & SECRETS

#### AWS Secrets Manager

```yaml
Secrets stored:
  backend/jwt-secret: 256-bit random hex
  backend/session-secret: 256-bit random hex
  backend/admin-api-key: 256-bit random hex
  backend/payment-webhook-secret: 256-bit random hex
  backend/field-encryption-key: 256-bit random hex
  backend/field-blind-index-key: 256-bit random hex
  blockchain/operator-mnemonic: (if needed, rotate monthly)
  blockchain/faucet-mnemonic: (if needed, rotate on spend)
  documentdb/admin-password: 32-char random
  documentdb/app-password: 32-char random
  redis/auth-token: 32-char random
  grafana/admin-password: 32-char random

Rotation:
  Automatic rotation: Quarterly (Lambda-triggered)
  Manual rotation: Before major updates
  Versioning: Last 5 versions retained

Access control:
  IAM policy: ECS task role can read specific secrets
  CloudTrail: All secret access logged
  Encryption: KMS (aws/secretsmanager)
```

---

### E. SECURITY & IDENTITY

#### Security Groups

**VPC Endpoints SG** (if used)
```
Ingress:
  HTTPS (443): From all internal IPs (10.0.0.0/16)
  
Egress:
  All: To AWS endpoints (S3, ECR, CloudWatch)
```

**ALB Security Group**
```
Ingress:
  HTTP (80): From 0.0.0.0/0 (public internet)
  HTTPS (443): From 0.0.0.0/0 (public internet)
  
Egress:
  HTTP (80): To ECS-SG (10.0.2.0/24)
  TCP (4000): To ECS-SG (backend)
```

**NLB Security Group** (RPC/REST)
```
Ingress:
  TCP (26657): From 0.0.0.0/0 (public RPC)
  TCP (1317): From 0.0.0.0/0 (public REST)
  
Egress:
  TCP (26657): To ECS-SG (RPC gateway)
  TCP (1317): To ECS-SG (RPC gateway)
```

**ECS Security Group**
```
Ingress:
  TCP (80): From ALB-SG (frontend)
  TCP (4000): From ALB-SG (backend)
  TCP (26657): From NLB-SG (RPC gateway upstream)
  TCP (1317): From NLB-SG (REST gateway upstream)
  TCP (9090): From internal IPs (Prometheus scraper)
  
Egress:
  TCP (27017): To DocumentDB-SG (MongoDB)
  TCP (6379): To Redis-SG (Redis)
  TCP (26657): To Validator-SG (blockchain RPC)
  TCP (1317): To Validator-SG (blockchain REST)
  TCP (443): To 0.0.0.0/0 (HTTPS outbound, Secrets Manager, CloudWatch)
```

**DocumentDB Security Group**
```
Ingress:
  TCP (27017): From ECS-SG (10.0.2.0/24) only
  
Egress:
  None (managed database)
```

**Redis Security Group**
```
Ingress:
  TCP (6379): From ECS-SG (10.0.2.0/24) only
  
Egress:
  None (managed service)
```

**Validator EC2 Security Group**
```
Ingress:
  TCP (26656): From Validator-SG (same group, peer-to-peer)
  TCP (26657): From ECS-SG (10.0.2.0/24 only, RPC)
  TCP (1317): From ECS-SG (10.0.2.0/24 only, REST)
  TCP (26660): From internal IPs (Prometheus metrics)
  SSH (22): From VPN/bastion only (NOT 0.0.0.0/0)
  
Egress:
  TCP (26656): To Validator-SG (peer connections)
  TCP (443): To 0.0.0.0/0 (CloudWatch, Secrets Manager)
  UDP (53): To 8.8.8.8 (DNS queries)
```

#### IAM Roles & Policies

**ECS Task Execution Role**
```
Policies:
  - AmazonECSTaskExecutionRolePolicy (built-in)
  - Secret read access (specific Secrets Manager paths)
  - CloudWatch logs write access
  - ECR image pull access
```

**ECS Task Role** (for application)
```
Policies:
  - Secrets Manager: Read backend/*, blockchain/* secrets
  - S3: PutObject to backup bucket (backups)
  - CloudWatch: PutMetricData (custom metrics)
  - DynamoDB: If using DynamoDB for sessions (optional)
```

**EC2 Instance Role** (Validator)
```
Policies:
  - Secrets Manager: Read blockchain/* secrets
  - CloudWatch: PutMetricData, PutLogEvents
  - S3: PutObject to backup bucket (state exports)
  - EBS snapshots: Automated (EC2 Default Role)
  - Systems Manager Session Manager: For secure SSH alternative
```

---

### F. DNS & CERTIFICATES

#### Route 53

```yaml
Hosted Zone: mallchain.network

DNS Records:
  A mallchain.network               → ALB IP (app load balancer)
  A app.mallchain.network           → ALB IP
  A api.mallchain.network           → ALB IP
  A rpc.mallchain.network           → NLB IP (RPC load balancer)
  A rest.mallchain.network          → NLB IP (same NLB, different port)
  
  CNAME www.mallchain.network       → mallchain.network (optional)
  
  MX (if email needed for notifications)
  TXT SPF/DMARC (if sending emails)

Health checks:
  API endpoint: GET https://api.mallchain.network/api/health
  Action: If unhealthy, fail over to secondary region (future)

TTL:
  Default: 300 seconds (5 minutes, for quick DNS failover)
  Long-lived records: 3600 seconds (after stability proven)
```

#### AWS Certificate Manager (ACM)

```yaml
Certificates:
  Primary: *.mallchain.network + mallchain.network (wildcard)
  
Validation:
  Method: DNS validation (automatic with Route 53)
  Records: CNAME validation in Route 53 (auto-added by ACM)
  
Renewal:
  Automatic: AWS handles before expiry
  Notification: AWS SNS before expiry (backup notification)

Deployment:
  ALB: Primary certificate (*.mallchain.network)
  NLB: Primary certificate (for TLS termination, if needed)
  
Status:
  Issued: Once DNS validation complete (~5-10 minutes)
  Renewal: Automatic (90 days before expiry)
```

---

### G. MONITORING & OBSERVABILITY

#### CloudWatch

```yaml
Log Groups:
  /aws/ecs/mallchain-backend:        Backend logs (JSON, 30-day retention)
  /aws/ecs/mallchain-frontend:       Frontend access logs (30-day)
  /aws/ecs/mallchain-rpc-gateway:    RPC/REST logs (30-day)
  /aws/ec2/mallchain-validator:      Validator logs (30-day)
  /aws/documentdb/mallchain:         Database logs (30-day)
  /aws/elasticache/mallchain-redis:  Redis logs (30-day)

Metrics (custom):
  backend/requests:                  Counter (requests/sec)
  backend/latency:                   Histogram (response time)
  blockchain/block-height:           Gauge (current block)
  blockchain/validators:             Gauge (active validators)
  rpc/requests:                       Counter (RPC calls/sec)
  database/connections:              Gauge (active connections)
  redis/evictions:                   Counter (keys evicted/sec)

Alarms:
  ALB target unhealthy:              SNS alert (PagerDuty integration)
  Backend CPU > 80%:                 SNS alert
  Backend memory > 90%:              SNS alert
  Database connections > 100:        SNS alert
  Redis evictions > 1000/sec:        SNS alert
  Blockchain block height stalled:   SNS alert (no new blocks 30 min)
  RPC latency > 5 seconds:           SNS alert
  Validator offline (SSH check):     SNS alert (CloudWatch agent ping)

Dashboards:
  System health:          CPU, memory, disk, network per service
  Application metrics:    Requests, latency, errors, status codes
  Blockchain metrics:     Block height, validator status, consensus health
  Database metrics:       Connections, query latency, replication lag
  API health:            Backend /health endpoint status per AZ
```

#### SNS & PagerDuty Integration

```yaml
SNS Topics:
  mallchain-alerts-critical:   To PagerDuty (urgent incidents)
  mallchain-alerts-warning:    To Slack #ops-alerts
  mallchain-alerts-info:       To CloudWatch Logs (FYI)

Notification actions:
  Alarm → SNS topic → PagerDuty → On-call engineer
  Dashboard: https://monitoring.mallchain.network/grafana (internal)
```

#### X-Ray (Distributed Tracing, Optional)

```yaml
Enabled for:
  Backend API requests (trace latency through services)
  Database queries (identify slow queries)
  Blockchain RPC calls (trace response time)

Retention: 7 days (default)
Cost: ~$5/million traced requests
```

---

### H. BACKUPS & DISASTER RECOVERY

#### S3 Backup Bucket

```yaml
Bucket name: mallchain-backups-prod
Region: us-east-1
Versioning: Enabled (keep last 30 versions)
Encryption: KMS (aws/s3)

Lifecycle policies:
  Documents (< 30 days):    STANDARD
  Documents (30-90 days):   STANDARD-IA (cheaper)
  Documents (> 90 days):    GLACIER (archived, 12-hour retrieval)

Contents:
  documentdb/daily/YYYY-MM-DD/  → mongodump snapshots (S3 Select queries)
  redis/daily/YYYY-MM-DD/       → RDB snapshots (point-in-time recovery)
  validator/state/weekly/       → Validator state export (disaster recovery)
  logs/                         → Application logs (CloudWatch export)

Replication:
  Cross-region: Replicate to us-west-2 (secondary region for DR)
  Retention: Last 30 backups kept

Access:
  IAM policy: ECS tasks can write (PutObject)
  Versioning: Restore any version from last 30 days
```

#### RDS/DocumentDB Backups

```yaml
Automatic backups:
  Retention: 7 days
  Backup window: 2:00 AM UTC (low-traffic window)
  Backup type: Full snapshot + incremental
  Encryption: KMS (aws/rds)

Manual backups (before major changes):
  Naming: mallchain-db-backup-YYYY-MM-DD
  Retention: Until manually deleted (long-term archive)

Point-in-time recovery:
  Available for: Last 7 days
  Restore time: ~5-10 minutes

Test restore (monthly):
  Create test database from backup
  Verify data integrity
  Destroy test database
```

#### ElastiCache Backups

```yaml
Automated backups:
  Frequency: Daily at 3:00 AM UTC
  Retention: 1 day (to S3)
  Type: Full RDB snapshot

Manual backups:
  Before major configuration changes
  Retention: Until manually deleted

Point-in-time recovery:
  Available for: Last 1 day
  Restore time: ~2-5 minutes
  Verify: Restore to test cluster before production
```

#### Disaster Recovery Plan

```yaml
RTO (Recovery Time Objective): 4 hours (target)
RPO (Recovery Point Objective): 1 hour (data loss acceptable)

Failure scenarios:

1. Single AZ outage (us-east-1a):
   - Multi-AZ services automatically fail over (DocumentDB, ElastiCache, ECS)
   - RTO: 2-5 minutes (automatic)
   - Data loss: 0

2. Region outage (us-east-1):
   - Requires failover to us-west-2 (secondary region, manual)
   - Restore from S3 cross-region replication backup
   - RTO: 2-4 hours (manual process)
   - Data loss: ≤1 hour (from last backup)
   - Cost: Emergency re-provisioning in secondary region

3. Database corruption:
   - Restore from point-in-time backup (within 7 days)
   - RTO: 30 minutes
   - Data loss: ≤5 minutes

4. Blockchain validator failure:
   - Restore validator state from S3 backup
   - Sync blockchain from peers
   - RTO: 1-2 hours
   - Data loss: 0 (state is immutable from peers)

Runbooks (documented separately):
  - Database recovery procedure
  - Validator recovery procedure
  - Region failover procedure
  - Secrets rotation in emergency
```

---

## 2. PUBLIC VS PRIVATE COMPONENTS

### What's Public

```
┌─ INTERNET ──────────────────────────────┐
│                                         │
├─ https://app.mallchain.network    ✅   │  V14 Frontend (static files)
├─ https://api.mallchain.network    ✅   │  Backend API (OAuth, wallet ops)
├─ https://rpc.mallchain.network    ✅   │  Blockchain RPC (tendermint HTTP)
├─ https://rest.mallchain.network   ✅   │  Blockchain REST (cosmos SDK)
│                                         │
└─────────────────────────────────────────┘
```

**What users can reach:**
- V14 frontend (frontend users login, manage wallets)
- Backend API (sign up, wallet queries, transactions)
- Public RPC/REST (independent Mallchain App wallet connects here)

### What's Private

```
┌─ PRIVATE VPC (10.0.0.0/16) ─────────────┐
│                                         │
├─ ECS Backend container        ✅ PRIVATE │  No direct internet access
├─ MongoDB cluster              ✅ PRIVATE │  Only from ECS
├─ Redis cluster                ✅ PRIVATE │  Only from ECS
├─ Validator node               ✅ PRIVATE │  No direct internet access
├─ EC2 SSH                      ✅ PRIVATE │  Systems Manager Session Manager only
├─ Prometheus                   ✅ PRIVATE │  127.0.0.1:9090 only
├─ Grafana                      ✅ PRIVATE │  127.0.0.1:3000 only
│                                         │
└─────────────────────────────────────────┘
```

**What's NOT exposed:**
- Backend container internals
- Database connection strings
- Validator RPC endpoint (internal only)
- SSH access (via Systems Manager, not bastion)
- Monitoring dashboards (restricted to ops team)
- Secrets Manager (IAM-protected)

---

## 3. DOMAINS & SUBDOMAINS

### Required DNS Records

```
Registered domain: mallchain.network

Records:
  ┌─ Primary domain ──────────────────────────┐
  │  A  mallchain.network  → ALB IP           │ Homepage / docs (optional)
  │  A  www.mallchain.network → ALB IP        │ Redirect (optional)
  │                                            │
  ├─ User applications ──────────────────────┐
  │  A  app.mallchain.network → ALB IP       │ V14 Web OS frontend
  │  A  api.mallchain.network → ALB IP       │ Backend API (auth, wallet)
  │                                            │
  ├─ Blockchain access ──────────────────────┐
  │  A  rpc.mallchain.network → NLB IP       │ Tendermint RPC (for wallets)
  │  A  rest.mallchain.network → NLB IP      │ Cosmos REST (for queries)
  │                                            │
  ├─ Optional: Admin/Monitoring ─────────────┐
  │  A  monitoring.mallchain.network → ALB IP│ Prometheus/Grafana (if public)
  │     (More secure: keep on private IP)    │
  │                                            │
  └─────────────────────────────────────────┘

Notes:
  - All A records point to load balancer IPs
  - Load balancers route based on SNI (Server Name Indication in TLS)
  - No direct EC2 IP exposure
```

### Recommended Setup

For maximum security, keep monitoring internal:

```
Public-facing:
  app.mallchain.network       → Frontend
  api.mallchain.network       → Backend API
  rpc.mallchain.network       → RPC gateway (rate-limited)
  rest.mallchain.network      → REST gateway

Internal (VPN or bastion required):
  monitoring.mallchain.network (or local IP only)
  validator.mallchain.network (or local IP only)
```

---

## 4. PUBLIC PORTS

### Internet-Facing (Public Security Groups Allow)

```
Port 80 (HTTP):
  ALB listener
  Action: Redirect to HTTPS (301)
  Allowed from: 0.0.0.0/0

Port 443 (HTTPS):
  ALB listener (frontend + API)
  NLB listener (RPC + REST)
  Certificate: ACM *.mallchain.network
  TLS version: 1.3 (minimum)
  Allowed from: 0.0.0.0/0

Port 26657 (Tendermint RPC):
  NLB upstream → ECS RPC gateway
  Rate limiting: 10 req/s per IP (nginx)
  Allowed from: 0.0.0.0/0

Port 1317 (Cosmos REST):
  NLB upstream → ECS RPC gateway
  Rate limiting: 10 req/s per IP (nginx)
  Allowed from: 0.0.0.0/0
```

### Private Ports (VPC Only)

```
Port 4000 (Backend API, internal):
  Only from ALB (10.0.1.0/24)

Port 26657 (Validator RPC, internal):
  Only from RPC gateway (10.0.2.0/24)

Port 1317 (Validator REST, internal):
  Only from RPC gateway (10.0.2.0/24)

Port 26656 (Validator P2P):
  Only to/from validator peers (Validator-SG)

Port 27017 (MongoDB):
  Only from ECS (10.0.2.0/24)

Port 6379 (Redis):
  Only from ECS (10.0.2.0/24)

Port 22 (SSH):
  Not open (use Systems Manager Session Manager instead)

Port 9090 (Prometheus):
  127.0.0.1:9090 only (internal monitoring)

Port 3000 (Grafana):
  127.0.0.1:3000 only (internal monitoring)
```

---

## 5. SECRETS MANAGEMENT

### Secrets Required

All secrets generated via `openssl rand -hex 32` (256-bit random):

```
Backend secrets (in AWS Secrets Manager):
  backend/jwt-secret                  ← Signed session tokens
  backend/session-secret              ← Express session encryption
  backend/admin-api-key               ← Metrics / admin endpoint access
  backend/payment-webhook-secret      ← Safaricom M-Pesa callback verification
  backend/field-encryption-key        ← PII encryption (user details)
  backend/field-blind-index-key       ← Searchable encryption (passwords)

Blockchain secrets (in AWS Secrets Manager):
  blockchain/operator-mnemonic        ← Server-side wallet signing (high risk, consider disabling)
  blockchain/faucet-mnemonic          ← Faucet funding (disabled for mainnet)
  blockchain/validator-keys           ← Validator signing key

Database secrets (in AWS Secrets Manager):
  documentdb/admin-password           ← Root MongoDB user
  documentdb/app-password             ← Limited MongoDB user (backend)
  redis/auth-token                    ← Redis cluster authentication

Monitoring secrets (in AWS Secrets Manager):
  grafana/admin-password              ← Grafana dashboard login

Injection mechanism:
  ECS tasks: Reference secrets in task definition
  EC2 validator: AWS Systems Manager Parameter Store or agent script
  Container startup: Export to environment variables (Secrets Manager agent)
```

### Secrets Rotation Schedule

```
Quarterly rotation:
  JWT_SECRET              → 90 days
  SESSION_SECRET          → 90 days
  ADMIN_API_KEY           → 90 days
  FIELD_ENCRYPTION_KEY    → 90 days

Monthly rotation:
  OPERATOR_MNEMONIC       → 30 days (high risk, consider disabling)
  FAUCET_MNEMONIC         → 30 days (or as funds are spent)

As-needed rotation:
  PAYMENT_WEBHOOK_SECRET  → When provider changes
  Database passwords      → After security incident
  Redis AUTH token        → After security incident

Rotation process:
  1. Generate new secret via openssl
  2. Store in Secrets Manager (create new version)
  3. Update deployment to use new version (blue/green)
  4. Old version retained for 30 days (backward compatibility)
  5. After 30 days, delete old version
```

---

## 6. TLS & HTTPS CONFIGURATION

### Certificate Management

```
Certificate: AWS ACM *.mallchain.network (wildcard)
Subject alternative names:
  - *.mallchain.network
  - mallchain.network

Validation: DNS validation (CNAME to Route 53)
Renewal: Automatic (AWS handles before expiry)
Enforcement: HTTPS only (redirect HTTP → HTTPS on ALB)

TLS Configuration (AWS ALB):
  Minimum TLS version: 1.3 (strict)
  Cipher suites:
    TLS_AES_256_GCM_SHA384           (preferred)
    TLS_CHACHA20_POLY1305_SHA256
    TLS_AES_128_GCM_SHA256

Security headers (via ALB listener rules or nginx):
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: (customize based on features)

HSTS preload: Submit to https://hstspreload.org/ (after stability proven)

Perfect forward secrecy: Enabled (ephemeral key exchange)
```

### TLS Termination Points

```
ALB (port 443):
  Terminates client HTTPS connections
  Backend connections (ECS): HTTP (internal VPC)
  Certificate: *.mallchain.network (ACM)

RPC/REST Gateway (internal):
  No additional TLS needed (internal VPC)
  Upstream to validator: HTTP (internal network)
```

---

## 7. DATABASE & REDIS ARCHITECTURE

### MongoDB (DocumentDB)

```
Cluster: 3-node Multi-AZ
Instances: db.r6g.xlarge (4 vCPU, 32GB RAM) × 3
Distribution: us-east-1a, us-east-1b, us-east-1c
Replication: Primary + 2 read replicas (synchronous)

Connection string:
  mongodb://mallchain_app:PASSWORD@
    documentdb-cluster.cluster-ABC123.us-east-1.docdb.amazonaws.com:27017/mallchain
    ?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred

Indexes required (for performance):
  users: { email: 1 } (unique index)
  users: { walletAddress: 1 } (for lookups)
  transactions: { userId: 1, createdAt: -1 } (for queries)
  transactions: { blockHeight: 1 } (for blockchain sync)

Backup strategy:
  Automated: Daily snapshots (7-day retention)
  Manual: Before major version upgrades
  Test restore: Monthly (validate backup integrity)
  Export: Weekly to S3 (long-term archive)

Monitoring:
  Primary lag: < 1ms (Multi-AZ sync replication)
  Storage: Current ~50GB, plan for 200GB capacity
  Connections: Backend pool ~20 connections
  Slow query log: >100ms queries logged
```

### Redis (ElastiCache)

```
Cluster: 3-node sharded with replication
Instance type: cache.r6g.xlarge (4 vCPU, 25.55GB) × 3
Cluster mode: Enabled (3 shards, 1 replica each)
Distribution: Multi-AZ automatic failover

Endpoints:
  Primary: mallchain-redis.ABC123.cache.amazonaws.com:6379 (all shards)
  Read replicas: Automatic failover

Key data stored:
  faucet:cooldown:ADDRESS → TTL 24h (request throttling)
  transaction:queue:* → FIFO list (pending broadcasts)
  jwt:revoked:TOKEN → TTL (logout tokens)
  session:USER_ID → TTL 7 days (user sessions)
  cache:* → Various cached data (TTL configurable)

Backup strategy:
  Automated: Daily RDB snapshots (1-day retention)
  Persistence: RDB + AOF (fsync every 1 second)
  Manual: Before major changes
  Export: To S3 for long-term archive

Configuration:
  Maxmemory: 85% of instance size (~21GB per node)
  Eviction policy: allkeys-lru (auto-evict least-used keys)
  Timeout: 300 seconds (idle connection)
  TCP backlog: 511 (default, sufficient)

Monitoring:
  Memory usage: Target <80% (auto-evicts when full)
  Eviction rate: Alert if >1000 evictions/sec
  Network throughput: Peak ~500Mbps (acceptable for 3x nodes)
  CPU: Typically <10% (not CPU-bound)
```

---

## 8. PRODUCTION ENVIRONMENT VARIABLES

### Backend (.env for ECS)

```bash
# Application
NODE_ENV=production

# Blockchain
CHAIN_ID=mallchain-1
CHAIN_PREFIX=mall
CHAIN_RPC=http://validator-instance:26657  (internal VPC)
CHAIN_REST=http://validator-instance:1317

# Databases
MONGO_URI=mongodb+srv://mallchain_app:${MONGO_PASSWORD}@documentdb.../mallchain
REDIS_HOST=mallchain-redis.cache.amazonaws.com
REDIS_PORT=6379
REDIS_AUTH=${REDIS_AUTH_TOKEN}

# Security (from Secrets Manager)
JWT_SECRET=${backend/jwt-secret}
SESSION_SECRET=${backend/session-secret}
ADMIN_API_KEY=${backend/admin-api-key}
PAYMENT_WEBHOOK_SECRET=${backend/payment-webhook-secret}
FIELD_ENCRYPTION_KEY=${backend/field-encryption-key}
FIELD_BLIND_INDEX_KEY=${backend/field-blind-index-key}

# Wallet (from Secrets Manager)
OPERATOR_MNEMONIC=${blockchain/operator-mnemonic}  (consider disabling)
ALLOW_OPERATOR_MNEMONIC=false  (recommended for production)
FAUCET_MNEMONIC=${blockchain/faucet-mnemonic}
FAUCET_ENABLED=false  (for mainnet; true for testnet)

# CORS & URLs
CORS_ORIGINS=https://app.mallchain.network
FRONTEND_URL=https://app.mallchain.network
API_BASE_URL=https://api.mallchain.network

# Features
LOG_LEVEL=info  (not debug in production)
RATE_LIMIT_WINDOW=15  (minutes)
RATE_LIMIT_MAX_REQUESTS=100  (per window)

# Monitoring
METRICS_ENABLED=true
SENTRY_DSN=  (if using Sentry error tracking)
```

### Frontend (build-time environment)

```bash
# Backend connectivity
VITE_API_BASE_URL=https://api.mallchain.network

# Blockchain
VITE_CHAIN_ID=mallchain-1
VITE_CHAIN_PREFIX=mall
VITE_GAS_PRICE=0.01stake

# Network indicator
VITE_NETWORK=mainnet  (or testnet)

# Session
VITE_SESSION_TTL=120  (seconds)

# Wallet
VITE_WALLET_STORAGE=localStorage  (or sessionStorage)

# Build
VITE_APP_TITLE=Mallchain
VITE_APP_VERSION=1.0.0  (from package.json)
```

Build command:
```bash
npm run build
# Creates dist/ with environment variables baked in
```

### Validator (.env for EC2)

```bash
# Blockchain
CHAIN_ID=mallchain-1
CHAIN_NAME=Mallchain Validator
VALIDATOR_MONIKER=validator-aws-prod-1
LOG_LEVEL=info

# Secrets (from Secrets Manager or Parameter Store)
VALIDATOR_MNEMONIC=${blockchain/validator-keys}

# Network
P2P_ADDR=tcp://10.0.4.x:26656
RPC_ADDR=tcp://127.0.0.1:26657  (internal only)
API_ADDR=tcp://127.0.0.1:1317   (internal only)

# Monitoring
PROMETHEUS_PORT=26660  (internal metrics)
```

---

## 9. DEPLOYMENT ORDER

### Phase 1: Prerequisites (Day 1)

```
1. ✅ AWS account & permissions configured
2. ✅ Domain registered (mallchain.network)
3. ✅ Secrets generated (openssl rand -hex 32 × 12)
4. ✅ ECR repository created (ECR:mallchain-backend, etc.)
5. ✅ Docker images built and pushed to ECR
6. ✅ terraform/ or CloudFormation templates prepared
```

### Phase 2: Infrastructure (Day 2-3)

```
7. ✅ VPC created (10.0.0.0/16)
8. ✅ Subnets created (public, app, data, validator)
9. ✅ Security groups created (ALB-SG, ECS-SG, Validator-SG, etc.)
10. ✅ NAT Gateway deployed (public subnet)
11. ✅ ALB created (port 80 → 443 redirect, health checks)
12. ✅ NLB created (RPC/REST routing)
13. ✅ ACM certificate requested (*.mallchain.network)
14. ✅ Route 53 DNS records created (A records for all subdomains)
15. ✅ DNS validation complete (certificate issued)
```

### Phase 3: Databases (Day 3-4)

```
16. ✅ DocumentDB cluster created (3-node, Multi-AZ)
17. ✅ DocumentDB security group configured
18. ✅ ElastiCache cluster created (3-node sharded)
19. ✅ ElastiCache security group configured
20. ✅ S3 backup bucket created (versioning, encryption, lifecycle)
21. ✅ Secrets stored in AWS Secrets Manager
22. ✅ IAM roles & policies created (ECS task role, EC2 role)
```

### Phase 4: Services (Day 4-5)

```
23. ✅ EC2 Validator instance launched (private subnet)
24. ✅ Validator service started (systemd)
25. ✅ Validator syncs blockchain (check block height)
26. ✅ ECS Cluster created
27. ✅ Backend task definition created (with Secrets Manager refs)
28. ✅ Backend service deployed (2-4 replicas)
29. ✅ Backend health check passing (GET /api/health)
30. ✅ Frontend task definition created
31. ✅ Frontend service deployed (2-4 replicas)
32. ✅ RPC Gateway task definition created
33. ✅ RPC Gateway service deployed (2-4 replicas)
```

### Phase 5: Validation (Day 5-6)

```
34. ✅ Test frontend: https://app.mallchain.network
35. ✅ Test backend health: curl https://api.mallchain.network/api/health
36. ✅ Test RPC: curl https://rpc.mallchain.network/rpc -d '...'
37. ✅ Test wallet creation (manual)
38. ✅ Test wallet balance query
39. ✅ Test transaction broadcast (if testnet)
40. ✅ Test monitoring dashboards (Prometheus/Grafana)
41. ✅ Test backup restore (practice DR)
```

### Phase 6: Launch (Day 6-7)

```
42. ✅ Load testing (using k6 or JMeter)
43. ✅ Security scan (AWS Security Hub findings reviewed)
44. ✅ Final checklist complete
45. ✅ Launch communication sent
46. ✅ Monitoring alerts active
47. ✅ On-call rotation documented
48. ✅ Launch announced publicly
```

---

## 10. ROLLBACK STRATEGY

### If Backend Fails After Deployment

```
Quick rollback:
  1. ALB targets: Mark current revision as unhealthy
  2. ECS service: Update to previous task definition revision
  3. ECS auto-scales old revision back in (automatic)
  4. Health checks: Confirm new instances pass health checks
  5. Time to recovery: ~2-3 minutes (automatic)

Prerequisites:
  - Previous task definition revision saved in ECR (keep all images)
  - Health check configured correctly (detect bad deployment)
  - Auto-scaling policy in place (min 2, max 4)
```

### If Database Fails After Deployment

```
Rollback from backup:
  1. Take snapshot of corrupted database
  2. Restore from previous daily snapshot (< 24 hours old)
  3. Point backend connection string to new database
  4. Verify data integrity
  5. Time to recovery: ~30-45 minutes

Prerequisites:
  - Backup tested monthly (validate restore process)
  - Backup retention: 7 days (allow rolling back)
```

### If TLS Certificate Fails

```
Quick remediation:
  1. ACM automatically renews before expiry (no action needed)
  2. In emergency: Use self-signed cert (temporary, not recommended)
  3. Manual certificate: Upload to ACM, update ALB listener

Prerequisites:
  - ACM renewal monitored (SNS alerts if renewal fails)
  - Alternative certificate ready (in case of emergency)
```

### If Validator Goes Offline

```
Recovery procedure:
  1. SSH to validator (Systems Manager Session Manager)
  2. Check systemd status: systemctl status mallchain-validator
  3. If process dead: systemctl start mallchain-validator
  4. If blockchain corrupted: Restore from state backup (S3)
  5. Resync from peers (automatic, ~5-30 minutes depending on block height)

Prerequisites:
  - EBS snapshots automatic (daily)
  - State exports to S3 (weekly, for DR)
  - Systemd auto-restart configured (Restart=on-failure)
```

### Full Region Failover (Disaster Recovery)

```
If us-east-1 region completely down:
  1. Restore DocumentDB from cross-region replica (us-west-2)
  2. Restore ElastiCache from snapshot (us-west-2)
  3. Launch new ECS cluster in us-west-2
  4. Update Route 53 health checks to detect region failure
  5. Route 53 auto-fails over to us-west-2 (if configured)
  6. Time to recovery: ~2-4 hours (manual process)

Prerequisites:
  - S3 cross-region replication enabled
  - Terraform/IaC templates for us-west-2 (ready to deploy)
  - Documented manual failover procedure
  - Test failover quarterly (to verify procedure works)
```

---

## 11. BACKUP STRATEGY

### Automated Backups

```
DocumentDB (MongoDB):
  Frequency: Daily at 2:00 AM UTC
  Retention: 7 days automatic
  Type: Full snapshots + incremental
  Location: AWS managed storage
  Manual backup: Before major changes
  Export: Weekly snapshots to S3 (long-term archive)
  Recovery: Point-in-time restore to any time within 7 days
  Test: Monthly restore to dev environment

ElastiCache (Redis):
  Frequency: Daily at 3:00 AM UTC
  Retention: 1 day (AWS managed)
  Type: RDB snapshots
  Location: S3 (automatic export)
  Recovery: Manual restore from S3 snapshots
  Test: Monthly restore to dev environment

EC2 Validator (blockchain):
  EBS snapshots: Daily at 4:00 AM UTC (7-day rotation)
  State export: Weekly to S3 (immutable backup)
  Oplog: Validator oplog retained on-chain
  Recovery: EBS snapshot restore (~5 min) + resync peers
  Test: Quarterly (practice validator recovery)

Application logs:
  CloudWatch logs: 30-day retention
  Export: Daily to S3 (for long-term analysis)
  Archival: S3 Glacier after 90 days (cost optimization)
```

### Manual Backup Triggers

```
Before major changes:
  - Backend code deploy: DocumentDB snapshot
  - Database schema migration: DocumentDB snapshot
  - TLS certificate renewal: Copy certificate to backup

Post-incident:
  - Data corruption detected: Full backup before remediation
  - Security breach: Full forensic backup for investigation

Backup naming convention:
  mallchain-db-backup-YYYY-MM-DD-HHmm-TYPE
  Example: mallchain-db-backup-2026-09-19-1400-pre-migration
```

### Backup Testing

```
Monthly validation:
  1. Pick a random backup (not today's)
  2. Restore to dev environment
  3. Run smoke tests (connections, queries)
  4. Verify data integrity (row counts, indexes)
  5. Document results in backup log

Quarterly DR drill:
  1. Restore database + redis to staging
  2. Launch alternate ECS cluster pointing to staging data
  3. Run full end-to-end tests
  4. Verify RTO (how long did recovery take?)
  5. Document findings + improve process
```

---

## 12. ESTIMATED AWS COSTS

### Monthly Breakdown (Approximate)

```
Compute:
  EC2 Validator (t3.2xlarge): ~$240/month
  ECS Fargate (Backend 4 CPU, 8GB): ~$180/month
  ECS Fargate (Frontend 2 CPU, 2GB): ~$60/month
  ECS Fargate (RPC Gateway 2 CPU, 4GB): ~$90/month
  Subtotal: ~$570/month

Storage:
  DocumentDB (3× r6g.xlarge, 500GB): ~$450/month
  ElastiCache (3× r6g.xlarge, 75GB): ~$405/month
  EBS volumes (validator 500GB): ~$50/month
  S3 backups (50GB, STANDARD tier): ~$1.15/month
  Subtotal: ~$906/month

Networking:
  ALB (1000 LCUs): ~$30/month
  NLB (TCP, 50 Gbps): ~$30/month
  Data transfer out (100GB/month): ~$10/month
  ACM certificate: Free
  Subtotal: ~$70/month

Services:
  CloudWatch (logs 100GB/month, metrics): ~$50/month
  Route 53 (zone + queries): ~$1/month
  AWS Secrets Manager: ~$0.40/month
  SNS/PagerDuty integration: ~$5/month
  Subtotal: ~$56/month

Estimated Total: ~$1,602/month (~$19,224/year)

Cost optimizations:
  - Reserved instances (1-year): ~30% discount (save ~$480/month)
  - Compute Savings Plan (3-year): ~40% discount (save ~$700/month)
  - S3 Lifecycle (to Glacier): Reduce backup storage costs
  - Adjusted with Savings Plans: ~$1,200/month (~$14,400/year)
```

### Cost Drivers

```
High cost contributors:
  1. DocumentDB (managed database): ~$450/month (28%)
  2. ElastiCache (managed cache): ~$405/month (25%)
  3. EC2 Validator: ~$240/month (15%)

Cost reduction opportunities:
  - Use Reserved Instances (save 30-40%)
  - Use RDS Aurora (cheaper than DocumentDB for this workload)
  - Downsize validator instance (t3.xlarge instead of 2xlarge)
  - Auto-scale services down during off-peak hours
```

---

## 13. DEPLOYMENT TECHNOLOGIES

### Infrastructure as Code (Recommended)

Choose one:

**Option A: Terraform**
```
Pros:
  - Agnostic (works on any cloud)
  - Version control
  - Plan before apply (preview changes)
  - Reusable modules

Cons:
  - Learning curve
  - State file management (use remote state in S3)

Recommended modules:
  - terraform-aws-modules/vpc
  - terraform-aws-modules/ecs
  - terraform-aws-modules/rds-cluster
  - terraform-aws-modules/elasticache

Cost: Free (only pay for AWS resources)
```

**Option B: AWS CloudFormation**
```
Pros:
  - Native AWS service
  - Stack management
  - Change sets (preview changes)

Cons:
  - AWS-specific (not portable)
  - Fewer community modules

Cost: Free (only pay for AWS resources)
```

**Option C: AWS CDK (Infrastructure as Code in TypeScript)**
```
Pros:
  - Programming language (more flexible)
  - Component reuse
  - Conditional resources

Cons:
  - Learning curve
  - Less mature than Terraform/CloudFormation

Cost: Free
```

**Recommendation**: Use Terraform + AWS provider (most portable, most popular)

### Container Registry

```
Use AWS ECR (Elastic Container Registry):
  - Private registry (not Docker Hub)
  - Integrated with ECS (automatic image pull)
  - Image scanning for vulnerabilities
  - Lifecycle policies (auto-delete old images)

Repository structure:
  mallchain-backend:1.0.0         → Backend image
  mallchain-frontend:1.0.0        → Frontend image
  mallchain-rpc-gateway:1.0.0     → RPC proxy image
  
Build pipeline:
  GitHub Actions → Docker build → ECR push → ECS deploy
  (Automated on git push to main branch)
```

### CI/CD Pipeline (Recommended)

```
Use GitHub Actions:

Workflow: .github/workflows/deploy.yml
  1. On push to main:
  2. Run tests (npm run test)
  3. Build Docker images
  4. Push to ECR
  5. Update ECS task definitions
  6. Deploy to ECS cluster
  7. Run smoke tests
  8. Notify Slack/PagerDuty

Time to deploy: ~5-10 minutes (from git push to live)
Rollback: git revert + re-push (automatic rollback to previous revision)
```

---

## SUMMARY: WHAT'S BEEN DESIGNED

This architecture:

✅ Keeps validator node private (not exposed to internet)  
✅ Provides public RPC/REST for independent wallets (Mallchain App)  
✅ Supports V14 web OS (frontend → backend → blockchain)  
✅ Uses AWS managed services (DocumentDB, ElastiCache, ACM, Secrets Manager)  
✅ Implements Multi-AZ redundancy (auto-failover, no manual intervention)  
✅ Separates security concerns (public ALB, private databases, private validator)  
✅ Enables disaster recovery (backups to S3, cross-region replication)  
✅ Includes monitoring & alerting (CloudWatch, SNS, PagerDuty)  
✅ Supports both testnet and mainnet (configurable via env vars)  
✅ Ready for scaling (auto-scaling, load balancing)  

**Next step**: Turn this architecture into Terraform code (IaC) or CloudFormation templates, then provision on AWS.

---

**This is architecture planning only. No resources provisioned. No code changes made.**

When ready to deploy, the sequence is:
1. Prepare Terraform (or CloudFormation)
2. Provision infrastructure on AWS
3. Deploy containers to ECS
4. Verify health checks
5. Launch publicly

