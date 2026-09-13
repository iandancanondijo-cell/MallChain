# Mallchain Disaster Recovery Policy

**Version**: 1.0
**Effective Date**: 2026-08-27
**Owner**: Platform Engineering
**Review Cycle**: Quarterly

## 1. Purpose and Scope

This document defines the Mallchain Marketplace Blockchain disaster recovery (DR) policy, establishing recovery tiers, backup architectures, recovery procedures, incident command structure, and drill requirements. It applies to all production environments, infrastructure, data stores, and third-party service integrations operated by the Mallchain engineering and operations teams.

The objectives of this policy are to:
- Define tiered Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) based on business impact
- Document standardized backup and restore architectures for each critical data store
- Establish offsite and air-gapped protection against ransomware and catastrophic events
- Define clear incident command roles and communication paths during outages
- Mandate regular DR drills with measurable evidence of success
- Provide actionable runbook references for on-call responders during live incidents

---

## 2. Recovery Tiers and Objectives

Mallchain classifies all production systems into three tiers, each with binding RTO/RPO targets. Failure to meet these targets during a declared disaster triggers an automatic post-incident review (see Section 10).

### Tier 1 — Payments and Fiat Buy/Sell Processing (Critical)

| Metric | Target | Business Justification |
|---|---|---|
| **RTO** | 30 minutes | Payment processing downtime directly blocks user deposits, withdrawals, and marketplace settlement. SLA breach incurs merchant penalties and reputational risk. |
| **RPO** | 5 minutes | A maximum of 5 minutes of payment transaction data may be lost. Beyond this threshold, fiat-crypto reconciliation discrepancies require manual accounting intervention. |

**Included Systems**:
- Payment gateway services (Stripe, on-ramp, off-ramp processors)
- Order matching engine state
- Dead-letter outbox queue (`docs/runbooks/dead-letter-outbox.md`)
- Fiat settlement ledgers
- Withdrawal processing workers

### Tier 2 — KYC and Wallet Data (High Priority)

| Metric | Target | Business Justification |
|---|---|---|
| **RTO** | 2 hours | Extended KYC/wallet downtime blocks new user onboarding and new wallet creation but does not impact already-signed-in trading users. |
| **RPO** | 15 minutes | Up to 15 minutes of user profile changes, new KYC submissions, and wallet address mappings may be lost. KYC data is re-submittable by users. |

**Included Systems**:
- KYC provider integration cache
- User profiles and identity verification records
- Wallet address book and withdrawal whitelist data
- Non-critical user preferences and notification settings

### Tier 3 — Chain State and Ledger Data (Operational)

| Metric | Target | Business Justification |
|---|---|---|
| **RTO** | 4 hours | Chain state replica failure pauses indexer-dependent features (historical order lookup, portfolio views, analytics) but does not block on-chain transaction submission or payment processing. |
| **RPO** | 1 hour | Up to 1 hour of newly indexed chain events may be lost. The indexer will re-sync from the blockchain once the restored node is healthy. |

**Included Systems**:
- Cosmos SDK node chain state (non-validator sentries)
- Block indexer database
- Event store and derived analytics views
- Historical transaction query service

---

## 3. Chain-State Backup Node Architecture

Mallchain operates a dedicated backup node architecture for the Cosmos SDK chain to ensure Tier 3 RTO/RPO targets.

### 3.1 Dedicated Non-Validator Sentry Node

A second Cosmos **non-validator sentry node** is provisioned in a physically separate AWS availability zone (AZ-B) from the primary validator sentry (AZ-A). This node:

- Maintains a full copy of chain state via `pruning=nothing` configuration
- Peers exclusively with the primary validator sentry and a public seed node
- Exposes no RPC endpoints to the public internet (security group restricted to VPC CIDR)
- Performs hourly `cosmosd export` snapshots to an EBS volume with 24-hour retention
- Automatically re-syncs from the backup snapshot if state corruption is detected

Hardware profile:
- Instance: `m6i.xlarge` (4 vCPU, 16 GB RAM)
- Storage: 2 TB gp3 EBS (provisioned IOPS 3000)
- Network: Dedicated ENI with jumbo frames enabled

### 3.2 State Snapshot Retention Schedule

| Snapshot Type | Frequency | Retention | Storage Location |
|---|---|---|---|
| Hourly `cosmosd export` | Every 60 minutes | 48 hours | Local EBS on backup sentry |
| Daily pruned export | 02:00 UTC daily | 30 days | S3 offsite (encrypted, see Section 6) |
| Weekly full genesis export | Sunday 01:00 UTC | 52 weeks | S3 + Glacier Deep Archive (air-gapped, see Section 7) |

### 3.3 Weekly Restore Drill Requirement

Every Sunday at 06:00 UTC, an automated CI job (`drills/chain-restore.yml`) executes the following drill:

1. Spins up a fresh `m6i.xlarge` EC2 instance in AZ-C
2. Restores the latest weekly genesis export from S3
3. Runs `cosmosd start` and validates block height matches expected value (tolerance: ±100 blocks)
4. Executes a smoke-test query against the restored node's RPC endpoint
5. Tears down the instance and writes drill evidence to the evidence table (Section 12)

If the automated drill fails, the on-call engineer is paged via PagerDuty and must perform a manual restore drill within the same business day.

---

## 4. MongoDB Atlas / MongoDB Replica-Set Recovery

All Tier 1 and Tier 2 transactional data is stored in MongoDB Atlas M60+ clusters with three-node replica sets across three availability zones.

### 4.1 Atlas RTO/RPO Configuration

| Feature | Setting | Purpose |
|---|---|---|
| Cluster Tier | M60 or higher | Dedicated CPU and RAM to support rapid point-in-time recovery workloads |
| Replica Set | 3 nodes (AZ-A, AZ-B, AZ-C) | Tolerates single-AZ failure without data loss or downtime |
| Continuous Backups | Enabled, 35-day retention | Meets and exceeds Tier 1 5-minute RPO via per-second oplog capture |
| Point-in-Time Restore | Full cluster + selective collection restore | Enables surgical recovery of individual collections (e.g., payment ledger only) without full-cluster restore latency |
| Cross-Region Replication | Secondary region: us-west-2 | Geographic redundancy against regional AWS outage |

### 4.2 Recovery Steps — Point-in-Time Restore (Tier 1 Scenario)

**Trigger**: Corruption detected in payment orders collection or 30-minute RTO clock has started.

1. **Declare incident** — Incident Commander invokes maintenance mode via `make maintenance-on` (see `docs/runbooks/dead-letter-outbox.md` for payload queue pausing procedures)
2. **Identify restore timestamp** — From Atlas UI or CLI, identify the latest known-good timestamp before corruption. Subtract a 10-second safety margin.
3. **Initiate PIT restore** (Atlas CLI):
   ```bash
   atlas clusters restore start \
     --clusterName mallchain-prod \
     --targetClusterName mallchain-prod-restore \
     --pointInTimeUtcSeconds <known-good-timestamp>
   ```
4. **Swap connection strings** — Once restore completes (target: <20 minutes for M60), update the secret manager `MONGO_URI` value and trigger a rolling restart of payment services
5. **Validate data integrity** — Run `scripts/mongo-reconcile.sh` to cross-check restored payment ledger against Stripe dashboard export for the impacted window
6. **Replay DLQ** — Using the DLQ replay CLI, replay any dead-letter messages accumulated during outage:
   ```bash
   ./bin/dlq-replay --queue payment-outbox --from <outage-start-ts>
   ```
7. **Validate end-to-end** — Place a test buy/sell order in staging-mirrored production and confirm ledger write + settlement webhook delivery
8. **Disable maintenance mode** — `make maintenance-off` and notify via Statuspage

### 4.3 Self-Hosted Replica-Set Fallback

If Atlas control plane itself is unavailable, the self-hosted secondary replica in AZ-C is promoted manually:

```bash
mongosh --host mongo-azc-01:27017
rs.stepDown(120)  # on primary to force election
# On AZ-C node, confirm primary status:
rs.isMaster().ismaster
```

---

## 5. Redis Sentinel / AWS ElastiCache Recovery

Redis is used for session storage, rate limiting, idempotency keys, and real-time order book caching.

### 5.1 Deployment Architecture

- **Primary**: AWS ElastiCache for Redis (r6g.large) cluster mode disabled, multi-AZ with automatic failover, 3 node shards
- **On-prem fallback**: Redis Sentinel-managed 3-node cluster on EC2 for scenarios where ElastiCache control plane is degraded
- **Persistence**: AOF (Append Only File) with `appendfsync=everysec` + RDB snapshot every 15 minutes
- **AOF rewrite**: Auto-rewrite triggered at 100% growth from base size

### 5.2 RTO/RPO Targets for Redis

| Tier | RTO | RPO | Notes |
|---|---|---|---|
| Tier 1 (idempotency keys) | 10 minutes | 1 second | AOF replay with `everysec` fsync limits loss to at most 1 second of write operations |
| Tier 2 (sessions) | 30 minutes | 1 minute | Users re-authenticate after session store restore; graceful degradation via remember-me tokens |
| Tier 3 (cache) | 60 minutes | N/A | Cache repopulates lazily; no business impact from cold start |

### 5.3 Recovery Procedure — AOF Replay

1. **Detect failure** — Prometheus alert `RedisClusterDown` fires or `redis-cli --cluster check` returns node failure
2. **Failover** (ElastiCache): Automatic failover typically completes in 60-90 seconds. Verify with:
   ```bash
   aws elasticache describe-cache-clusters \
     --cache-cluster-id mallchain-redis \
     --show-cache-node-info | jq '.CacheClusters[].CacheNodes[].CacheNodeStatus'
   ```
3. **Manual Sentinel failover** (if ElastiCache unresponsive):
   ```bash
   redis-cli -h sentinel-01 -p 26379 SENTINEL failover master-1
   ```
4. **AOF integrity check** — If data corruption suspected, run AOF checker before restart:
   ```bash
   redis-check-aof --fix appendonly.aof
   ```
5. **Replay AOF to last known good** — Append the verified AOF file to the recovered/failover node and confirm `aof_rewrite_in_progress:0`
6. **Validate keyspace** — Run `scripts/redis-smoke-test.sh` which verifies idempotency key write/read, session token validity, and order book cache presence
7. **Warm critical caches** — Execute `make cache-warm` to pre-populate top-100 trading pair order books before enabling traffic

---

## 6. S3 Offsite Backups with GPG Encryption

All data exported from production systems is replicated to an offsite S3 bucket with client-side GPG encryption before upload.

### 6.1 Configuration

- **Bucket**: `mallchain-prod-backups-offsite` (us-west-2 region, separate from primary us-east-1 footprint)
- **Versioning**: Enabled with MFA delete for overwrite/delete protection
- **Lifecycle**: 30 days standard → 90 days Standard-IA → 365 days Glacier Flexible Retrieval → expire after 7 years
- **Encryption**: Server-side (SSE-S3) + client-side GPG dual encryption
- **Access**: Bucket policy denies all principals except the `backup-service` IAM role; CloudTrail enabled for all object-level API calls

### 6.2 GPG Encryption Procedure

Backups are encrypted using the environment variable `BACKUP_GPG_RECIPIENT` which contains the 40-character GPG key fingerprint of the dedicated backup signing key. The key is stored in HashiCorp Vault with dual-control access (two engineers must approve unwrap).

```bash
export BACKUP_GPG_RECIPIENT="A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0"

gpg --batch --yes --trust-model always \
    --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "${BACKUP_FILE}.gpg" \
    --encrypt "$BACKUP_FILE"

aws s3 cp "${BACKUP_FILE}.gpg" \
  "s3://mallchain-prod-backups-offsite/${SERVICE}/${DATE}/"
```

### 6.3 Encrypted Backup Inventory

| Backup Artifact | Frequency | GPG Recipient Check | S3 Prefix |
|---|---|---|---|
| MongoDB full cluster export | Daily 03:00 UTC | `BACKUP_GPG_RECIPIENT` | `s3://mallchain-prod-backups-offsite/mongo/` |
| PostgreSQL user/KYC dump | Daily 03:30 UTC | `BACKUP_GPG_RECIPIENT` | `s3://mallchain-prod-backups-offsite/postgres/` |
| Cosmos chain weekly genesis | Sunday 01:30 UTC | `BACKUP_GPG_RECIPIENT` | `s3://mallchain-prod-backups-offsite/cosmos/` |
| Redis AOF + RDB daily copy | Daily 04:00 UTC | `BACKUP_GPG_RECIPIENT` | `s3://mallchain-prod-backups-offsite/redis/` |
| DLQ export (payment outbox) | Hourly | `BACKUP_GPG_RECIPIENT` | `s3://mallchain-prod-backups-offsite/dlq/` |

---

## 7. Ransomware Recovery — Air-Gapped S3 Glacier Deep Archive

For ransomware scenarios where the primary AWS account, IAM roles, and online S3 buckets are compromised, Mallchain maintains a **separate, air-gapped AWS account** (account ID: 4412-XXXX-XXXX) with no network connectivity or trust relationships to the production account.

### 7.1 Air-Gapped Vault Architecture

- **Account**: Dedicated AWS account `mallchain-dr-vault` with root MFA hardware key (YubiKey, stored in physical safe, two keyholders)
- **Bucket**: `mallchain-dr-vault-glacier` with Glacier Deep Archive storage class only
- **No cross-account access**: Zero bucket policies, zero IAM roles, zero trust relationships. Write access is via a single IAM user with access keys rotated quarterly and stored in a physical safe.
- **Write-only pattern**: Backups are pushed to the vault account using a **pull-from-vault** model. A Lambda in the vault account, triggered on a schedule, pulls encrypted backup objects from the offsite bucket via presigned URLs with a 1-hour TTL. The production account cannot push directly to the vault account.
- **Object Lock**: Compliance-mode Object Lock enabled with a 365-day retention period. Objects cannot be deleted or overwritten even with root credentials until the retention period expires.
- **Retrieval**: Standard retrievals (12-hour) used for quarterly drills; bulk retrievals (48-hour) available for actual disaster scenarios at lower cost.

### 7.2 Ransomware Recovery Runbook

1. **Isolate production account**: Incident Commander immediately revokes all IAM user sessions, rotates root credentials, and applies SCP denying all S3 write/delete operations via AWS Organizations
2. **Engage vault account keyholders**: Two physical-safe keyholders retrieve YubiKey and IAM credentials to authenticate into `mallchain-dr-vault` account
3. **Initiate Glacier retrievals**: Submit retrieval requests for all objects required to meet Tier 1 RPO (latest weekly MongoDB export, Cosmos genesis, DLQ exports)
4. **Provision recovery environment**: Spin up isolated VPC with no production peering; deploy fresh compute and data plane instances from validated AMI IDs stored in the vault account
5. **Restore and validate**: Restore Tier 1 systems first (payments RTO 30m from retrieval completion), then Tier 2, then Tier 3. Validate with reconciliation scripts before user traffic is permitted
6. **Forensics preservation**: Do not terminate or clean production account resources until forensic snapshot images are taken and preserved for law enforcement chain of custody

---

## 8. Per-Tier Recovery Runbook References

During an active incident, on-call responders must follow the documented runbooks. Ad-hoc recovery without runbook validation is prohibited except as a last resort and must be approved by the Incident Commander.

### 8.1 Tier 1 (Payments/Fiat) Runbooks

| Procedure | Runbook Path / Command | Purpose |
|---|---|---|
| Maintenance mode toggle | `make maintenance-on` / `make maintenance-off` | Pauses all user-initiated payment flows and displays a status banner during recovery |
| Dead-letter outbox replay | `docs/runbooks/dead-letter-outbox.md` | Step-by-step guide for inspecting, deduplicating, and replaying payment outbox messages via the DLQ replay CLI |
| DLQ replay CLI usage | `./bin/dlq-replay --help` | Command-line tool for replaying failed messages from SQS dead-letter queues; supports `--dry-run`, `--from-ts`, and `--idempotency-check` flags |
| Stripe reconciliation | `scripts/stripe-reconcile.sh` | Cross-checks restored payment ledger against Stripe API export for the impacted window; outputs a discrepancy CSV for manual review |

### 8.2 Tier 2 (KYC/Wallet) Runbooks

| Procedure | Runbook Path / Command | Purpose |
|---|---|---|
| KYC provider backfill | `docs/runbooks/kyc-backfill.md` | Re-imports KYC statuses from Sumsub/Onfido API based on user ID ranges; handles rate limiting and idempotency |
| Wallet address verification | `scripts/wallet-verify.sh` | Validates restored wallet address mappings against on-chain signature proofs; flags mismatches for manual review |

### 8.3 Tier 3 (Chain State) Runbooks

| Procedure | Runbook Path / Command | Purpose |
|---|---|---|
| Cosmos node restore | `docs/runbooks/cosmos-restore.md` | Step-by-step sentry node restore from genesis export, including `unsafe-reset-all` and peering validation |
| Indexer re-sync | `make indexer-resync` | Drops and rebuilds derived indexer views from the restored chain node; estimated time: 2-3 hours for full history |

---

## 9. Incident Commander Roles and Communication Tree

A declared disaster requires a formal command structure to prevent decision paralysis and ensure stakeholder alignment.

### 9.1 Role Definitions

| Role | Primary Responsibility | Backup |
|---|---|---|
| **Incident Commander (IC)** | Ultimate decision authority. Declares disaster level, approves maintenance mode, coordinates all response activity. Owns communication with executive leadership. | Director of Engineering |
| **Technical Lead (TL)** | Owns the technical execution of the recovery runbooks. Directs engineers through restoration steps. Validates system recovery health before IC declares all-clear. | Senior Platform Engineer |
| **Communications Lead (CL)** | Drafts and distributes all external status updates (Statuspage, customer support tickets, social media). Maintains the incident timeline log for the postmortem. | Product Manager |
| **Liaison — Merchants** | Handles direct communication with key enterprise merchants during extended outages. Escalates merchant-specific recovery priorities to the IC. | Account Management Lead |
| **Forensics Lead** | Activated only during security-related incidents (ransomware, breach). Preserves evidence, coordinates with external IR firm, interfaces with law enforcement. | CISO or delegate |

### 9.2 Communication Tree

```
Executive Leadership (CEO, CTO, CFO)
       ▲ hourly briefing
       │
       ▼
Incident Commander (Slack #incident-command — voice channel open 24/7)
  ├─ Technical Lead
  │    ├─ Platform Engineers (on-call + backup)
  │    ├─ Backend Engineers (payment domain)
  │    └─ DevOps / SRE
  ├─ Communications Lead
  │    ├─ Statuspage updates every 30 minutes minimum
  │    ├─ Support team distribution (Zendesk macro updates)
  │    └─ Social media / blog post for outages > 1 hour
  └─ Merchant Liaison
       └─ Top-20 merchants by GMV receive direct email/Slack every 60 minutes
```

### 9.3 Declaration Protocol

- **DRILL**: Announced via calendar invite + Slack #engineering 24 hours in advance. No actual maintenance mode or traffic shifting.
- **SEV-2 incident**: Automated monitoring alerts the on-call engineer. If recovery is not progressing within Tier 1 RTO/2, the on-call engineer escalates to Incident Commander who activates the full tree.
- **SEV-1 disaster**: Any of: payment processing down > 15 minutes, confirmed data corruption, confirmed ransomware. IC must activate the full communication tree within 10 minutes of declaration.

---

## 10. Postmortem Template

Every declared SEV-1 disaster and every failed DR drill requires a postmortem document to be completed within 5 business days. The postmortem is blameless and focuses on systemic improvements rather than individual accountability.

```
# Postmortem: <Incident Title>
Date of Incident: YYYY-MM-DD
Incident ID: INC-XXXX
Author: <Name>
Status: Draft | In Review | Resolved

## 1. Executive Summary
One paragraph summarizing what happened, business impact, and key remediation direction.

## 2. Timeline (UTC)
All times in UTC. Include automated alerts, human actions, and state changes.

| Timestamp (UTC) | Event | Actor |
|---|---|---|
| YYYY-MM-DD HH:MM | <First automated alert fired> | Prometheus / Alertmanager |
| YYYY-MM-DD HH:MM | <On-call acknowledges> | Engineer Name |
| YYYY-MM-DD HH:MM | <Incident declared SEV-1> | IC Name |
| YYYY-MM-DD HH:MM | <Maintenance mode enabled> | TL Name |
| ... | ... | ... |
| YYYY-MM-DD HH:MM | <All-clear declared> | IC Name |

## 3. Impact Assessment
Quantified business impact. Must include:
- User-facing downtime duration per tier
- Transaction count affected (successful payments blocked, KYC submissions dropped, etc.)
- Financial impact: lost fees, merchant penalties, emergency spend
- Customer support ticket volume spike
- SLA/SLO breach status (yes/no + % over target)

## 4. Root Cause Analysis
Detailed technical description of root cause(s). Use 5-Whys or Fishbone methodology.
Must distinguish between the immediate trigger and underlying systemic gaps.

## 5. Immediate Remediation Steps Performed
Chronological list of actions taken to restore service during the incident.
Include both successful actions and dead ends explored.

## 6. Action Items
Prioritized, trackable remediation items to prevent recurrence.
```

### Action Items Table Format

| ID | Action Item | Owner | Priority | Due Date | Status | Linked Tier |
|---|---|---|---|---|---|---|
| INC-XXXX-01 | <Specific action with testable completion criterion> | Name | P0/P1/P2 | YYYY-MM-DD | Open | Tier 1 |
| INC-XXXX-02 | ... | ... | ... | ... | ... | ... |

---

## 11. DR Drill Schedule and Cadence

### 11.1 Scheduled Drills

| Drill Date | Drill Type | Tiers Covered | Runbooks Exercised |
|---|---|---|---|
| **2026-08-30** | First full-tabletop + technical restore drill | Tier 1, Tier 2, Tier 3 | All runbooks in Section 8 |
| 2026-11-30 | Q4 technical drill | Tier 1, Tier 3 | Mongo PIT restore, Cosmos weekly |
| 2027-02-28 | Q1 ransomware simulation | All tiers | Section 7 air-gap + Glacier restore |
| 2027-05-31 | Q2 Tier 2 deep-dive | Tier 2 | KYC backfill, wallet verify |
| Quarterly thereafter, repeating cadence | Full + focused rotation | All tiers | Rotating emphasis |

### 11.2 Drill Conduct Rules

1. The first drill on **2026-08-30** is mandatory for all engineers in the command tree (IC, TL, CL, Liaison roles)
2. At least one drill per year must include a surprise activation (no advance notification) to validate true response time
3. Every drill must exercise at least one runbook from Section 8 with actual command execution (not just tabletop discussion)
4. Evidence from every drill must be logged in the Evidence Table below within 24 hours of drill completion
5. Failed drills (see Pass/Fail criteria in Section 12.2) trigger an abbreviated postmortem per Section 10 within 3 business days

---

## 12. DR Drill Evidence Template

The following table is the system of record for DR drill evidence. Rows are appended after each drill by the engineer who ran the drill. Evidence includes command output screenshots, restoration validation logs, and reconciliation reports stored in `docs/drills/evidence/<incident-id>/`.

### 12.1 Evidence Table

| Drill Date | Person Who Ran Drill | Tiers Covered | Target RTO | Actual RTO | Target RPO | Actual RPO | Pass / Fail | Evidence Link | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-30 | _(fill after drill)_ | Tier 1, 2, 3 | T1: 30m / T2: 2h / T3: 4h | _(fill)_ | T1: 5m / T2: 15m / T3: 1h | _(fill)_ | _(fill)_ | `docs/drills/evidence/2026-08-30/` | First scheduled drill |
| YYYY-MM-DD | | | | | | | | | |
| YYYY-MM-DD | | | | | | | | | |
| YYYY-MM-DD | | | | | | | | | |
| YYYY-MM-DD | | | | | | | | | |

### 12.2 Pass/Fail Criteria

A drill is marked **PASS** only if ALL of the following conditions are met:

1. **Actual RTO ≤ Target RTO** for every tier covered in the drill
2. **Actual RPO ≤ Target RPO** for every tier covered in the drill (measured by comparing last successfully-reconstructed record timestamp vs. drill start timestamp)
3. **Reconciliation scripts pass** with 0 critical discrepancies (payment count, chain block height, KYC record count match expected values within documented tolerance)
4. **All referenced runbooks are followed** without deviation from the documented steps (or deviations are noted and approved for runbook correction)
5. **Communication tree activation** occurs within declaration protocol timelines (where applicable to the drill scope)

A drill is marked **FAIL** if any single criterion above is not met. Failed drills require:
- Root cause analysis of the gap
- Action items logged in a postmortem (Section 10)
- A remediation-retry drill scheduled within 30 days before the next regular quarterly drill

---

## Appendix A: Document Control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-08-27 | Platform Engineering | Initial DR policy publication |

This policy is reviewed quarterly or after any major infrastructure change, new system launch, or failed DR drill. Approving signatories: CTO, Director of Engineering, CISO.
