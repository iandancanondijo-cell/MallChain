# Network Segmentation & VPC Architecture

## Overview

This document defines the multi-layer network segmentation strategy for the Mallchain blockchain marketplace platform, deployed on AWS with a 3-tier Virtual Private Cloud (VPC) topology. Segmentation operates at four independent enforcement layers: VPC subnets with Network Access Control Lists (NACLs), instance-level Security Groups (SGs), VPC endpoints for AWS-managed services, and Kubernetes NetworkPolicies at the pod level. Together these enforce a zero-trust "least privilege by default" posture so that a compromise in any single component cannot traverse laterally to data-tier assets or cross-region infrastructure.

The reference Terraform implementation lives in `infra/terraform/vpc.tf`. The Kubernetes-layer enforcement is codified in `infra/k8s/30-network-policies.yaml`. Changes to IP space, tier boundaries, or allow-listed ports MUST be reflected in both files, plus the Security Group matrix below, and peer-reviewed per the SECURITY.md change control process.

---

## 1. Three-Tier VPC Topology

### VPC CIDR and High-Level Layout

| Layer          | CIDR Block        | Usable IPs | Default Route          | Purpose                                                        |
|----------------|-------------------|------------|------------------------|----------------------------------------------------------------|
| VPC root       | `10.20.0.0/16`    | 65,536     | —                      | Entire Mallchain production enclave (single region).          |
| Public Tier    | `10.20.1.0/24`    | 251        | `0.0.0.0/0` via IGW    | Internet-facing edge only. No application workloads here.     |
| App Tier       | `10.20.10.0/23`   | 510        | NAT Gateway(s)         | Backend pods, frontend pods, chain sentry, observability.     |
| Data Tier      | `10.20.20.0/24`   | 251        | VPC endpoints + egress | MongoDB, Redis, Cosmos validator, Postgres Explorer DB.       |

All subnets are provisioned across a minimum of three Availability Zones (see section 7 — Cross-AZ Topology). The App Tier uses a `/23` to give headroom for EKS node groups, horizontal pod autoscaling, and transient Canary deployments. The Data Tier is intentionally a `/24` because stateful sets grow slowly and a smaller broadcast domain reduces blast radius for any misconfigured broadcast/multicast traffic from databases.

### Public Subnet — 10.20.1.0/24

The public subnet is the only place where the VPC has a direct Internet Gateway (IGW) attachment. Resources deployed here:

- **Application Load Balancer (ALB):** Terminates TLS (certificates issued by AWS ACM and pinned in the Terraform `eks.tf` module), hosts the Cloudflare origin IP allow-list on its listener Security Group, and forwards valid HTTPS traffic to the backend/frontend NodePort services in the App Tier. The ALB has no management interfaces on the public subnet; its control plane is reached via AWS API only.
- **NAT Gateway(s):** One NAT Gateway per AZ in production (`single_nat_gateway = false` in `infra/terraform/vpc.tf:19`), shared NAT in staging for cost. These are the *only* path the App Tier uses to reach the public Internet, which means all outbound connections from pods are source-NATted behind the managed NAT public IPs. This gives us a single, auditable egress point for third-party integrations (Safaricom M-Pesa, AML provider, etc.).
- **Cloudflare Origin Target:** The ALB's public DNS A-record is only advertised through Cloudflare. Direct-to-IP traffic hitting the ALB is dropped by a combination of Cloudflare proxy orange-clouding, the ALB listener's Cloudflare IP prefix allow-list, and the edge WAF (see section 6). Nothing except Cloudflare and the AWS internal health-check plane is expected to talk to the ALB on 443.

**Explicitly NOT deployed in the public subnet:** No EC2 instances. No SSH jump boxes. No Kubernetes nodes. No RDS or ElastiCache replicas. Every single compute and data workload lives in private subnets.

### Private App Subnet — 10.20.10.0/23

The App Tier is where EKS worker nodes live. Resources:

- **Backend API pods (`backend` Deployment, `infra/k8s/10-backend.yaml`):** Node.js API servers authenticated via JWT and API keys. Talk to Mongo, Redis, Cosmos RPC, and Vault.
- **Frontend static pods (`mallchain-os-v14` Deployment, `infra/k8s/12-frontend.yaml`):** Nginx-served SPA build; only ingress path is ALB → frontend Service on 80/443. Outbound from frontend pods is restricted to the same-app backend API only (no arbitrary client-side egress; browser-origin requests are not pod egress).
- **Chain Sentry nodes:** Non-validating Cosmos full nodes that peer with the Cosmos validator in the Data Tier and expose an RPC endpoint (26657) for the backend API. Sentry nodes are intentionally in the App Tier so they can talk to upstream seed nodes on the public Internet via NAT, while the validator itself never has outbound-initiated Internet access.
- **Observability stack:** Prometheus (scrapes pod metrics via node-exporter and Cosmos exporter) and Grafana (dashboards). Prometheus scrapes are restricted by NetworkPolicy; only Prometheus → pod:metrics-port is allowed.
- **Marketplace operator / auxiliary services:** `marketplaced` daemon, treasury socket, block listener, price engine, wallet sync. All live in the App Tier and only talk to data-tier services via explicitly pinned port rules.

Egress from the App Tier is NAT-gated. There is no direct IGW route from any /23 subnet, which means even a compromised pod that opens a raw TCP socket must traverse the NAT — giving VPC Flow Logs visibility at the single public IP layer and allowing SIEM correlation against the NAT's public ENI.

### Private Data Subnet — 10.20.20.0/24

The Data Tier is the most restrictive subnet. It has **no default route to 0.0.0.0/0** — instead it uses a combination of VPC endpoints (section 4) and a tightly scoped egress Security Group/NACL. Resources:

- **MongoDB Replica Set (statefulset):** Three-member replica set (one per AZ). Primary/secondary election traffic stays inside the Data Tier on 27017; arbiters are not used because three members already provide quorum. Only the App Tier backend SG is allowed inbound.
- **Redis Cluster / Sentinel:** In-memory cache layer for session tokens, rate-limit counters, lock keys, and wallet nonce caches. 6379 client port, plus 16379 for cluster bus if running cluster mode.
- **Cosmos Validator StatefulSet:** The Tendermint/CometBFT validator signing node. This is the most sensitive workload in the entire VPC. Inbound is restricted to Cosmos P2P from App Tier sentry nodes and App Tier backend RPC. The validator itself is configured with `pex=false` and only dials the in-VPC sentry nodes; it never dials the public Internet.
- **Postgres — Explorer Database:** Relational store for the block explorer backend. 5432 only, from explorer backend pods exclusively.

No resources in the Data Tier have public IPs. No NAT route exists out of the Data Tier; any AWS service that the data tier needs to talk to (S3 for backup, Secrets Manager for key material, ECR for image pulls on non-EKS nodes, STS for assume-role) is reached via interface or gateway VPC endpoints pinned to the data-tier route table.

---

## 2. Network Access Control Lists (NACLs)

NACLs operate at the subnet boundary and are stateless — inbound and outbound rules are specified separately. They are a defense-in-depth layer *under* Security Groups, not a replacement. Order of rule evaluation is numerical; lower rule numbers win.

### Public Subnet NACL (10.20.1.0/24)

| Direction | Rule # | Type        | Protocol | Port Range | Source           | Allow/Deny | Purpose                                              |
|-----------|--------|-------------|----------|------------|------------------|------------|------------------------------------------------------|
| Inbound   | 100    | HTTPS       | TCP      | 443        | Cloudflare IPv4s | Allow      | Edge TLS from Cloudflare → ALB                       |
| Inbound   | 110    | HTTP        | TCP      | 80         | Cloudflare IPv4s | Allow      | HTTP → 301 redirect to HTTPS on ALB                  |
| Inbound   | 120    | Ephemeral   | TCP      | 1024-65535 | 10.20.10.0/23    | Allow      | Return path: App Tier → ALB responses                |
| Inbound   | 200    | All traffic | All      | All        | 0.0.0.0/0        | Deny       | Implicit deny catch-all (default but re-stated)      |
| Outbound  | 100    | HTTPS/HTTP  | TCP      | 80,443     | 10.20.10.0/23    | Allow      | ALB → App Tier Services (ingress downstream)         |
| Outbound  | 110    | Ephemeral   | TCP      | 1024-65535 | Cloudflare IPv4s | Allow      | ALB return traffic back to Cloudflare edge          |
| Outbound  | 120    | HTTPS/HTTP  | TCP      | 80,443     | 0.0.0.0/0        | Allow      | NAT Gateway outbound (public Internet path)          |
| Outbound  | 200    | All traffic | All      | All        | 0.0.0.0/0        | Deny       | Catch-all deny                                       |

### App Tier NACL (10.20.10.0/23)

| Direction | Rule # | Type          | Protocol | Port Range | Source         | Allow/Deny | Purpose                                              |
|-----------|--------|---------------|----------|------------|----------------|------------|------------------------------------------------------|
| Inbound   | 100    | HTTPS/HTTP    | TCP      | 80,443     | 10.20.1.0/24   | Allow      | ALB → backend/frontend NodePort services            |
| Inbound   | 110    | Mongo         | TCP      | 27017      | 10.20.20.0/24  | Allow      | Mongo reply traffic (NACL stateless)                 |
| Inbound   | 120    | Redis         | TCP      | 6379,16379 | 10.20.20.0/24  | Allow      | Redis replies to App Tier requests                   |
| Inbound   | 130    | Postgres      | TCP      | 5432       | 10.20.20.0/24  | Allow      | Explorer Postgres reply traffic                      |
| Inbound   | 140    | Cosmos P2P    | TCP      | 26656      | 10.20.20.0/24  | Allow      | Validator ↔ Sentry P2P handshake replies             |
| Inbound   | 150    | Cosmos RPC    | TCP      | 26657      | 10.20.20.0/24  | Allow      | Validator RPC responses to backend                   |
| Inbound   | 160    | Ephemeral     | TCP      | 1024-65535 | 0.0.0.0/0      | Allow      | NAT return traffic from outbound integrations        |
| Inbound   | 200    | All traffic   | All      | All        | 0.0.0.0/0      | Deny       | Implicit deny                                        |
| Outbound  | 100    | Mongo         | TCP      | 27017      | 10.20.20.0/24  | Allow      | Backend → Mongo Replica Set                          |
| Outbound  | 110    | Redis         | TCP      | 6379,16379 | 10.20.20.0/24  | Allow      | Backend → Cache layer                                |
| Outbound  | 120    | Postgres      | TCP      | 5432       | 10.20.20.0/24  | Allow      | Explorer backend → Postgres                          |
| Outbound  | 130    | Cosmos P2P    | TCP      | 26656      | 10.20.20.0/24  | Allow      | Sentry → Validator P2P peering                       |
| Outbound  | 140    | Cosmos RPC    | TCP      | 26657      | 10.20.20.0/24  | Allow      | Backend → Validator RPC (via sentry proxy)           |
| Outbound  | 150    | HTTPS (NAT)   | TCP      | 443        | 0.0.0.0/0      | Allow      | App Tier → public Internet via NAT (Safaricom, AML)  |
| Outbound  | 160    | Ephemeral     | TCP      | 1024-65535 | 10.20.1.0/24   | Allow      | Return traffic ALB health checks                     |
| Outbound  | 200    | All traffic   | All      | All        | 0.0.0.0/0      | Deny       | Catch-all deny                                       |

### Data Tier NACL (10.20.20.0/24)

**Critical:** No default 0.0.0.0/0 outbound. Every egress destination is an explicitly pinned CIDR, DNS name resolved via AWS PrivateLink, or VPC endpoint prefix list.

| Direction | Rule # | Type          | Protocol | Port Range | Source                          | Allow/Deny | Purpose                                                       |
|-----------|--------|---------------|----------|------------|---------------------------------|------------|---------------------------------------------------------------|
| Inbound   | 100    | Mongo         | TCP      | 27017      | 10.20.10.0/23                   | Allow      | App Tier backend → Mongo primary/secondaries                 |
| Inbound   | 110    | Redis         | TCP      | 6379,16379 | 10.20.10.0/23                   | Allow      | App Tier → Redis cache/cluster bus                          |
| Inbound   | 120    | Postgres      | TCP      | 5432       | 10.20.10.0/23                   | Allow      | Explorer backend → Postgres                                  |
| Inbound   | 130    | Cosmos P2P    | TCP      | 26656      | 10.20.10.0/23                   | Allow      | Sentry → Validator P2P (inbound side)                        |
| Inbound   | 140    | Cosmos RPC    | TCP      | 26657      | 10.20.10.0/23                   | Allow      | Backend/sentry → Validator RPC                               |
| Inbound   | 150    | Ephemeral     | TCP      | 1024-65535 | `pl-vpce-*` (VPC endpoints)    | Allow      | VPC endpoint return traffic (S3, Secrets Manager)            |
| Inbound   | 200    | All traffic   | All      | All        | 0.0.0.0/0                       | Deny       | Implicit deny — no direct public reachability, no cross-tier leakage |
| Outbound  | 100    | Vault         | TCP      | 8200       | 10.20.10.0/23 (Vault in App)   | Allow      | Validator & Mongo → HashiCorp Vault for encryption keys      |
| Outbound  | 110    | Safaricom     | TCP      | 443        | `safaricom-mpesa-prefixes`      | Allow      | Mongo → M-Pesa callback IPs whitelist (audited, updated quarterly) |
| Outbound  | 120    | Cosmos Seeds  | TCP      | 26656      | Cosmos seed node public IPs     | Allow      | Sentry (via validators?) — **actually only sentries dial seeds; this rule exists so validator can reply to sentry P2P** |
| Outbound  | 130    | VPC Endpoints | TCP      | 443        | `pl-com-aws-*` prefix lists     | Allow      | S3, Secrets Manager, STS, ECR via PrivateLink                |
| Outbound  | 140    | Ephemeral     | TCP      | 1024-65535 | 10.20.10.0/23                   | Allow      | Return traffic for App Tier → Data Tier initiated queries    |
| Outbound  | 200    | All traffic   | All      | All        | 0.0.0.0/0                       | Deny       | **No blanket internet access.** Every egress must be explicit. |

Safaricom and Cosmos seed CIDRs are managed as Terraform `external` data sources that resolve the current IP ranges at plan time, so drift between the published whitelist and the NACL is caught in `terraform plan`.

---

## 3. Security Group Matrix

Security Groups are stateful and live one layer above NACLs. They are attached to individual ENIs / pods / managed services. The matrix below defines the canonical SG relationships. SG naming convention: `<env>-mallchain-<tier>-<role>-sg` (e.g., `prod-mallchain-public-alb-sg`).

| Rule Name                          | Source SG                     | Destination SG                 | Port       | Protocol | Purpose                                                                 |
|------------------------------------|-------------------------------|--------------------------------|------------|----------|-------------------------------------------------------------------------|
| alb-ingress-cloudflare             | `cloudflare-ip-prefixes-sg`   | `public-alb-sg`                | 443        | TCP      | Only Cloudflare edge talks to ALB on HTTPS                              |
| alb-http-redirect                  | `cloudflare-ip-prefixes-sg`   | `public-alb-sg`                | 80         | TCP      | HTTP listener on ALB for 301 → HTTPS redirect                           |
| alb-to-backend-nodeport            | `public-alb-sg`               | `app-backend-sg`               | 30080      | TCP      | ALB → backend NodePort service (EKS-managed)                            |
| alb-to-frontend-nodeport           | `public-alb-sg`               | `app-frontend-sg`              | 30081      | TCP      | ALB → frontend Nginx NodePort                                           |
| backend-to-mongo                   | `app-backend-sg`              | `data-mongo-sg`                | 27017      | TCP      | Backend Mongoose driver → Mongo replica set                             |
| backend-to-redis                   | `app-backend-sg`              | `data-redis-sg`                | 6379       | TCP      | Backend ioredis → Redis cache                                           |
| redis-cluster-bus                  | `data-redis-sg`               | `data-redis-sg`                | 16379      | TCP      | Redis cluster inter-node gossip / failover (self-referencing SG)        |
| backend-to-postgres-explorer       | `app-explorer-backend-sg`     | `data-postgres-sg`             | 5432       | TCP      | Explorer indexer → Postgres relational store                            |
| sentry-to-validator-p2p            | `app-sentry-sg`               | `data-validator-sg`            | 26656      | TCP      | Cosmos Sentry ↔ Validator P2P mempool sync                              |
| backend-to-sentry-rpc              | `app-backend-sg`              | `app-sentry-sg`                | 26657      | TCP      | Backend tendermint RPC client → Sentry (preferred vs direct validator)  |
| backend-to-vault                   | `app-backend-sg`              | `app-vault-sg`                 | 8200       | TCP      | Backend → HashiCorp Vault transit secrets engine                        |
| validator-to-vault                 | `data-validator-sg`           | `app-vault-sg`                 | 8200       | TCP      | Validator hot-key signer → Vault for key versioning/rotation            |
| prometheus-scrape-backend          | `app-prometheus-sg`           | `app-backend-sg`               | 9464       | TCP      | Prometheus → backend /metrics endpoint                                  |
| prometheus-scrape-validator        | `app-prometheus-sg`           | `data-validator-sg`            | 26660      | TCP      | Prometheus → Tendermint exporter metrics port                           |
| grafana-to-prometheus              | `app-grafana-sg`              | `app-prometheus-sg`            | 9090       | TCP      | Grafana datasource → Prometheus query API                                |
| nat-gateway-outbound-app           | `app-*-sg` (wildcard)         | `public-nat-sg`                | 443        | TCP      | App Tier arbitrary egress (Safaricom, AML, seed P2P)                    |
| ssm-agent-ingress                  | `aws-ssm-managed-instance-sg` | `*-all-sg` (every tier)        | 443        | TCP      | SSM Agent → AWS Systems Manager (replaces SSH — see section 5)          |
| self-reference-mongo-replset       | `data-mongo-sg`               | `data-mongo-sg`                | 27017      | TCP      | Mongo inter-node replication heartbeat and oplog pull                   |
| postgres-self-replication          | `data-postgres-sg`            | `data-postgres-sg`             | 5432       | TCP      | Postgres streaming replication WAL apply if multi-AZ standby exists     |
| deny-all-outbound-data-default     | N/A (catch-all)               | `data-*-sg` (all data SGs)     | 0-65535    | All      | Explicit reject 0.0.0.0/0 on data-tier SGs; only rules above authorize  |

The "catch-all" deny rule on data-tier Security Groups is implemented as an explicit `REJECT` on `0.0.0.0/0` rather than relying on the implicit deny of Security Groups, so that VPC Flow Logs and GuardDuty flag any rejected attempt with a clear `REJECT` vs. an ambiguous implicit-drop.

---

## 4. VPC Endpoints — Data Tier PrivateLink Paths

The Data Tier has no default public route. Every AWS service that stateful workloads depend on is accessed via a VPC interface or gateway endpoint so that control-plane and data-plane traffic never traverses the public Internet.

### Gateway Endpoints (prefix-list based, free)

| Endpoint Service        | Prefix List          | Route Tables Associated                          | Purpose                                                                  |
|-------------------------|----------------------|--------------------------------------------------|--------------------------------------------------------------------------|
| `com.amazonaws.<r>.s3`  | `pl-xxxxxxxx`        | Data Tier subnet RT, App Tier subnet RT          | MongoDB oplog backups to `s3://mallchain-<env>-db-backups/` via `backup.sh`. Validator state snapshots to `s3://mallchain-<env>-chain-state/`. App Tier also uses this for build artifacts, but it's enforced from data tier too. |

### Interface Endpoints (ENI-backed, cross-AZ HA)

| Endpoint Service                    | Private DNS Enabled | Security Group | Subnets           | Purpose                                                                 |
|-------------------------------------|---------------------|----------------|-------------------|-------------------------------------------------------------------------|
| `com.amazonaws.<r>.secretsmanager`  | Yes                 | `data-vpce-sg`  | Data: 3 AZ        | Cosmos validator node reads consensus keys from Secrets Manager on boot. Mongo/Postgres read master encryption keys. Backend pods (App Tier) share this endpoint so the Vault transit fallback is inside the VPC. |
| `com.amazonaws.<r>.sts`             | Yes                 | `data-vpce-sg`  | Data: 3 AZ        | `sts:AssumeRole` calls for `mallchain-validator-backup-role` and `mallchain-mongo-restore-role` never leave the VPC; prevents credential replay against public STS endpoint. |
| `com.amazonaws.<r>.ecr.dkr`         | Yes                 | `data-vpce-sg`  | Data: 3 AZ        | If Cosmos validator or Mongo sidecars ever need to pull a container image in a disaster-recovery re-pave, they pull from the private ECR endpoint without needing NAT. |
| `com.amazonaws.<r>.ecr.api`         | Yes                 | `data-vpce-sg`  | Data: 3 AZ        | ECR API operations (list-images, describe-repositories) for restore automation. |
| `com.amazonaws.<r>.ssm`             | Yes                 | `data-vpce-sg`  | All tiers, 3 AZ  | Required by SSM Session Manager (section 5); SSM Agent ↔ Systems Manager control plane. |
| `com.amazonaws.<r>.ssmmessages`     | Yes                 | `data-vpce-sg`  | All tiers, 3 AZ  | Session Manager data channel (session payloads stream over this endpoint, not the internet). |
| `com.amazonaws.<r>.ec2messages`     | Yes                 | `data-vpce-sg`  | All tiers, 3 AZ  | SSM Run Command message delivery (patching, Mongo rotate-key jobs).     |
| `com.amazonaws.<r>.logs`            | Yes                 | `data-vpce-sg`  | All tiers, 3 AZ  | CloudWatch Logs agent inside validator and Mongo sidecars sends audit logs to CloudWatch without internet egress. |
| `com.amazonaws.<r>.monitoring`      | Yes                 | `data-vpce-sg`  | All tiers, 3 AZ  | CloudWatch agent `put-metric-data` for disk/memory custom metrics.     |

Endpoint Security Group `data-vpce-sg` is independently hardend: it only allows 443 inbound from the App Tier SGs and Data Tier SGs on each endpoint ENI. Endpoint policies (resource-based policies on the VPC endpoint itself) further restrict *which* API actions can be called through the endpoint even if the IAM role is overly permissive. For example, the S3 endpoint policy only permits `s3:PutObject` / `s3:GetObject` on the two backup buckets and denies all other S3 actions, so an attacker with shell on a Mongo pod can't enumerate every bucket in the account through the private endpoint.

---

## 5. Bastion & Administrative Access — SSM Session Manager Only

**Hard rule: no SSH from the Internet.** There is no `0.0.0.0/0 :22` rule anywhere in this VPC. All interactive shell access to EC2 instances, EKS worker nodes, and even out-of-band management tasks flows through **AWS Systems Manager Session Manager** with IAM authentication and session logging to S3 + CloudWatch Logs.

### Why No Bastion Host

A traditional bastion EC2 instance in the public subnet would require:

- A public IP (another attack surface)
- An SSH key lifecycle management problem (who rotates the bastion host keys? How are user keys provisioned and revoked?)
- Patching, monitoring, and another thing to secure

SSM Session Manager eliminates all of this. The SSM Agent is baked into the EKS-optimized AMI and the Mongo/Cosmos custom AMIs via Packer build. IAM policies attached to instance roles grant `ssm:StartSession` only to named IAM users/roles with `Condition` keys for MFA and source IP (corporate VPN range). The Data Tier instances have exactly the same access path as the App Tier — no tier needs an inbound port opened for ops.

### Administrative Access Flow

1. Engineer authenticates to AWS SSO with hardware MFA → assumes `mallchain-sre-breakglass-<env>` role.
2. Role trust policy enforces MFA and source IP ∈ corporate VPN `/24`.
3. Engineer runs `aws ssm start-session --target <instance-id> --region <r>` from their local machine.
4. Session Manager brokers the session **over the SSM VPC endpoint** — the instance never accepts an inbound TCP connection.
5. Every command typed is captured as JSON to `s3://mallchain-<env>-ssm-sessions/` and a CloudTrail event records `ssm:StartSession` with the engineer's assumed-role ARN.
6. For EKS `kubectl` access: SSM port-forward session to the EKS API's private VPC endpoint on port 443, then `kubectl` locally over that tunnel.

### Emergency: Break-Glass Console Access

For disaster-recovery scenarios where SSM control plane is down (unlikely but designed for), a "break-glass" Security Group `emergency-admin-sg` exists but is attached to zero instances by default. It only allows 22 from the corporate VPN `/24` (never from 0.0.0.0/0). Attaching this SG to an instance requires a separate `iam:AttachGroupPolicy` action that triggers a PagerDuty alert to the security on-call and is auto-detached by a Lambda after 60 minutes. This workflow is tested quarterly in the restore-drill CI job (`.github/workflows/restore-drill.yml`).

---

## 6. Edge WAF — Before the ALB

Even though Cloudflare already provides L3/L7 DDoS and bot mitigation, a second WAF layer is enforced at the AWS edge directly in front of the ALB via **AWS WAFv2 web ACL**. This gives defense-in-depth so that a misconfiguration in Cloudflare (e.g., accidental gray-clouding that exposes origin) does not expose the ALB directly to unfiltered traffic.

### WAF Rule Group Order of Evaluation

1. **AWS Managed Rules — IP reputation list:** Block traffic from the AWS threat intelligence feed of known malicious bots, scanners, and C2 ranges.
2. **AWS Managed Rules — SQL injection:** Inspects query string, body, and URI for classic SQLi patterns (relevant because Postgres Explorer backend accepts query parameters).
3. **AWS Managed Rules — XSS:** Cross-site scripting pattern block on form posts and JSON bodies.
4. **Custom rule — Cloudflare verified header:** Requires a signed `X-Cloudflare-Origin-Check` header that Cloudflare injects with a per-environment shared secret. This guarantees traffic *actually* came through Cloudflare; direct-to-origin scanners that bypass Cloudflare DNS fail this rule.
5. **Custom rule — Rate limit per IP:** 1,000 requests per 5 minutes per single client IP on `/api/auth/*`, `/api/wallet/*`, and `/api/kyc/*`. Lower thresholds for non-authenticated endpoints.
6. **Custom rule — Geographic restriction:** Allow-list only countries where the business actually operates. US, Kenya, Nigeria, Ghana, Uganda, Tanzania, Rwanda, South Africa, UK, Germany. All others blocked at WAF before reaching ALB.
7. **Custom rule — Request size limit:** POST body > 1 MB rejected at WAF (except `/api/ipfs/*` whitelist with 32 MB cap).

WAF logs are delivered to `s3://mallchain-<env>-waf-logs/` via Kinesis Firehose with Athena partitioning so the SRE team can do retrospective analysis on blocked traffic patterns. The WAF has a "count mode" dry-run that runs for 48 hours before any new custom rule is promoted to "block" — the CI deploy pipeline gates promotion on `<0.01%` false-positive rate against sampled production traffic.

---

## 7. Cross-AZ Topology & 3-AZ Minimum

High availability and fault isolation are first-class design constraints. Every tier, subnet, and stateful workload is spread across a minimum of three Availability Zones. A single AZ failure (power event, network partition, hardware fleet defect) must not degrade the platform below "degraded but functional" for either the API tier or the blockchain consensus layer.

### Physical Topology Description

```
                    ┌──────────────────────────────────────────────────────────────┐
                    │                    AWS Region (e.g. eu-west-1)               │
                    │                                                              │
                    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
                    │   │   AZ A      │  │   AZ B      │  │   AZ C      │         │
                    │   │             │  │             │  │             │         │
Public  Subnet 10.20.1.0/24 (shards .1-.84 / .85-.169 / .170-.254 across AZs)    │
                    │   │  NAT GW A   │  │  NAT GW B   │  │  NAT GW C   │         │
                    │   │  ALB Node A │  │  ALB Node B │  │  ALB Node C │         │
                    │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
                    │          │                │                │                │
                    │   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐         │
App Subnet 10.20.10.0/23 (.10.1-.10.84 / .10.85-.11.169 / .11.170-.11.254)        │
                    │   │             │  │             │  │             │         │
                    │   │  EKS Node A │  │  EKS Node B │  │  EKS Node C │         │
                    │   │  Backend×3  │  │  Backend×3  │  │  Backend×3  │         │
                    │   │  Frontend×2 │  │  Frontend×2 │  │  Frontend×2 │         │
                    │   │  Sentry 1    │  │  Sentry 2    │  │  Sentry 3    │         │
                    │   │  Prometheus  │  │  Grafana HA │  │  Alertmanager│         │
                    │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
                    │          │                │                │                │
                    │   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐         │
Data Subnet 10.20.20.0/24 (.1-.84 / .85-.169 / .170-.254)                          │
                    │   │  Mongo-A     │  │  Mongo-B     │  │  Mongo-C     │         │
                    │   │  (Primary)   │  │  (Secondary) │  │  (Secondary) │         │
                    │   │  Redis A     │  │  Redis B     │  │  Redis C     │         │
                    │   │  Postgres-A  │  │  Postgres-B  │  │  Postgres-C  │         │
                    │   │  Validator   │  │  (standby off,│  │  (standby off,│        │
                    │   │  (ACTIVE)    │  │   cold DR)    │  │   cold DR)    │         │
                    │   └─────────────┘  └─────────────┘  └─────────────┘         │
                    └──────────────────────────────────────────────────────────────┘
```

### Cross-AZ Failure Modes & Mitigations

- **Single AZ loss of App Tier:** EKS Cluster Autoscaler + pod anti-affinity guarantees that no two backend pods share an AZ (`podAntiAffinity` in `infra/k8s/10-backend.yaml`). ALB target group drains AZ-A automatically. NAT Gateway B and C take over the AZ-A workloads' outbound traffic via cross-AZ routing (EKS default).
- **Single AZ loss of Data Tier Mongo:** Mongo replica set holds election between AZ-B and AZ-C. Because the write concern is `w:2` and read concern `majority`, writes that were acknowledged survive (committed on ≥2 nodes). App Tier retries transparently; the Mongo driver's SRV record includes all three members and auto-fails over.
- **Single AZ loss of Cosmos Sentry:** The Validator in AZ-A still has two sentries peering to it (AZ-B and AZ-C). P2P gossip continues. Blockchain consensus is unaffected because the validator itself is still signing.
- **Single AZ loss of Cosmos Validator:** This is the most serious failure mode. Tendermint consensus requires ≥2/3 of voting power online. If the active validator is in a downed AZ, the platform enters consensus halt. Cold-standby full nodes in the other two AZs have the state synced; a documented runbook promotes a standby using the key material restored from Vault + Secrets Manager. The RTO target is ≤15 minutes; this is tested in the quarterly restore-drill.

### Inter-AZ Data Transfer

No cost-blind traffic patterns. Mongo oplog replication, Redis cluster bus, and Cosmos P2P traffic between AZs are accounted for. The architecture accepts the inter-AZ transfer cost because the alternative — single-AZ stateful services — violates the fault-tolerance requirement. EKS pod-to-pod traffic within the App Tier is topologically optimized via `topologySpreadConstraints` so requests prefer same-AZ backend pods when possible, reducing cross-AZ fees where it doesn't hurt availability.

---

## 8. Kubernetes NetworkPolicies — Deny-All Default

VPC NACLs and Security Groups segment at the subnet and ENI level, but a single EKS worker node hosts multiple different pod workloads. Without NetworkPolicies, any pod on the same node could open a TCP socket to any other pod's localhost-adjacent IP purely because Kubernetes flat networking allows it. Kubernetes NetworkPolicies at the namespace level close this gap.

### Baseline Default-Deny

The base policy is in `infra/k8s/30-network-policies.yaml:1` and applies to the entire `mallchain` namespace:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: mallchain
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

This policy selects **every pod** in the namespace via the empty `podSelector` and denies *all* ingress and *all* egress by default. Without an explicit allow-list policy, a newly deployed pod has zero network reachability — it cannot even DNS-resolve cluster DNS (kube-dns), which catches "forgot to add a NetworkPolicy" deployment mistakes in CI (the app health-check fails because it can't reach Vault or Mongo during startup).

### Specific Allow-Rule Policies

Every workload then gets a companion allow policy that names *exactly* what it can talk to, on exactly the right port, using label selectors instead of CIDRs (so it survives pod churn and node replacement).

| Policy Name         | Pod Selector Match           | Allowed Ingress From                  | Allowed Egress To                        | Port / Protocol   |
|---------------------|------------------------------|---------------------------------------|------------------------------------------|-------------------|
| backend-ingress     | `app=backend`                | `app=frontend`, `app=prometheus`      | —                                        | 3000/TCP, 9464/TCP|
| backend-egress      | `app=backend`                | —                                     | `app=mongo` (statefulset pods)           | 27017/TCP         |
| backend-egress      | `app=backend`                | —                                     | `app=redis`                              | 6379/TCP          |
| backend-egress      | `app=backend`                | —                                     | `app=cosmos-sentry`                      | 26657/TCP (RPC)  |
| backend-egress      | `app=backend`                | —                                     | `app=vault`                              | 8200/TCP          |
| backend-egress      | `app=backend`                | —                                     | `kube-system:kube-dns`                   | 53/UDP, 53/TCP    |
| frontend-ingress    | `app=frontend`               | `app=alb-ingress-controller`          | —                                        | 80/TCP, 443/TCP   |
| frontend-egress     | `app=frontend`               | —                                     | `app=backend`                            | 3000/TCP          |
| sentry-ingress      | `app=cosmos-sentry`          | `app=backend`, `app=cosmos-validator` | —                                        | 26657/TCP, 26656/TCP |
| sentry-egress       | `app=cosmos-sentry`          | —                                     | `app=cosmos-validator`                   | 26656/TCP (P2P)  |
| sentry-egress       | `app=cosmos-sentry`          | —                                     | 0.0.0.0/0 (via NAT, only 26656)          | 26656/TCP (seed nodes) |
| validator-ingress   | `app=cosmos-validator`       | `app=cosmos-sentry`                   | —                                        | 26656/TCP, 26657/TCP, 26660/TCP |
| validator-egress    | `app=cosmos-validator`       | —                                     | `app=cosmos-sentry` (P2P replies)        | 26656/TCP         |
| validator-egress    | `app=cosmos-validator`       | —                                     | `app=vault` (hot key versioning)         | 8200/TCP          |
| prometheus-ingress  | `app=prometheus`             | `app=grafana`                         | —                                        | 9090/TCP          |
| prometheus-egress   | `app=prometheus`             | —                                     | All pods with `prometheus.io/scrape=true` label | 9464/TCP, 26660/TCP, etc. (scrape ports) |
| mongo-ingress       | `app=mongo`                  | `app=backend`, `app=mongo` (self replication) | —                              | 27017/TCP         |
| mongo-egress        | `app=mongo`                  | —                                     | `app=vault` (field encryption keys)      | 8200/TCP          |
| mongo-egress        | `app=mongo`                  | —                                     | `vpce-s3` (backup bucket via endpoint)   | 443/TCP           |
| redis-ingress       | `app=redis`                  | `app=backend`, `app=redis` (cluster bus) | —                                      | 6379/TCP, 16379/TCP |

Because the default policy is deny-all, adding a new microservice (say, a new KYC processor) requires an explicit PR that adds the NetworkPolicy for that service. The CI pipeline runs `kubeconform` + a custom OPA policy that rejects deployments where a Deployment/Pod exists in the namespace with no matching NetworkPolicy with an `ingress` or `egress` rule. This enforcement is in `.github/workflows/deploy.yml` under the `networkpolicy-audit` job.

---

## 9. Terraform Implementation Reference

The canonical source of truth for the VPC, subnet CIDRs, NACLs, route tables, and VPC endpoints discussed in this document is the Terraform module at:

**`infra/terraform/vpc.tf`**

Key implementation details to cross-reference when reading the Terraform:

- **Lines 11-16:** VPC name, CIDR (`var.vpc_cidr` defaults to `10.20.0.0/16` in `variables.tf`), 3-AZ spread, private subnets provisioned for app+data tiers, public subnets for ALB+NAT. The `private_subnets` and `public_subnets` count in the module creates one subnet per AZ — the documented `/23` app tier and `/24` data tier are achieved by post-module override of the individual subnet CIDRs and route tables with a `aws_subnet` resource block that targets the module's auto-created subnet IDs. (Future work: refactor this to a 3-subnet-group layout instead of 2 for even clearer tier separation.)
- **Line 19:** `single_nat_gateway = var.environment != "production"` — one shared NAT for staging (cost), three NAT Gateways (one per AZ) for production so NAT failure in one AZ doesn't take down the other two egress paths.
- **Lines 24-29:** ELB role tags on subnets. The AWS Load Balancer Controller auto-discovers where to attach ENIs for public vs. internal LoadBalancer Services based on `kubernetes.io/role/elb=1` (public) vs `kubernetes.io/role/internal-elb=1` (private). The ALB defined in `infra/k8s/20-ingress.yaml` will only land in the public subnet because of these tags — there is no risk a Service annotation accidentally exposes the internal Postgres via a public ENI.

After any change to `infra/terraform/vpc.tf`:

1. Run `terraform plan` and manually confirm the CIDR/ACL delta against the tables above.
2. Run `terraform apply` against the staging workspace first.
3. Re-run the `restore-drill.yml` CI workflow end-to-end against staging to validate that backup/restore still works over VPC endpoints, SSM can still start sessions, and the validator can still peer with sentries after network changes.
4. Promote the same change through the change control approval in the `production` workspace.

---

## Appendix: Continuous Validation of Segmentation

Network segmentation rots over time if unvalidated. The following automated checks run in CI and production on a schedule:

- **VPC Reachability Analyzer:** Weekly scheduled AWS Network Manager reachability analyses. Paths that MUST fail: `0.0.0.0/0 → :22 any instance`, `data-tier-subnet → :443 0.0.0.0/0`, `app-tier → data-tier :22`, `public-subnet → data-tier any port except via ALB path`. Any path that incorrectly shows "reachable" opens a GitHub issue.
- **Kubernetes NetworkPolicy audit:** Nightly `kubectl get networkpolicies -o yaml` diff against the golden rules in `infra/k8s/30-network-policies.yaml`. Drift between deployed and checked-in policies fails the compliance job.
- **GuardDuty:** `UnauthorizedAccess:EC2/SSHBruteForce` and `UnauthorizedAccess:EC2/RDPBruteForce` findings high-severity page even at zero count (SSH should never be seen inbound). `Recon:EC2/Portscan` findings from inside the VPC trigger automatic Security Group isolation of the scanning instance ENI via a Lambda auto-response.
- **VPC Flow Logs:** Athena query runs hourly looking for `ACCEPT` records from data-tier ENIs to non-private RFC1918 destinations that are not in the VPC endpoint prefix lists. Any hit is a "segmentation leak" and is paged.

All validation failures are tracked against the SLO defined in PRODUCTION.md — zero accepted segmentation leaks per rolling 30-day window.
