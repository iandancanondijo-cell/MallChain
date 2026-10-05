# MALLCHAIN — INITIAL AWS PRODUCTION SPECIFICATION

**Objective**: Definitive initial production architecture for sovereign blockchain with two access patterns  
**Scope**: Exact AWS deployment model (no alternatives, no Kubernetes)  
**Target**: Launch Mallchain V14 and enable independent Mallchain App wallet  
**Status**: Specification only (no provisioning, no code changes)

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────── PUBLIC INTERNET ─────────────────────────┐
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    DNS (Route 53)                         │  │
│  │  mallchain.network, app.*, api.*, rpc.*, rest.*         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                    │         │         │                        │
│                    ▼         ▼         ▼                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              TLS/HTTPS (AWS Certificate Manager)          │  │
│  │         *.mallchain.network wildcard certificate         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                    │         │         │                        │
├────────────────────┼─────────┼─────────┼────────────────────────┤
│                    ▼         ▼         ▼                        │
│           ┌─────────────┐  ┌─────────────┐                     │
│           │   ALB 1     │  │   NLB       │                     │
│           │ (app/api)   │  │  (RPC/REST) │                     │
│           └─────────────┘  └─────────────┘                     │
│             Port 443         Port 443                            │
│             (HTTPS)          (HTTPS)                             │
│                                                                   │
└────────────────────┬──────────────────┬───────────────────────────┘
                     │                  │
          ┌──────────▼──┐         ┌─────▼──────────┐
          │ VPC Gateway │         │ VPC Gateway    │
          │ (ALB → App) │         │ (NLB → App)    │
          └──────────┬──┘         └─────┬──────────┘
                     │                  │
      ┌──────────────▼──────────────────▼─────────────┐
      │      AWS VPC (10.0.0.0/16)                   │
      │                                                │
      │  ┌────────── PUBLIC SUBNETS (10.0.1.0/24) ───┐│
      │  │  • ALB (HTTP → HTTPS redirect)            ││
      │  │  • NLB (TCP proxy, RPC/REST)              ││
      │  │  • NAT Gateway (outbound)                 ││
      │  │  • 3 AZs for redundancy                   ││
      │  └──────────────────────────────────────────┘│
      │                     ▼                         │
      │  ┌────────── PRIVATE APP SUBNET (10.0.2.0/24) ───┐│
      │  │                                               ││
      │  │  ┌──────────────────────────────────────┐   ││
      │  │  │ EC2 Instance 1: Backend/Frontend     │   ││
      │  │  │ (docker-compose)                     │   ││
      │  │  │                                      │   ││
      │  │  │ Containers:                          │   ││
      │  │  │ • backend (port 4000, internal)      │   ││
      │  │  │ • frontend (port 80, nginx)          │   ││
      │  │  │ • nginx reverse proxy (443)          │   ││
      │  │  │ • vault (port 8200, local)           │   ││
      │  │  │ • postgres (5432, local)             │   ││
      │  │  │ • prometheus (9090, local)           │   ││
      │  │  │ • grafana (3000, local)              │   ││
      │  │  │                                      │   ││
      │  │  │ EBS: root 100GB (gp3)                │   ││
      │  │  └──────────────────────────────────────┘   ││
      │  │                                               ││
      │  │  (EC2 Instance 2: optional failover)        ││
      │  │                                               ││
      │  └───────────────────────────────────────────────┘│
      │                     ▼                             │
      │  ┌────────── PRIVATE DATA SUBNET (10.0.3.0/24) ────┐│
      │  │                                                 ││
      │  │  • MongoDB (3-node replica set, self-managed)  ││
      │  │    - Containers or EC2 + EBS per node         ││
      │  │    - Port 27017 (restricted to app tier)      ││
      │  │    - Persistent volumes/EBS                   ││
      │  │                                                 ││
      │  │  • ElastiCache Redis                           ││
      │  │    - Port 6379 (restricted to app tier)       ││
      │  │    - 3-node cluster + auto-failover           ││
      │  │                                                 ││
      │  └─────────────────────────────────────────────────┘│
      │                     ▼                              │
      │  ┌────────── PRIVATE VALIDATOR SUBNET (10.0.4.0/24) ──┐│
      │  │                                                    ││
      │  │  ┌──────────────────────────────────────────┐    ││
      │  │  │ EC2 Instance: Mallchain Validator        │    ││
      │  │  │ Instance type: t3.2xlarge (8 vCPU, 32GB) │    ││
      │  │  │                                          │    ││
      │  │  │ Ports (internal only):                   │    ││
      │  │  │ • 26657 (RPC, 127.0.0.1 only)           │    ││
      │  │  │ • 1317 (REST, 127.0.0.1 only)           │    ││
      │  │  │ • 26656 (P2P, validator peers)           │    ││
      │  │  │ • 26660 (metrics, internal)              │    ││
      │  │  │                                          │    ││
      │  │  │ EBS:                                     │    ││
      │  │  │ • Root: 500GB gp3 (blockchain data)      │    ││
      │  │  │ • Encrypted: KMS                         │    ││
      │  │  │ • IOPS: 3000, Throughput: 125 MB/s       │    ││
      │  │  │ • Snapshots: daily (7-day retention)     │    ││
      │  │  │                                          │    ││
      │  │  │ Networking:                              │    ││
      │  │  │ • No public IP                           │    ││
      │  │  │ • Private subnet only                    │    ││
      │  │  │ • Security group: restricted access      │    ││
      │  │  │                                          │    ││
      │  │  │ Process:                                 │    ││
      │  │  │ • docker run (single blockchain node)    │    ││
      │  │  │ • systemd service (auto-restart)         │    ││
      │  │  │ • CloudWatch metrics + logs              │    ││
      │  │  └──────────────────────────────────────────┘    ││
      │  │                                                    ││
      │  └────────────────────────────────────────────────────┘│
      │                                                        │
      └────────────────────────────────────────────────────────┘
```

---

## A. AWS SERVICES

| Service | Type | Public | Private | Purpose | Notes |
|---------|------|--------|---------|---------|-------|
| **VPC** | Networking | — | ✅ 10.0.0.0/16 | Network isolation | 3 AZs |
| **ALB** | Load Balancer | ✅ Yes | — | HTTPS termination (app/api) | Port 443 → backend:4000, frontend:80 |
| **NLB** | Load Balancer | ✅ Yes | — | High-throughput RPC/REST proxy | Port 443 → RPC gateway |
| **EC2 (Backend)** | Compute | — | ✅ Private | Run backend, frontend, vault, postgres | docker-compose orchestration |
| **EC2 (Validator)** | Compute | — | ✅ Private | Run Mallchain validator node | Docker single blockchain container |
| **EBS** | Storage | — | ✅ Private | Persistent volumes | Root 100GB (backend), Root 500GB (validator) |
| **ElastiCache Redis** | Managed Cache | — | ✅ Private | Session cache, queues, rate limiting | 3-node cluster + auto-failover |
| **MongoDB** | Self-Managed | — | ✅ Private | User data, transactions, payments | 3-node replica set (containers or EC2) |
| **ACM** | Certificates | — | — | TLS certificates | *.mallchain.network wildcard |
| **Route 53** | DNS | ✅ Yes | — | Domain routing | A records → ALB/NLB IPs |
| **S3** | Object Storage | ✅ Optional | ✅ Backups | Backups, logs, state files | Cross-region replication (optional) |
| **CloudWatch** | Monitoring | — | ✅ Private | Logs, metrics, alarms | 30-day retention |
| **KMS** | Encryption | — | — | EBS/RDS/S3 encryption | Key rotation enabled |
| **Secrets Manager** | Secrets | — | — | JWT_SECRET, MNEMONIC, API_KEY | Automatic rotation support |
| **IAM** | Access Control | — | — | Role-based access | EC2 instance profiles, app roles |
| **Security Groups** | Firewall | — | ✅ Private | Port access control | Ingress/egress rules per tier |
| **NAT Gateway** | Networking | — | ✅ Private | Outbound internet access | For app tier to reach external services |
| **VPC Endpoints** | Networking | — | ✅ Private | Private S3/ECR/CloudWatch access | Optional (reduces NAT data transfer costs) |

---

## B. VPC & SUBNET ARCHITECTURE

### VPC Design

```
VPC: mallchain-vpc (10.0.0.0/16)
Region: us-east-1 (or preferred region)
AZs: us-east-1a, us-east-1b, us-east-1c (Multi-AZ redundancy)
```

### Subnet Allocation

| Subnet | CIDR | AZs | Type | Purpose |
|--------|------|-----|------|---------|
| PUBLIC-1 | 10.0.1.0/25 | us-east-1a | Public | ALB/NLB, NAT |
| PUBLIC-2 | 10.0.1.128/25 | us-east-1b | Public | ALB/NLB, NAT |
| PUBLIC-3 | 10.0.1.192/26 | us-east-1c | Public | ALB/NLB (tertiary) |
| APP-1 | 10.0.2.0/25 | us-east-1a | Private | Backend/Frontend EC2 |
| APP-2 | 10.0.2.128/25 | us-east-1b | Private | Backend/Frontend failover |
| APP-3 | 10.0.2.192/26 | us-east-1c | Private | Reserved |
| DATA-1 | 10.0.3.0/25 | us-east-1a | Private | MongoDB, Redis |
| DATA-2 | 10.0.3.128/25 | us-east-1b | Private | MongoDB, Redis |
| DATA-3 | 10.0.3.192/26 | us-east-1c | Private | MongoDB, Redis |
| VALIDATOR-1 | 10.0.4.0/25 | us-east-1a | Private | Blockchain validator |
| VALIDATOR-2 | 10.0.4.128/25 | us-east-1b | Private | Validator failover (future) |

### Routing

```
PUBLIC subnets:
  0.0.0.0/0 → Internet Gateway (IGW)

PRIVATE subnets (APP, DATA, VALIDATOR):
  0.0.0.0/0 → NAT Gateway (for outbound)
  10.0.0.0/16 → Local (VPC internal)
```

---

## C. EC2 INSTANCES & RESPONSIBILITIES

### Instance 1: Backend/Frontend/Vault (Primary)

```yaml
Name: mallchain-backend-1
Instance Type: t3.xlarge (4 vCPU, 16 GB RAM)
Placement: Private subnet (10.0.2.0/25, us-east-1a)
EBS:
  Root volume: 100GB gp3 (encrypted KMS)
  IOPS: 3000
  Throughput: 125 MB/s
  
Security Group: backend-sg
  Ingress:
    - Port 80 (HTTP): From ALB security group
    - Port 443 (HTTPS): From ALB security group
    - Port 4000 (Backend API): From ALB security group
    - Port 8200 (Vault): From same security group (localhost)
    - Port 5432 (PostgreSQL): From same security group (localhost)
    - Port 9090 (Prometheus): From 127.0.0.1 only
    - Port 3000 (Grafana): From 127.0.0.1 only
  
  Egress:
    - All ports to 0.0.0.0/0 (for updates, external APIs)
    - Internal: 27017 (MongoDB), 6379 (Redis), 26657 (validator RPC)

Containers (docker-compose):
  backend:
    Image: ghcr.io/mallchain/backend:latest
    Port: 4000 (internal)
    Env: CHAIN_RPC=http://validator:26657 (internal)
    Env: MONGO_URI=mongodb://... (internal)
    Env: REDIS_HOST=redis.internal (internal)
  
  frontend:
    Image: ghcr.io/mallchain/frontend:latest (or nginx serving dist/)
    Port: 80 (internal to nginx)
  
  nginx:
    Port: 443 (public from ALB)
    Routes:
      https://app.mallchain.network → frontend:80
      https://api.mallchain.network → backend:4000
  
  vault:
    Port: 8200 (localhost)
    Storage: /var/lib/vault (EBS volume)
  
  postgres:
    Port: 5432 (localhost)
    Volume: /var/lib/postgresql/data (EBS)
  
  prometheus:
    Port: 9090 (localhost)
  
  grafana:
    Port: 3000 (localhost)
  
  redis-nodes & sentinels (if self-managed):
    Ports: 6379-6381, 26379-26381 (internal)

Systemd Service:
  docker-compose up (restart on failure)
  Health check: curl http://localhost:4000/api/health

Monitoring:
  CloudWatch agent: CPU, memory, disk, network I/O
  Custom metrics: API requests, latency, errors
```

### Instance 2: Backend/Frontend/Vault (Failover, Optional)

```yaml
Name: mallchain-backend-2
Instance Type: t3.xlarge (same as Instance 1)
Placement: Private subnet (10.0.2.128/25, us-east-1b)
Configuration: Identical to Instance 1
ALB Target Group: Includes both instances (active-active or active-passive)
```

### Instance 3: Mallchain Validator Node

```yaml
Name: mallchain-validator-1
Instance Type: t3.2xlarge (8 vCPU, 32 GB RAM)
Placement: Private subnet (10.0.4.0/25, us-east-1a)
Public IP: None (completely private)

EBS:
  Root volume: 500GB gp3 (encrypted KMS)
  IOPS: 3000
  Throughput: 125 MB/s
  Snapshots: Daily at 2:00 AM UTC (7-day retention)
  Note: Not hot-pluggable during operation; plan capacity upfront

Security Group: validator-sg
  Ingress:
    - Port 26657 (RPC): From 127.0.0.1 only (not from internet)
    - Port 1317 (REST): From 127.0.0.1 only
    - Port 26656 (P2P): From validator-sg (peer-to-peer to other validators)
    - Port 26660 (metrics): From 10.0.0.0/16 (internal monitoring)
  
  Egress:
    - Port 26656 (P2P): To other validator peers
    - Port 443: To 0.0.0.0/0 (CloudWatch, Secrets Manager)
    - Port 53 (DNS): To 0.0.0.0/0

Container:
  Image: ghcr.io/mallchain/marketplaced:latest
  Command: start \
    --home=/home/marketplaced/.marketplaced \
    --minimum-gas-prices=0.01stake \
    --rpc.laddr=tcp://127.0.0.1:26657 \
    --p2p.laddr=tcp://0.0.0.0:26656 \
    --api.enable \
    --api.address=tcp://127.0.0.1:1317 \
    --grpc.address=0.0.0.0:9090 \
    --pruning=custom \
    --pruning-keep-recent=362880 \
    --pruning-interval=100

  Volume mount: /home/marketplaced/.marketplaced → EBS mount point
  Health check: wget http://127.0.0.1:26657/status (internal only)

Systemd Service:
  ExecStart: /usr/bin/docker run ... (auto-restart on failure)
  RestartPolicy: always
  Restart=on-failure

Networking:
  No direct internet access
  All RPC/REST access restricted to 127.0.0.1
  P2P (26656) reaches validator peers only
  Metrics (26660) visible internally for monitoring

Monitoring:
  CloudWatch agent: CPU, memory, disk, network
  Custom metrics: Block height, validator status
  Logs: docker logs → CloudWatch
```

---

## D. EBS REQUIREMENTS FOR VALIDATOR

### Validator Storage Strategy

```
Volume: /home/marketplaced/.marketplaced (blockchain state)

Sizing:
  Initial: 500GB gp3
  Growth rate: ~1GB/day (typical Cosmos chain)
  1-year projection: ~365GB
  2-year projection: ~730GB
  
Plan: Start at 500GB, monitor growth, resize (no downtime with gp3)

Performance:
  IOPS: 3000 (default gp3, sufficient for validator)
  Throughput: 125 MB/s (default gp3)
  Latency: <1ms (important for consensus rounds)

Encryption:
  At-rest: KMS (aws/ebs)
  Key rotation: Enabled
  Snapshots: Encrypted with same KMS key

Backup Strategy:
  EBS snapshots: Daily at 2:00 AM UTC
  Retention: 7 days automatic (cost ~$0.05/GB/month)
  Off-site: Export snapshots to S3 weekly (long-term archive)
  Test restore: Monthly to verify integrity

Recovery:
  Snapshot restore time: 1-5 minutes (data available immediately, optimized)
  Full recovery time: 5-15 minutes (validator catches up from peers)
```

### MongoDB Storage (if self-managed in containers)

```
Per MongoDB node: 100GB gp3 (3 nodes = 300GB total)
Encryption: KMS
Snapshots: Daily
Mount: Docker named volume backed by EBS
```

---

## E. PUBLIC LOAD BALANCERS/GATEWAYS

### ALB (Application Load Balancer) — V14 Frontend + Backend API

```yaml
Name: mallchain-alb
Type: Application Load Balancer
Subnets: Public subnets (10.0.1.0/24, across 3 AZs)
Security Group: alb-sg

Listeners:
  Port 80 (HTTP):
    Action: Redirect to HTTPS (301)
  
  Port 443 (HTTPS):
    Certificate: ACM (*.mallchain.network)
    TLS version: 1.3 minimum
    Cipher suites: AES-256-GCM, ChaCha20-Poly1305

Target Groups:
  
  Target Group 1: V14 Frontend
    Name: mallchain-frontend-targets
    Port: 80 (HTTP backend)
    Protocol: HTTP
    Health check:
      Path: /index.html
      Interval: 30s
      Timeout: 5s
      Healthy threshold: 2
      Unhealthy threshold: 3
    
    Instances:
      - mallchain-backend-1 (10.0.2.x:80)
      - mallchain-backend-2 (10.0.2.x:80) [optional]
  
  Target Group 2: Backend API
    Name: mallchain-backend-targets
    Port: 4000 (HTTP backend)
    Protocol: HTTP
    Health check:
      Path: /api/health
      Interval: 30s
      Timeout: 5s
      Healthy threshold: 2
      Unhealthy threshold: 3
    
    Instances:
      - mallchain-backend-1 (10.0.2.x:4000)
      - mallchain-backend-2 (10.0.2.x:4000) [optional]

Rules (Host-based routing):
  
  Host: app.mallchain.network
    → Forward to: mallchain-frontend-targets
    → Rule priority: 1
  
  Host: api.mallchain.network
    → Forward to: mallchain-backend-targets
    → Rule priority: 2
  
  Default (catch-all):
    → Return 404

Load Balancing:
  Algorithm: Round-robin
  Stickiness: Disabled (stateless APIs)
  Connection draining: 30s

Logging:
  Access logs: To S3 bucket (mallchain-alb-logs)
  CloudWatch: Integrated via agent

Monitoring:
  CloudWatch metrics:
    - TargetResponseTime
    - RequestCount
    - HTTPCode_Target_5XX
    - UnhealthyHostCount
  
  Alarms:
    - Target unhealthy (> 0) → SNS alert
    - 5XX errors (> 1%) → SNS alert
```

### NLB (Network Load Balancer) — Public RPC/REST Gateway

```yaml
Name: mallchain-nlb-rpc
Type: Network Load Balancer
Subnets: Public subnets (10.0.1.0/24, across 3 AZs)
Scheme: Internet-facing
IP Address Type: IPv4
Security Group: nlb-rpc-sg

Listeners:
  
  Port 26657 (Tendermint RPC over TLS):
    Protocol: TLS
    Certificate: ACM (*.mallchain.network)
    TLS version: 1.3 minimum
    Target group: rpc-gateway-targets
    Health check: TCP port 26657
  
  Port 1317 (Cosmos REST over TLS):
    Protocol: TLS
    Certificate: ACM (*.mallchain.network)
    Target group: rest-gateway-targets
    Health check: TCP port 1317

Target Groups:
  
  Target Group 1: RPC Gateway (Port 26657)
    Name: mallchain-rpc-targets
    Port: 26657
    Protocol: TCP
    Instances: [rpc-gateway containers on backend EC2]
  
  Target Group 2: REST Gateway (Port 1317)
    Name: mallchain-rest-targets
    Port: 1317
    Protocol: TCP
    Instances: [rest-gateway containers on backend EC2]

Load Balancing:
  Algorithm: Flow hash (5-tuple: source IP, port, destination IP, port, protocol)
  Persistence: Connection-based (same client → same target)
  Connection timeout: 350s

Traffic Flow:
  
  Public RPC Request:
    Internet → https://rpc.mallchain.network:443
    → NLB (TLS termination)
    → rpc-gateway container (10.0.2.x)
    → Validator RPC (10.0.4.x:26657, internal only)
  
  Independent Mallchain App:
    Mallchain App → https://rpc.mallchain.network
    → NLB → RPC Gateway → Validator

Logging:
  Flow logs: VPC Flow Logs (optional, for debugging)

Monitoring:
  CloudWatch metrics:
    - ActiveFlowCount
    - NewFlowCount
    - ProcessedBytes
    - TargetTLSNegotiationCount
  
  Alarms:
    - Connection failures (> threshold) → SNS alert
```

---

## F. PRIVATE SECURITY GROUPS

### Security Group: alb-sg (ALB)

```yaml
Ingress:
  HTTP (80):
    Source: 0.0.0.0/0 (public internet)
    Purpose: Redirect to HTTPS
  
  HTTPS (443):
    Source: 0.0.0.0/0 (public internet)
    Purpose: TLS termination for app/api

Egress:
  All ports → 10.0.0.0/16 (VPC internal, backend targets)
```

### Security Group: nlb-rpc-sg (NLB RPC)

```yaml
Ingress:
  Port 26657 (RPC):
    Source: 0.0.0.0/0 (public internet)
    Purpose: Public RPC endpoint
  
  Port 1317 (REST):
    Source: 0.0.0.0/0 (public internet)
    Purpose: Public REST endpoint

Egress:
  Ports 26657, 1317 → 10.0.4.0/25 (validator subnet)
  Ports 26657, 1317 → 10.0.2.0/25 (RPC gateway containers)
```

### Security Group: backend-sg (Backend EC2)

```yaml
Ingress:
  Port 80 (HTTP):
    Source: alb-sg
    Purpose: Frontend serving
  
  Port 443 (HTTPS):
    Source: alb-sg
    Purpose: HTTPS termination
  
  Port 4000 (Backend API):
    Source: alb-sg
    Purpose: Backend API
  
  Port 8200 (Vault):
    Source: 127.0.0.1/32 (localhost via docker)
    Purpose: Local secrets
  
  Port 5432 (PostgreSQL):
    Source: 127.0.0.1/32 (localhost)
    Purpose: Local database
  
  Port 9090 (Prometheus):
    Source: 127.0.0.1/32 (localhost)
    Purpose: Local metrics
  
  Port 3000 (Grafana):
    Source: 127.0.0.1/32 (localhost)
    Purpose: Local dashboards
  
  SSH (22):
    Source: 0.0.0.0/0 or specific IP (bastion/admin)
    Purpose: EC2 management (or use Systems Manager Session Manager)

Egress:
  All ports → 0.0.0.0/0 (internet for updates)
  Port 27017 → data-sg (MongoDB)
  Port 6379 → data-sg (Redis)
  Port 26657 → validator-sg (validator RPC, internal)
  Port 1317 → validator-sg (validator REST, internal)
```

### Security Group: data-sg (MongoDB/Redis)

```yaml
Ingress:
  Port 27017 (MongoDB):
    Source: backend-sg
    Purpose: Database queries
  
  Port 6379 (Redis):
    Source: backend-sg
    Purpose: Cache/queue access
  
  Port 26379, 26380, 26381 (Redis Sentinel):
    Source: backend-sg
    Purpose: Failover coordination

Egress:
  Internal replication (MongoDB, Redis):
    Port 27017 → data-sg (MongoDB replica set)
    Port 6379 → data-sg (Redis cluster)
```

### Security Group: validator-sg (Validator EC2)

```yaml
Ingress:
  Port 26657 (RPC):
    Source: 127.0.0.1/32 (localhost only, no external)
    Purpose: Internal RPC access
  
  Port 1317 (REST):
    Source: 127.0.0.1/32 (localhost only, no external)
    Purpose: Internal REST access
  
  Port 26656 (P2P):
    Source: validator-sg (self)
    Purpose: Peer-to-peer communication
  
  Port 26660 (Metrics):
    Source: 10.0.0.0/16 (VPC internal)
    Purpose: Prometheus scraping
  
  SSH (22):
    Source: 0.0.0.0/0 or specific IP (bastion/admin)
    Purpose: EC2 management

Egress:
  Port 26656 → External validator peers (0.0.0.0/0, port 26656)
  Port 443 → 0.0.0.0/0 (CloudWatch, Secrets Manager)
  Port 53 (DNS) → 0.0.0.0/0
```

---

## G. PUBLIC PORTS

```
Port 80 (HTTP):
  Source: 0.0.0.0/0 (public internet)
  Destination: ALB
  Action: Redirect 301 → HTTPS

Port 443 (HTTPS):
  Source: 0.0.0.0/0 (public internet)
  Destination: ALB (app/api), NLB (rpc/rest)
  Protocol: TLS 1.3
  Certificate: ACM *.mallchain.network
  
  Routes (ALB):
    app.mallchain.network → frontend
    api.mallchain.network → backend
  
  Routes (NLB):
    rpc.mallchain.network:26657 → rpc-gateway
    rest.mallchain.network:1317 → rest-gateway

Rate Limiting (applied at nginx level, not AWS):
  Frontend: No limit (static assets)
  Backend API: 100 requests/sec per IP
  RPC/REST: 10 requests/sec per IP
```

---

## H. PRIVATE PORTS (VPC Internal)

```
Port 4000 (Backend API):
  Source: ALB only
  Destination: backend EC2
  Purpose: API requests
  Exposure: 0 (ALB proxies)

Port 80 (Frontend nginx):
  Source: ALB only
  Destination: backend EC2
  Purpose: Static files
  Exposure: 0 (ALB proxies)

Port 27017 (MongoDB):
  Source: backend EC2 only
  Destination: data subnet (MongoDB nodes)
  Purpose: Database queries
  Exposure: 0 (security group restricted)

Port 6379 (Redis):
  Source: backend EC2 only
  Destination: ElastiCache cluster
  Purpose: Cache/queue
  Exposure: 0 (security group restricted)

Port 26657 (Validator RPC):
  Source: 127.0.0.1 only (localhost)
  Destination: validator EC2
  Purpose: Internal RPC queries
  Exposure: 0 (restricted to localhost)

Port 1317 (Validator REST):
  Source: 127.0.0.1 only (localhost)
  Destination: validator EC2
  Purpose: Internal REST queries
  Exposure: 0 (restricted to localhost)

Port 26656 (P2P):
  Source: validator peers only
  Destination: validator EC2
  Purpose: Peer-to-peer consensus
  Exposure: ~0 (only to known validators)

Port 8200 (Vault):
  Source: localhost only
  Destination: backend EC2
  Purpose: Secrets retrieval
  Exposure: 0 (localhost only)

Port 5432 (PostgreSQL):
  Source: localhost only
  Destination: backend EC2
  Purpose: Explorer indexing
  Exposure: 0 (localhost only)

Port 9090 (Prometheus):
  Source: localhost only
  Destination: backend EC2
  Purpose: Metrics collection
  Exposure: 0 (localhost only)

Port 3000 (Grafana):
  Source: localhost only
  Destination: backend EC2
  Purpose: Monitoring dashboards
  Exposure: 0 (localhost only)
```

---

## I. DNS RECORDS (Route 53)

### Hosted Zone: mallchain.network

```yaml
Zone Name: mallchain.network
Zone Type: Public
Nameservers: AWS Route 53 (auto-assigned)
TTL: 300 seconds (5 minutes, for quick failover)

Records:

  A mallchain.network:
    Type: A
    Value: ALB IP (public)
    TTL: 300
    Purpose: Root domain (optional landing page)
  
  A app.mallchain.network:
    Type: A
    Value: ALB IP (same ALB, different routing rule)
    TTL: 300
    Purpose: V14 frontend

  A api.mallchain.network:
    Type: A
    Value: ALB IP (same ALB, different routing rule)
    TTL: 300
    Purpose: Backend API

  A rpc.mallchain.network:
    Type: A
    Value: NLB IP (different load balancer)
    TTL: 300
    Purpose: Public RPC endpoint

  A rest.mallchain.network:
    Type: A
    Value: NLB IP (same NLB, different listener port)
    TTL: 300
    Purpose: Public REST endpoint (if needed)

  CNAME www.mallchain.network:
    Type: CNAME
    Value: mallchain.network
    TTL: 300
    Purpose: www subdomain

  MX mallchain.network:
    [Optional, if sending emails for notifications]

  TXT mallchain.network:
    [SPF, DMARC records if needed]

Health Checks (optional, for failover):
  
  Health Check: api-health
    Type: HTTPS
    Target: https://api.mallchain.network/api/health
    Interval: 30s
    Failure threshold: 3
    Action: Fail over to secondary region (if configured)
```

---

## J. TLS CERTIFICATES (AWS Certificate Manager)

### Certificate: *.mallchain.network

```yaml
Certificate Type: Public certificate
Domain names:
  - *.mallchain.network (wildcard)
  - mallchain.network (apex)

Validation method: DNS validation (CNAME to Route 53)
Validation status: Automatic with Route 53 integration
Renewal: Automatic 60 days before expiry
Expiry: 1 year

Certificate deployment:
  ALB listener (443): *.mallchain.network
  NLB listener (443): *.mallchain.network

TLS Configuration (enforced):
  Minimum TLS version: 1.3
  Preferred ciphers:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
    - TLS_AES_128_GCM_SHA256

HSTS Header (applied by nginx on backend EC2):
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

Security:
  Perfect forward secrecy: Enabled
  Certificate pinning: Optional (not recommended for public APIs)
  Certificate transparency: Logged automatically
```

---

## K. SECRETS MANAGEMENT

### AWS Secrets Manager

```yaml
Secret vault: AWS Secrets Manager (us-east-1)
Encryption: KMS (aws/secretsmanager)
Rotation: Automatic or manual

Secrets:

  backend/jwt-secret:
    Type: String (256-bit hex)
    Value: openssl rand -hex 32
    Rotation: Quarterly (90 days)
    Used by: Backend JWT signing
  
  backend/session-secret:
    Type: String (256-bit hex)
    Rotation: Quarterly (90 days)
    Used by: Express session encryption
  
  backend/admin-api-key:
    Type: String (256-bit hex)
    Rotation: Quarterly (90 days)
    Used by: Metrics endpoint (/metrics)
  
  backend/payment-webhook-secret:
    Type: String (256-bit hex)
    Rotation: As needed (when provider changes)
    Used by: M-Pesa/payment callbacks
  
  backend/field-encryption-key:
    Type: String (256-bit hex)
    Rotation: Quarterly (90 days)
    Used by: PII encryption (user details)
  
  backend/field-blind-index-key:
    Type: String (256-bit hex)
    Rotation: Quarterly (90 days)
    Used by: Searchable encryption
  
  blockchain/operator-mnemonic:
    Type: String (BIP39 mnemonic)
    Rotation: Monthly (if needed)
    RISK: Server-side signing; consider ALLOW_OPERATOR_MNEMONIC=false
    Used by: Operator transactions (faucet, fees)
  
  blockchain/faucet-mnemonic:
    Type: String (BIP39 mnemonic)
    Rotation: As funds spent or compromise suspected
    Used by: Faucet funding
  
  blockchain/validator-keys:
    Type: JSON (private validator key)
    Rotation: Manual only (validator identity)
    Used by: Validator signing
  
  documentdb/admin-password:
    Type: String (32-char random)
    Rotation: Quarterly (90 days)
    Used by: MongoDB replica set admin
  
  redis/auth-token:
    Type: String (32-char random, if AUTH enabled)
    Rotation: Quarterly (90 days)
    Used by: ElastiCache authentication

Retrieval:
  EC2 instance profiles: IAM role can read secrets
  Backend at startup: VAULT_ADDR + VAULT_TOKEN or Secrets Manager API
  Rotation: Lambda function (optional automatic rotation)

Initial setup:
  Generate secrets: openssl rand -hex 32
  Store in Secrets Manager: AWS console or CLI
  Update .env: Reference Secrets Manager, not values
  Backend startup: Retrieve from Secrets Manager
```

---

## L. MONGODB PLACEMENT

### Self-Managed MongoDB (Initial, Proven Approach)

```yaml
Deployment: Docker containers (docker-compose on backend EC2) OR EC2 instances
Approach: 3-node replica set (for HA and data redundancy)

Configuration:

  MongoDB Node 1:
    Container/Instance: mongo-rs-1
    Port: 27017 (default)
    Subnet: data-1 (10.0.3.0/25, us-east-1a)
    EBS: 100GB gp3 (encrypted KMS)
    Role: Primary (initially)
    Replica set: mallchain-rs
  
  MongoDB Node 2:
    Container/Instance: mongo-rs-2
    Port: 27018 (or 27017 if separate containers)
    Subnet: data-2 (10.0.3.128/25, us-east-1b)
    EBS: 100GB gp3 (encrypted KMS)
    Role: Secondary
    Replica set: mallchain-rs
  
  MongoDB Node 3:
    Container/Instance: mongo-rs-3
    Port: 27019 (or 27017 if separate containers)
    Subnet: data-3 (10.0.3.192/26, us-east-1c)
    EBS: 100GB gp3 (encrypted KMS)
    Role: Secondary (Arbiter optionally)
    Replica set: mallchain-rs

Replica Set Configuration:
  Name: mallchain-rs
  Oplog size: 1024MB (default)
  Write concern: { w: "majority", j: true } (durable writes)
  Read preference: primaryPreferred (read from primary, fall back to secondary)

Storage:
  Engine: WiredTiger
  Cache size: 1.5GB per node (adjustable)
  Compression: snappy (default)

Authentication:
  Authentication: SCRAM-SHA-256
  Master username: admin
  Master password: From Secrets Manager
  App user: mallchain_app (limited permissions)

Networking:
  Security group: data-sg (restricted to backend-sg)
  Port 27017: Restricted to backend EC2 only
  Internal replication: Between replica set members

Backup Strategy:
  Automated: Daily mongodump to S3
  Manual: Before major updates
  Retention: 7 days
  Point-in-time: Oplog-based (custom scripts)

Health checks:
  Replica set status: mongo admin --eval 'rs.status()'
  Oplog space: Monitored (alert if < 20% free)
  Replication lag: Alert if > 5 seconds

Migration to DocumentDB (future):
  1. Full audit of backend MongoDB operations (transactions, change streams)
  2. Testing in staging environment
  3. Connection string change (TLS, endpoint format)
  4. Gradual migration with fallback plan
```

---

## M. REDIS PLACEMENT

### AWS ElastiCache Redis (Managed, Recommended)

```yaml
Cluster Name: mallchain-redis
Engine: Redis 7.0
Cluster mode: Enabled (3 shards recommended)
Nodes per shard: 1 primary + 1 replica = 3 total nodes
Node type: cache.r6g.xlarge (4 vCPU, 25.55GB RAM)

Placement:
  Multi-AZ: Enabled
  Automatic failover: Enabled
  Subnets: data-1, data-2, data-3 (10.0.3.x)
  Security group: data-sg (restricted to backend-sg)

Configuration:
  Port: 6379
  AUTH token: 32-char random (from Secrets Manager)
  TLS: Enabled (in-transit encryption)
  Encryption at-rest: Enabled (KMS)
  
  Parameters:
    maxmemory: 21GB (85% of 25.55GB node size)
    maxmemory-policy: allkeys-lru
    timeout: 300 seconds
    tcp-keepalive: 300

Persistence:
  RDB snapshots: Daily at 3:00 AM UTC
  AOF (append-only file): Optional (performance vs durability trade-off)
  Backup retention: Automated (7 days)

Monitoring:
  Metrics: CPU, memory, network, evictions
  CloudWatch integration: Native
  Alarms:
    - Memory utilization > 80%
    - Evictions > 1000/sec
    - Replication lag > 10ms

Performance:
  Throughput: ~500K requests/sec (typical for this node type)
  Latency: <1ms p99
  Network bandwidth: 10 Gbps (shared across cluster)

Connection:
  Endpoint: mallchain-redis.ABC123.cache.amazonaws.com:6379
  AUTH: redis://AUTH_TOKEN@mallchain-redis...:6379
  Cluster discovery: Automatic (endpoints API)
```

---

## N. BACKEND PLACEMENT & ARCHITECTURE

### Backend Container Configuration (docker-compose on EC2)

```yaml
Backend Container:
  Image: ghcr.io/mallchain/backend:latest
  Port: 4000 (internal, exposed to ALB via security group)
  Restart: always
  
  Environment variables:
    NODE_ENV: production
    PORT: 4000
    
    # Blockchain
    CHAIN_ID: mallchain-1
    CHAIN_PREFIX: mall
    CHAIN_RPC: http://validator:26657 (internal to validator)
    CHAIN_REST: http://validator:1317 (internal to validator)
    GAS_PRICE: 0.01stake
    
    # Databases
    MONGO_URI: mongodb://mallchain_app:PASSWORD@mongo-rs-1:27017,mongo-rs-2:27018,mongo-rs-3:27019/marketplace?authSource=admin&replicaSet=mallchain-rs
    REDIS_HOST: mallchain-redis.ABC123.cache.amazonaws.com
    REDIS_PORT: 6379
    REDIS_AUTH: ${REDIS_AUTH_TOKEN}
    
    # Networking
    CORS_ORIGINS: https://app.mallchain.network
    FRONTEND_URL: https://app.mallchain.network
    TRUST_PROXY: 10.0.0.0/16 (ALB internal IP range)
    
    # Secrets (from Secrets Manager)
    JWT_SECRET: ${backend/jwt-secret}
    SESSION_SECRET: ${backend/session-secret}
    ADMIN_API_KEY: ${backend/admin-api-key}
    PAYMENT_WEBHOOK_SECRET: ${backend/payment-webhook-secret}
    FIELD_ENCRYPTION_KEY: ${backend/field-encryption-key}
    FIELD_BLIND_INDEX_KEY: ${backend/field-blind-index-key}
    
    # Wallet
    OPERATOR_MNEMONIC: ${blockchain/operator-mnemonic}
    ALLOW_OPERATOR_MNEMONIC: false (recommended; requires browser signing)
    FAUCET_ENABLED: false (for mainnet; true for testnet)
    
    # Vault
    VAULT_ADDR: http://localhost:8200
    VAULT_TOKEN: ${VAULT_TOKEN}
    
    # Logging
    LOG_LEVEL: info

  Health check:
    Test: GET http://localhost:4000/api/health
    Interval: 30s
    Timeout: 5s
    Retries: 3
    Start period: 30s

  Resources:
    CPU: 2 cores (soft), 4 cores (hard limit)
    Memory: 1GB (soft), 2GB (hard limit)

  Volumes:
    - backend-logs:/app/logs

Connectivity:
  Inbound: ALB → backend:4000 (security group restricted)
  Outbound:
    - MongoDB: backend → mongo-rs-1:27017, etc.
    - Redis: backend → mallchain-redis:6379
    - Validator: backend → validator:26657 (internal RPC)
    - External APIs: backend → 0.0.0.0/0 (if needed)

Scaling:
  Replicas: 1-2 per ALB target group
  Load balancing: Round-robin
  Connection draining: 30s
```

---

## O. V14 FRONTEND PLACEMENT & ARCHITECTURE

### Frontend Serving (docker-compose on EC2)

```yaml
Frontend Container:
  Image: ghcr.io/mallchain/frontend:latest (pre-built dist/ or nginx)
  Port: 80 (internal, nginx proxies to 443 externally)
  Restart: always
  
  Environment variables (at build time):
    VITE_API_BASE_URL: https://api.mallchain.network
    VITE_CHAIN_ID: mallchain-1
    VITE_CHAIN_PREFIX: mall
    VITE_GAS_PRICE: 0.01stake
    VITE_NETWORK: mainnet (or testnet)
    VITE_SESSION_TTL: 120
  
  Health check:
    Test: GET http://localhost/index.html
    Interval: 30s
    Timeout: 5s
    Retries: 3

  Caching:
    Static assets (.js, .css): Cache-Control: max-age=31536000 (1 year, hash-busted)
    HTML (index.html): Cache-Control: no-cache (always revalidate)
    Images: Cache-Control: max-age=86400 (1 day)

  Resources:
    CPU: 0.5 cores (soft), 1 core (hard)
    Memory: 256MB (soft), 512MB (hard)

  Volumes:
    - frontend-dist:/usr/share/nginx/html (or equivalent)

Connectivity:
  Inbound: ALB → frontend:80
  Outbound: None (static files)

Routing:
  nginx rule: Host: app.mallchain.network → frontend:80
  ALB target group: mallchain-frontend-targets
```

---

## P. RPC PROXY ARCHITECTURE

### RPC Gateway (nginx proxy container on backend EC2)

```yaml
Purpose: Proxy public RPC requests to private validator
Architecture: Separate nginx container (or collocated with backend)

Container: nginx:latest (RPC proxy only, not serving static files)
Port: 26657 (receives HTTPS from NLB via TLS termination)
Internal upstream: validator:26657 (localhost, private network)

nginx Configuration (deploy/nginx/conf.d/rpc.conf):

  upstream validator_rpc {
    server validator:26657;
    keepalive 100;
  }

  upstream validator_rest {
    server validator:1317;
    keepalive 100;
  }

  limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=10r/s;
  limit_req_zone $binary_remote_addr zone=rest_limit:10m rate=10r/s;

  server {
    listen 26657;
    server_name _;

    location / {
      limit_req zone=rpc_limit burst=10 nodelay;
      proxy_pass http://validator_rpc;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_read_timeout 30s;
      proxy_connect_timeout 5s;
    }
  }

  server {
    listen 1317;
    server_name _;

    location / {
      limit_req zone=rest_limit burst=50 nodelay;
      proxy_pass http://validator_rest;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_read_timeout 30s;
      proxy_connect_timeout 5s;
    }
  }

Traffic flow:
  Public internet
    ↓
  NLB (TLS termination, 443 → 26657/1317 internal)
    ↓
  RPC gateway container (port 26657/1317)
    ↓
  Rate limiting (nginx limit_req)
    ↓
  Validator internal RPC (127.0.0.1:26657 or 10.0.4.x:26657)

Security:
  Validator RPC NOT exposed directly to 0.0.0.0
  Rate limiting: 10 req/s per IP (prevents abuse)
  Connection pooling: 100 connections to upstream
  Timeout: 30s read/write
```

---

## Q. VALIDATOR NETWORKING

### Validator EC2 Network Architecture

```
┌─ VALIDATOR EC2 (Private Subnet 10.0.4.x) ──────┐
│                                                 │
│  ┌─ Docker Container ─────────────────────┐   │
│  │ Mallchain Validator Node                │   │
│  │                                          │   │
│  │  Port 26657 (RPC):                      │   │
│  │  • Binding: 127.0.0.1:26657            │   │
│  │  • Access: localhost only               │   │
│  │  • Backend: curl http://127.0.0.1:26657│   │
│  │                                          │   │
│  │  Port 1317 (REST):                      │   │
│  │  • Binding: 127.0.0.1:1317             │   │
│  │  • Access: localhost only               │   │
│  │  • Not exposed to RPC proxy directly    │   │
│  │                                          │   │
│  │  Port 26656 (P2P):                      │   │
│  │  • Binding: 0.0.0.0:26656              │   │
│  │  • Access: To validator peers (public) │   │
│  │  • Used for consensus voting            │   │
│  │                                          │   │
│  │  Port 26660 (Prometheus metrics):       │   │
│  │  • Binding: 0.0.0.0:26660              │   │
│  │  • Access: Internal monitoring          │   │
│  │  • Source: 10.0.0.0/16 (VPC internal) │   │
│  └──────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘

Outbound connections:
  Port 26656 → External validator peers (port 26656)
  Port 443 → AWS CloudWatch, Secrets Manager
  Port 53 → DNS queries

Inbound connections (from inside VPC):
  Port 26657 (RPC): From backend container (127.0.0.1 via docker bridge)
  Port 1317 (REST): From backend container (127.0.0.1 via docker bridge)
  Port 26656 (P2P): From other validators (port 26656)
  Port 26660 (metrics): From Prometheus (10.0.2.x, 10.0.3.x)

Inbound connections (from internet): NONE
  • No public IP
  • No direct internet routing
  • RPC/REST only accessible via NLB → RPC gateway

Monitoring:
  CloudWatch agent on validator EC2
  Custom metrics: Block height, validator status, consensus rounds
  Logs: docker logs → CloudWatch
```

---

## R. BACKUP STRATEGY

### Comprehensive Backup Plan

```
VALIDATOR STATE (blockchain data):
  
  EBS snapshots:
    Schedule: Daily at 2:00 AM UTC
    Retention: 7 days automatic (rolling window)
    Encryption: KMS (aws/ebs)
    Cost: ~$0.05/GB/month
    
    Restore procedure:
      1. Create new volume from snapshot
      2. Attach to new/existing EC2 instance
      3. Mount /home/marketplaced/.marketplaced
      4. Start validator (catches up from peers)
      5. Verify block height matches current tip
  
  S3 export (long-term archive):
    Schedule: Weekly state export
    Frequency: Sunday 3:00 AM UTC
    Retention: 30 days (or indefinitely, as needed)
    Encryption: KMS
    Method: AWS Backup service or custom snapshot export
    
    Disaster recovery:
      1. Download from S3
      2. Restore to new EBS volume
      3. Recover validator state (1-5 minutes)

MONGODB DATA:

  Docker volume backups:
    Schedule: Daily mongodump at 2:00 AM UTC
    Target: S3 bucket (mallchain-backups/mongodb/)
    Retention: 7 days
    
    Restore:
      1. Download mongodump from S3
      2. mongorestore to replica set
      3. Verify data integrity (query counts)
  
  ElastiCache Redis:
    Schedule: Automatic daily snapshots (3:00 AM UTC)
    Target: S3 (automatic export)
    Retention: 1 day (managed by ElastiCache)
    Manual: Before major updates

CONFIGURATION & SECRETS:

  Terraform state:
    Backend: S3 (mallchain-terraform-state)
    Locking: DynamoDB (mallchain-terraform-lock)
    Encryption: AES-256 (KMS)
    Versioning: Enabled (30 versions)
    Replication: Cross-region optional
  
  Secrets:
    AWS Secrets Manager: Versions retained (5 versions)
    Rotation: Automatic on schedule
    Audit: CloudTrail logs all access

LOGS & MONITORING:

  CloudWatch logs:
    Backend logs: 30-day retention
    Validator logs: 30-day retention
    Export to S3: Daily export (long-term archive)
    Archival: S3 Glacier after 90 days

BACKUP RESTORATION PROCEDURE:

  Scenario 1: Single MongoDB node failure
    1. Replica set automatically fails over to secondary
    2. Recovery time: < 1 minute
    3. Data loss: 0

  Scenario 2: All MongoDB nodes fail
    1. Restore from daily mongodump (S3)
    2. Bring up new replica set
    3. Connect backend
    4. Verify data integrity
    5. Time to recovery: 30 minutes
    6. Data loss: < 1 hour (since last dump)

  Scenario 3: Validator blockchain state corrupted
    1. Stop validator
    2. Restore EBS from snapshot (< 5 minutes)
    3. Start validator (catches up from peers, 5-30 min)
    4. Verify block height and consensus
    5. Time to recovery: 5-30 minutes
    6. Data loss: 0 (state is immutable from peers)

  Scenario 4: Entire region unavailable
    1. Restore Terraform in secondary region (AWS region failover)
    2. Restore databases from cross-region backups
    3. Deploy new validator (join network)
    4. Time to recovery: 2-4 hours
    5. Data loss: < 1 hour
```

---

## S. MONITORING & OBSERVABILITY

### CloudWatch Integration

```yaml
Log Groups:

  /aws/backend/api:
    Source: Backend container stdout/stderr
    Retention: 30 days
    Retention policy: Automatic expiration
  
  /aws/backend/blockchain-sync:
    Source: Blockchain node logs
    Retention: 30 days
  
  /aws/frontend/access:
    Source: nginx access logs
    Retention: 7 days
  
  /aws/validator/consensus:
    Source: Validator process logs
    Retention: 30 days

Metrics (Custom):

  backend/requests:
    Unit: Count
    Period: 1 minute
    Dimensions: [method, path, status_code]
    Alert: > 1000 req/min

  backend/latency:
    Unit: Milliseconds
    Period: 1 minute
    Dimensions: [method, path]
    Percentiles: p50, p95, p99
    Alert: p99 > 500ms

  validator/block-height:
    Unit: Count (blocks)
    Period: 10 seconds
    Alert: No new blocks > 5 minutes

  validator/validator-status:
    Unit: Boolean (0=down, 1=up)
    Period: 30 seconds
    Alert: Status == 0

  database/connections:
    Unit: Count
    Period: 1 minute
    Alert: > 90

  redis/memory-usage:
    Unit: Bytes
    Period: 1 minute
    Alert: > 80% of max

  blockchain/transaction-count:
    Unit: Count
    Period: 5 minutes
    Dimensions: [status]

Dashboards:

  Main dashboard (app-health):
    • Backend health status
    • API request rate
    • Error rate (5xx count)
    • Latency (p50, p95, p99)
    • Database connections
    • Redis memory usage
    • Validator block height
    • Consensus rounds

  Validator dashboard:
    • Block height (trend)
    • Validator active/inactive status
    • P2P peer count
    • Consensus voting rounds
    • RPC request rate
    • REST request rate

Alarms:

  backend-health-failed:
    Metric: /api/health response != 200
    Threshold: 3 consecutive failures (3 minutes)
    Action: SNS → PagerDuty → On-call

  rpc-latency-high:
    Metric: RPC request latency p99
    Threshold: > 5 seconds
    Action: SNS → Slack #alerts

  validator-block-stalled:
    Metric: Block height unchanged
    Threshold: > 5 minutes
    Action: SNS → PagerDuty → On-call

  database-connection-pool-exhausted:
    Metric: Active connections
    Threshold: > 90
    Action: SNS → Slack #database-ops

  redis-memory-high:
    Metric: Memory usage
    Threshold: > 80%
    Action: SNS → Slack #cache-ops

  ebs-disk-space-low:
    Metric: Validator EBS available space
    Threshold: < 20%
    Action: SNS → PagerDuty

Integration:

  SNS topics:
    mallchain-critical: → PagerDuty (urgent)
    mallchain-warning: → Slack #ops-alerts
    mallchain-info: → CloudWatch logs only

  PagerDuty:
    On-call schedule: 24/7 rotation
    Escalation: After 15 minutes, escalate to team lead
    Resolution: Auto-resolve after 15 minutes success

  Slack:
    Channel #mallchain-prod: Warnings, info
    Channel #mallchain-critical: Critical only (alarms)
```

---

## T. DISASTER RECOVERY

### RTO/RPO Targets

```
RTO (Recovery Time Objective):

  Single service failure (backend):
    Target: 2 minutes
    Method: ALB auto-scales or failover to secondary instance
    Actual: ~1-2 minutes (automatic)

  Database failure (MongoDB):
    Target: 5 minutes
    Method: Replica set failover or restore from backup
    Actual: < 1 minute (failover) or 30 min (restore)

  Validator failure:
    Target: 15 minutes
    Method: EBS snapshot restore + blockchain catchup
    Actual: 5-30 minutes

  Regional outage (entire AWS region):
    Target: 4 hours
    Method: Failover to secondary region (manual)
    Actual: 2-4 hours (Terraform apply + data restore)

RPO (Recovery Point Objective):

  Backend/Frontend: 0 (stateless, no data loss)
  MongoDB: < 1 hour (daily backups, point-in-time via oplog)
  Redis: < 1 hour (daily snapshots, or seconds with AOF)
  Validator blockchain: 0 (immutable state from peers)
  Configuration: < 1 day (Terraform state versioned)

FAILOVER PROCEDURES:

  Scenario A: Single backend EC2 failure
    1. ALB detects unhealthy target (30s)
    2. Route traffic to secondary EC2 instance (automatic)
    3. Failed instance: Terminate, launch replacement
    4. RTO: ~2 minutes
    5. No data loss

  Scenario B: Backend AND secondary fail
    1. ALB has no healthy targets
    2. Notifications → on-call engineer
    3. Action: Launch new EC2 instance
    4. Restore from Terraform (docker-compose)
    5. Attach EBS volumes (configs, logs)
    6. RTO: ~15 minutes

  Scenario C: MongoDB primary node fails
    1. Replica set detects primary down (5-10 sec)
    2. Secondary promoted to primary (automatic)
    3. Former secondary becomes new secondary
    4. RTO: < 1 minute
    5. Data loss: 0

  Scenario D: All MongoDB nodes fail
    1. Alert: Replica set unreachable
    2. Action: Restore from backup (mongodump in S3)
    3. Spin up new MongoDB replica set
    4. Restore data from backup
    5. Connect backend
    6. RTO: ~30 minutes
    7. Data loss: < 1 hour

  Scenario E: Validator node fails
    1. Block production pauses (no signatures from this validator)
    2. Alert: Validator down
    3. Action: Restore from EBS snapshot
    4. Restart validator (catches up from peers)
    5. RTO: 5-30 minutes
    6. Data loss: 0

  Scenario F: Entire region unavailable
    1. Route 53 detects regional outage (health checks fail)
    2. Option A: Manual failover to secondary region
      - Restore Terraform infrastructure (new region)
      - Restore databases from cross-region backups
      - Update DNS to secondary region
      - RTO: 2-4 hours
    3. Option B: Accept downtime until region recovers
      - Wait for AWS regional recovery
      - Activate alternate validator in new region

RUNBOOKS:

  Runbook A: Backend EC2 failure
    1. SSH to secondary instance (or new instance if both down)
    2. docker ps (verify containers running)
    3. docker logs backend (check for errors)
    4. curl http://localhost:4000/api/health (verify)
    5. If all failed: Restore from Terraform

  Runbook B: MongoDB failure
    1. Check replica set status: mongo --eval 'rs.status()'
    2. If primary down: Wait for automatic failover
    3. If all nodes down: Restore from S3 backup (mongorestore)
    4. Verify collections: show dbs; db.collection.count()

  Runbook C: Validator failure
    1. Check validator status: docker logs chain-sentry
    2. Check block height: curl http://127.0.0.1:26657/status
    3. If stuck: Stop container, restore EBS snapshot
    4. Restart: docker run (or systemd)
    5. Monitor: curl http://127.0.0.1:26657/status (block height increasing)

  Runbook D: Regional failover
    1. Confirm region is actually down (multiple checks)
    2. Provision backup region via Terraform
    3. Restore databases (RDS snapshot, S3 backup)
    4. Update Route 53 DNS to new region
    5. Monitor traffic and metrics
```

---

## U. DEPLOYMENT ORDER

### Phase 1: VPC & Networking (Day 1)

```
1. Create VPC (10.0.0.0/16)
2. Create subnets (public, app, data, validator)
3. Create Internet Gateway + attach to VPC
4. Create NAT Gateway in public subnet
5. Create route tables (public, private)
6. Update private route table → NAT Gateway
7. Verify: VPC and all subnets created
```

### Phase 2: Security Groups (Day 1)

```
1. Create alb-sg (ALB, ports 80/443)
2. Create backend-sg (backend EC2, ports 4000, 8200, etc.)
3. Create data-sg (MongoDB/Redis, ports 27017, 6379)
4. Create validator-sg (validator EC2, ports 26657, 26656)
5. Create nlb-rpc-sg (NLB, ports 26657, 1317)
6. Configure ingress/egress for each
7. Verify: All security groups created with rules
```

### Phase 3: KMS Encryption Keys (Day 1)

```
1. Create KMS key for EBS encryption (aws/ebs)
2. Create KMS key for secrets (aws/secretsmanager)
3. Create KMS key for S3 backups
4. Create aliases (mallchain-vault-key, mallchain-data-key, etc.)
5. Verify: Keys are created and enabled
```

### Phase 4: Secrets Manager (Day 1)

```
1. Generate secrets: openssl rand -hex 32 (12 secrets)
2. Create secret: backend/jwt-secret
3. Create secret: backend/session-secret
4. Create secret: backend/admin-api-key
5. ... (repeat for all 12)
6. Verify: All secrets retrievable via console
```

### Phase 5: IAM Roles & Policies (Day 2)

```
1. Create EC2 instance profile (backend role)
2. Attach policy: Secrets Manager read access
3. Attach policy: CloudWatch logs write access
4. Attach policy: S3 backup bucket access
5. Create EC2 instance profile (validator role)
6. Attach same policies (for monitoring)
7. Verify: Roles created and policies attached
```

### Phase 6: RDS/ElastiCache (Day 2)

```
1. Create MongoDB subnet group (3 subnets)
2. Create MongoDB replica set (3 nodes, db.r6g.large)
3. Monitor: Replica set formation (~15 minutes)
4. Create ElastiCache subnet group (3 subnets)
5. Create Redis cluster (cache.r6g.xlarge)
6. Monitor: Cluster formation (~10 minutes)
7. Verify: Both services responding to queries
```

### Phase 7: ACM Certificates (Day 2)

```
1. Request certificate in ACM: *.mallchain.network
2. Add SANs: mallchain.network, app.*, api.*, rpc.*, rest.*
3. Choose DNS validation (Route 53 integration)
4. Create CNAME records in Route 53
5. Monitor: Certificate status (should be issued within 5-10 min)
6. Verify: Certificate issued and linked to Route 53
```

### Phase 8: Load Balancers (Day 2-3)

```
ALB:
1. Create ALB in public subnets
2. Add listener: 80 (redirect to 443)
3. Add listener: 443 (HTTPS, ACM cert)
4. Create target group: frontend (port 80)
5. Create target group: backend (port 4000)
6. Add routing rules (Host: app.*, api.*)
7. Configure health checks
8. Verify: ALB responding on HTTPS

NLB:
1. Create NLB in public subnets
2. Add listener: 26657 (TLS, ACM cert)
3. Add listener: 1317 (TLS, ACM cert)
4. Create target group: RPC (port 26657)
5. Create target group: REST (port 1317)
6. Verify: NLB responding on both ports
```

### Phase 9: DNS (Route 53) (Day 2-3)

```
1. Create hosted zone: mallchain.network
2. Create A record: app.* → ALB IP
3. Create A record: api.* → ALB IP
4. Create A record: rpc.* → NLB IP
5. Create A record: rest.* → NLB IP
6. Create CNAME: www.mallchain.network → mallchain.network
7. Update domain registrar nameservers to Route 53
8. Wait: DNS propagation (typically 24-48 hours)
9. Verify: nslookup app.mallchain.network (returns ALB IP)
```

### Phase 10: EC2 Instances (Day 3)

```
Backend EC2:
1. Launch t3.xlarge in app subnet
2. Attach security group: backend-sg
3. Attach IAM role: backend-role
4. Add EBS volume: 100GB gp3 (encrypted)
5. Assign private IP: 10.0.2.x
6. Set DNS name: mallchain-backend-1 (internal Route 53)
7. Verify: Instance running, can SSH

Validator EC2:
1. Launch t3.2xlarge in validator subnet
2. Attach security group: validator-sg
3. Attach IAM role: validator-role
4. Add EBS volume: 500GB gp3 (encrypted)
5. Assign private IP: 10.0.4.x
6. Set DNS name: mallchain-validator-1 (internal Route 53)
7. Verify: Instance running, can SSH

Optional Failover EC2:
1. Launch second backend t3.xlarge (mirror of first)
2. Configure identical to primary
3. Add to ALB target group
4. Verify: Both instances healthy in ALB
```

### Phase 11: Docker Compose Deployment (Day 3-4)

```
Backend EC2 (docker-compose):
1. SSH to instance
2. Clone repo: git clone https://github.com/...
3. cd infra/docker-compose.prod.yml
4. Create secrets directory: secrets/
5. Add secrets files (from Secrets Manager)
6. Edit .env file (CHAIN_RPC, MONGO_URI, REDIS_HOST, etc.)
7. docker-compose up -d
8. Monitor: docker-compose logs (wait for services to start)
9. Verify: Backend health: curl http://localhost:4000/api/health
10. Verify: Frontend: curl http://localhost/

Validator EC2:
1. SSH to instance
2. Clone repo
3. Create directory: /home/marketplaced/.marketplaced
4. docker run --detach --restart always ... (or docker-compose single service)
5. Monitor: docker logs chain-sentry
6. Wait: Validator syncs blockchain (5-30 minutes depending on chain height)
7. Verify: curl http://localhost:26657/status (block height increasing)
```

### Phase 12: ALB Target Registration (Day 4)

```
1. Register backend EC2 instances to ALB target groups
2. Target group 1 (frontend): mallchain-backend-1:80, mallchain-backend-2:80
3. Target group 2 (backend): mallchain-backend-1:4000, mallchain-backend-2:4000
4. Wait: Health checks pass (2-3 minutes)
5. Verify: ALB targets showing "healthy"
```

### Phase 13: NLB Target Registration (Day 4)

```
1. Register RPC gateway to NLB target groups
2. Target group 1 (RPC): mallchain-backend-1:26657 (nginx proxy)
3. Target group 2 (REST): mallchain-backend-1:1317 (nginx proxy)
4. Wait: Health checks pass
5. Verify: NLB targets showing "healthy"
```

### Phase 14: End-to-End Testing (Day 4-5)

```
Frontend test:
1. Open browser: https://app.mallchain.network
2. Verify: Page loads, no errors
3. Sign up: Create test account
4. Login: Test authentication flow
5. Check: Wallet displays balance

Backend test:
1. curl https://api.mallchain.network/api/health
2. Verify: Response { status: "ok" }
3. curl https://api.mallchain.network/api/wallet/{address}
4. Verify: Wallet data returned

RPC test:
1. curl https://rpc.mallchain.network -X POST -d '{"jsonrpc":"2.0","id":1,"method":"status"}'
2. Verify: Block height, validator info
3. curl https://rest.mallchain.network/cosmos/base/tendermint/v1beta1/blocks/latest
4. Verify: Latest block data

Monitoring test:
1. Check CloudWatch logs (backend, validator)
2. Check CloudWatch metrics (API latency, block height)
3. Check Grafana dashboard (if configured)
4. Check alerts (send test alert to PagerDuty)

Backup test:
1. Trigger EBS snapshot (manual)
2. Verify: Snapshot appears in AWS console
3. Verify: MongoDB backup to S3
```

### Phase 15: Security Hardening (Day 5)

```
1. Review all security groups (no overly permissive rules)
2. Enable VPC Flow Logs (for troubleshooting)
3. Enable CloudTrail (audit trail)
4. Review IAM policies (least privilege)
5. Rotate all secrets (ensure fresh values)
6. Update .env files (no dev values remaining)
7. Enable MFA for AWS console access
8. Document access procedures (SSH, bastion, etc.)
```

### Phase 16: Monitoring & Alerting Setup (Day 5)

```
1. Create CloudWatch alarms (backend health, validator, database)
2. Create SNS topics (critical, warning, info)
3. Subscribe to PagerDuty
4. Subscribe to Slack
5. Test alarms (send test notifications)
6. Create Grafana dashboards
7. Set up Prometheus scraping (if using custom metrics)
8. Verify: All alerts functioning
```

### Phase 17: Documentation & Runbooks (Day 5-6)

```
1. Document VPC architecture (CIDR ranges, subnets, routing)
2. Document security groups (all ingress/egress rules)
3. Document failover procedures (what to do if X fails)
4. Document access procedures (SSH, console, bastion)
5. Document monitoring setup (how to check alerts)
6. Create runbooks (step-by-step recovery procedures)
7. Share with team, collect feedback
```

### Phase 18: Launch & Post-Launch (Day 6-7)

```
Pre-launch checklist:
1. All tests passing
2. Backups tested and verified
3. Monitoring active
4. Team trained on operations
5. Communications ready

Launch:
1. Make public announcement
2. Monitor closely (first 24 hours)
3. Respond to issues quickly
4. Collect feedback

Post-launch:
1. Optimize resources based on traffic
2. Fine-tune alarms (reduce false positives)
3. Document lessons learned
4. Plan security audit
5. Plan load testing
```

---

## TRAFFIC FLOW DIAGRAMS

### Product 1: Mallchain V14 (Web OS)

```
Browser (User)
  ↓ HTTPS
  ↓ (Client initiates TLS handshake with ALB)
  ↓
Internet
  ↓
ALB (app.mallchain.network:443)
  ↓ TLS termination
  ↓ Host-based routing (Host: app.mallchain.network)
  ↓
Target group: frontend-targets
  ↓
Backend EC2 (10.0.2.x:80)
  ↓ nginx container
  ↓ (serves static dist/ files)
  ↓
Browser receives HTML/JS/CSS

User authentication flow:
1. User fills login form
2. Browser → POST https://api.mallchain.network/auth/login
3. ALB routes to backend target group
4. Backend EC2 (10.0.2.x:4000)
5. Backend queries MongoDB (10.0.3.x:27017)
6. Backend returns JWT token
7. Browser stores token
8. Browser can now access authenticated endpoints

Wallet balance display:
1. Browser loaded (frontend already cached session)
2. Frontend calls: GET https://api.mallchain.network/api/wallet/{address}
3. Backend routes request
4. Backend queries validator (10.0.4.x:26657, internal only)
5. Backend returns balance data
6. Frontend displays balance
```

### Product 2: Independent Mallchain App

```
Mallchain App (standalone wallet)
  ↓ HTTPS RPC query
  ↓ (App initiates TLS)
  ↓
Internet
  ↓
NLB (rpc.mallchain.network:443)
  ↓ TLS termination
  ↓ TCP routing (port 26657)
  ↓
Target group: rpc-targets
  ↓
Backend EC2 (10.0.2.x:26657)
  ↓ nginx RPC proxy container
  ↓ Rate limiting (10 req/sec)
  ↓ Connection pooling
  ↓
Validator EC2 (10.0.4.x:26657, internal RPC)
  ↓ Blockchain processes request
  ↓ Returns status, blocks, etc.
  ↓
Response flows back through proxy → NLB → App

Example query:
1. Mallchain App: GET https://rpc.mallchain.network/status
2. NLB receives request (client IP, random port, dest port 26657)
3. NLB proxies to rpc-gateway:26657
4. nginx proxy rate-limits, then:
5. nginx: proxy_pass http://validator:26657
6. Validator responds with block height, validator set, etc.
7. Response: { "jsonrpc": "2.0", "result": { "sync_info": { "latest_block_height": "40375" } } }
8. NLB returns response to app

Send transaction:
1. Mallchain App: POST https://rpc.mallchain.network (broadcast_tx_sync)
2. NLB → rpc-gateway → validator
3. Validator broadcasts transaction to mempool
4. Returns tx hash (transaction queued)
5. App can query tx status via /tx/{hash} endpoint (also through RPC)
```

---

## FINAL DEPLOYMENT MODEL SUMMARY

This specification defines:

✅ **Compute**: EC2 for backend/frontend (docker-compose), dedicated EC2 for validator  
✅ **Networking**: VPC with public (ALB/NLB), private (app, data, validator) subnets  
✅ **Load Balancing**: ALB for web (frontend/API), NLB for RPC/REST  
✅ **Databases**: Self-managed MongoDB (proven, compatible), managed Redis (ElastiCache)  
✅ **TLS**: ACM certificates (*.mallchain.network) on both ALB and NLB  
✅ **Secrets**: AWS Secrets Manager with automatic rotation support  
✅ **Monitoring**: CloudWatch logs, metrics, alarms, SNS → PagerDuty/Slack  
✅ **Backup**: Daily EBS snapshots, MongoDB dumps to S3, cross-region replication  
✅ **Disaster Recovery**: RTO targets (2-30 min depending on failure type), runbooks documented  

**Two independent access paths**:
1. **V14**: Browser → ALB → backend → validator (authenticated via backend)
2. **Mallchain App**: Standalone wallet → NLB/RPC → validator (direct blockchain access, no backend dependency)

**Both products use the same sovereign Mallchain blockchain** running in private subnet, never exposed directly to Internet.

---

**Ready for architecture review and approval. NO PROVISIONING until this specification is confirmed correct.**

