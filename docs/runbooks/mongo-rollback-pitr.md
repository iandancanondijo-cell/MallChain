# MongoDB Rollback Point-in-Time Recovery (PITR) Runbook

## Document Metadata
- **Runbook ID**: RB-MONGO-003
- **Service**: MongoDB Atlas (mallchain-prod cluster tier M60, 3-node replica set, sharded) + PostgreSQL (RDS db.r6g.4xlarge reader/writer, multi-AZ)
- **Owner**: Data Platform SRE + DBRE
- **Last Updated**: 2026-09-10
- **Approved By**: Head of Data Engineering

---

## Prerequisites

1. **Atlas CLI Installed and Authenticated**: Operator workstation must have `atlas` CLI v1.22+ installed. Confirm: `atlas auth whoami` returns a user with the `Organization Owner` or `Project Cluster Manager` role in the `mallchain-prod` Atlas project.
2. **Continuous Backups Enabled**: Confirm the source cluster has Continuous Cloud Backups (CCB) turned on with PITR retention window ≥ 7 days. Check: `atlas clusters describe mallchain-prod --output json | jq '.pitEnabled, .backupSettings.pointInTimeWindowHours'`.
3. **RDS PITR Configured**: For PostgreSQL path, verify RDS instance `mallchain-pg-prod` has `BackupRetentionPeriod >= 7` and `PointInTimeRestoreAvailable = true`. Check via `aws rds describe-db-instances --db-instance-identifier mallchain-pg-prod --query 'DBInstances[0].{Retention:BackupRetentionPeriod,PITR:LatestRestorableTime}'`.
4. **Kubernetes Admin Access**: Operator must be able to update secrets and rollout restart deployments in the `backend` namespace: `kubectl auth can-i update secrets -n backend && kubectl auth can-i rollout restart deploy -n backend` → both `yes`.
5. **Target Cluster Quota**: Verify Atlas project has quota for 1 additional M60 cluster (or same tier as source). If restoring a sharded cluster, also confirm shard count quota.
6. **Pre-Restore Baseline Export**: Before restoration begins, export counts of critical collections/tables from the current live cluster if reachable. This enables the post-restore match verification.
7. **Incident Bridge + Data Owner**: Both a live incident bridge and the designated data owner (backend engineering lead) must be present before any destructive data operations. The data owner must verbally approve the target PIT timestamp before restoration.
8. **Maintenance Mode Preparation**: Confirm the `maintenance-mode-emergency-halt.md` runbook is accessible and the operator has permissions to flip `MALLCHAIN_MAINTENANCE_MODE=1` via configmap, which MUST be set before swapping credentials to the restored cluster.

---

## Pre-declared Severity

| Scenario | Severity | Escalation | MTTR Target |
|---|---|---|---|
| Only `HighTxThroughputQueued WARN` — replication lag <30s but oplog growth alarming | SEV-4 | DataPlatform on-call email + monitoring | 1 business day |
| `MongoReplicationLagSeconds CRIT` (lag >60s for 5m), but no user-facing data errors | SEV-3 | Page DataPlatform, page Backend lead after 30m | 90 minutes |
| Replication lag >300s, OplogStale alert fired, read replicas serving stale data | SEV-2 | Page DataPlatform + SRE + Backend IC immediately | 45 minutes |
| Confirmed logical corruption (bad migration, operator UPDATE without WHERE, ransomware indicator) + PITR required | SEV-1 | Page everyone + Legal + Security, CTO approval mandatory for restore | 60 minutes to BEGIN restore |
| Post-restore: collection count mismatch >0.1% — potential data loss | SEV-1 + Data Loss Declaration | DBRE on-call + external MongoDB consultant paged | 30 minutes |

**Downtime Impact**: During PITR restore (duration proportional to cluster size, ~15 min/TB for Atlas): full writes to the cluster being restored must be frozen via maintenance mode. Total end-to-end (freeze → restore → reconfigure → unfreeze) for a 2 TB cluster: ~60-90 minutes typical.

---

## Triggers (Alert Rule Names from MO-3)

This runbook activates on the following MO-3 alert rules:

| Alert Name | Severity | Expression |
|---|---|---|
| `MongoReplicationLagSeconds` | CRIT | `mongodb_mongod_replset_member_optime_date{state: "PRIMARY"} - mongodb_mongod_replset_member_optime_date{state: "SECONDARY"} > 60 for 5m` |
| `MongoReplicationLagSevere` | CRIT | `Same expression > 300 for 2m` |
| `MongoOplogStale` | CRIT | `mongodb_mongod_replset_oplog_head_timestamp - mongodb_mongod_replset_member_last_heartbeat < -120 for 2m` |
| `HighTxThroughputQueued` | WARN | `rate(mongodb_wiredtiger_concurrent_transactions_available_total{env="prod"}[5m]) < 50 and rate(mongodb_op_counters_insert_total[5m]) > 1000` |
| `MongoGlobalLockQueueDepth` | WARN | `mongodb_global_lock_current_queue{env="prod",type="read"} + mongodb_global_lock_current_queue{env="prod",type="write"} > 500 for 10m` |
| `PostgresReplicationLagBytes` | CRIT | `pg_stat_replication_pg_wal_lsn_diff{env="prod"} > 1073741824 for 3m` |

**Compounding Alert**: Fire SEV-1 immediately if `MongoReplicationLagSeconds CRIT` + `ApiDataIntegrityCheckFailed CRIT` (logical corruption check from MO-3 synthetic monitor) fires together.

---

## Decision Tree

```
[ALERT: MongoReplicationLagSeconds CRIT OR HighTxThroughputQueued WARN]
        │
        ▼
  Is there CONFIRMED logical corruption / user-reported bad data?
  (Check #incidents, user tickets, synthetic monitors)
        │
        ├─► No corruption, just lag:
        │     ├─► Lag < 120s AND no write queuing?
        │     │     └─► Wait-and-watch.
        │     │         Add read replica. Resize oplog.
        │     │         Do NOT run PITR.
        │     │
        │     └─► Lag > 300s, oplog staleness, user complaints of stale reads
        │           └─► Attempt Replica Rebuild first (Step-by-step → Phase 1B)
        │               If replica rebuild fails → PITR.
        │
        └─► YES, Confirmed Logical Corruption (bad data visible):
                │
                ▼
        Halt writes immediately (Maintenance Mode ON)
        Establish PIT timestamp: LAST GOOD KNOWN TIME (LGKT)
        Get data-owner + CTO signoff on LGKT
                │
                ├─► MongoDB Atlas in use? → Atlas PITR path (Phase 2)
                │
                └─► PostgreSQL RDS in use? → Postgres PITR path (Phase 2-Alt)
        │
        ▼
  Compare baseline counts vs restored cluster
        │
        ├─► Match within tolerance (<0.1% delta on critical tables)
        │     └─► Swap credentials. Restart backend. Unfreeze writes.
        │
        └─► Mismatch > tolerance
              └─► SEV-1 escalation. Try earlier PIT.
                  Do NOT write to corrupted cluster.
```

---

## Step-by-step Recovery

### Phase 1A: Diagnostics and PIT Timestamp Selection (MongoDB Atlas Path)

1. Log corruption incident details with precise timeline. Interview affected users: at what exact UTC minute did they first observe bad data?
2. Identify Last Good Known Time (LGKT). Pick a timestamp at least 5 minutes BEFORE the first reported corruption, rounded down to the minute. Call this `TARGET_PIT_UTC_SEC` (Unix epoch seconds).
3. Confirm LGKT falls within PITR window:
   ```bash
   atlas clusters describe mallchain-prod \
     --projectId $ATLAS_PROJECT_ID \
     --output json | jq '.backupSettings.pointInTimeWindowHours'
   # If returns e.g. 168 → 7 days. Confirm (now - TARGET_PIT_UTC_SEC) < that many seconds.
   ```
4. Export baseline collection counts from PRIMARY (if still readable):
   ```bash
   mongosh "mongodb+srv://mallchain-prod.mongodb.net/" \
     --username admin_readonly \
     --password $(cat /secrets/mongo-admin-ro-pass) \
     --eval '
       const dbs = db.adminCommand({listDatabases:1}).databases.map(d=>d.name).filter(n=>!["admin","config","local"].includes(n));
       dbs.forEach(dn => {
         const cols = db.getSiblingDB(dn).getCollectionNames();
         cols.forEach(cn => {
           print(`${dn}.${cn}: ${db.getSiblingDB(dn).getCollection(cn).estimatedDocumentCount()}`);
         });
       });
     ' > /tmp/mongo-pre-restore-counts-$(date +%s).txt
   ```
5. **CRITICAL**: Enable maintenance mode (stops writes):
   ```bash
   ./scripts/enable-maintenance-mode.sh --reason "mongo-pitr-restore-inc${INCIDENT_NUM}" --duration 120m
   ```

### Phase 2: Atlas PIT Restore Execution

6. Construct restore command with point-in-time flag. Target cluster name is date-stamped for uniqueness:
   ```bash
   DATE_STAMP=$(date -u +%Y%m%d-%H%M)
   TARGET_CLUSTER="mallchain-restore-${DATE_STAMP}"
   SOURCE_CLUSTER="mallchain-prod"

   echo "Restoring $SOURCE_CLUSTER to $TARGET_CLUSTER with PIT = $(date -d @${TARGET_PIT_UTC_SEC} -u)"

   atlas clusters restore snapshot $SOURCE_CLUSTER \
     --projectId $ATLAS_PROJECT_ID \
     --pointInTimeUtcSeconds $TARGET_PIT_UTC_SEC \
     --targetClusterName $TARGET_CLUSTER \
     --tier M60 \
     --diskSizeGB $(atlas clusters describe $SOURCE_CLUSTER --output json | jq '.diskSizeGB') \
     --mdbVersion $(atlas clusters describe $SOURCE_CLUSTER --output json | jq -r '.mongoDBMajorVersion') \
     --regionName us-east-1
   ```

7. Poll restore status every 60 seconds. Typical duration: 30-90 minutes.
   ```bash
   while true; do
     STATUS=$(atlas clusters describe $TARGET_CLUSTER --projectId $ATLAS_PROJECT_ID --output json | jq -r '.stateName')
     echo "$(date -u +%H:%M:%SZ) Cluster state: $STATUS"
     if [ "$STATUS" = "IDLE" ]; then echo "Restore complete"; break; fi
     if [ "$STATUS" = "FAILED" ]; then echo "RESTORE FAILED — see Atlas UI logs"; exit 1; fi
     sleep 60
   done
   ```
8. When cluster reaches `IDLE`, update IP access list and database users to match source:
   ```bash
   # Copy network access list
   atlas accessLists list --projectId $ATLAS_PROJECT_ID -o json | jq -c '.[]' | while read entry; do
     atlas accessLists create $(echo $entry | jq -r '.cidrBlock // .awsSecurityGroup') \
       --comment "$(echo $entry | jq -r '.comment')-restored-clone" \
       --projectId $ATLAS_PROJECT_ID
   done
   # Copy DB users (rotate passwords, save to new secret location)
   ```

### Phase 3: Post-Restore Validation (Collections Match)

9. Run identical count query against restored cluster:
   ```bash
   mongosh "mongodb+srv://${TARGET_CLUSTER}.mongodb.net/" \
     --username admin_readonly \
     --password $(cat /secrets/mongo-admin-ro-pass) \
     --eval ' [SAME AS STEP 4] ' > /tmp/mongo-post-restore-counts-${DATE_STAMP}.txt
   ```

10. Compute delta, fail if > 0.1% on any critical collection:
    ```bash
    python3 -c "
    import re, sys
    pre = dict(re.findall(r'([\w.-]+):\s*(\d+)', open('/tmp/mongo-pre-restore-counts-*.txt').read()))
    post = dict(re.findall(r'([\w.-]+):\s*(\d+)', open('/tmp/mongo-post-restore-counts-*.txt').read()))
    failed = False
    for col in ['payments.payment_intents','inventory.stock_items','users.wallets','orders.order_headers']:
        p, q = int(pre.get(col,-1)), int(post.get(col,-1))
        if p == -1: continue
        delta = abs(p-q)/p*100 if p else 0
        status = 'PASS' if delta < 0.1 else 'FAIL'
        if status == 'FAIL': failed = True
        print(f'{col}: pre={p} post={q} delta={delta:.4f}% [{status}]')
    sys.exit(1 if failed else 0)
    "
    ```
    If ANY critical collection FAILS — do NOT proceed. Escalate to DBRE. Try an earlier PIT timestamp.

### Phase 4: Kubernetes Secret Update and Backend Restart

11. Create the new k8s Secret for mongo-credentials pointing at restored cluster:
    ```bash
    kubectl create secret generic mongo-credentials \
      -n backend \
      --from-literal=connection-string="mongodb+srv://app_user:${NEW_APP_PASS}@${TARGET_CLUSTER}.mongodb.net/mallchain?retryWrites=true&w=majority&readPreference=primaryPreferred" \
      --from-literal=db-name=mallchain \
      --dry-run=client -o yaml | kubectl apply -f -
    ```
    Note: If you prefer `replace` instead of apply, use `kubectl create secret generic ... --dry-run=client -o yaml | kubectl replace -f -`.

12. Restart backend deployments to pick up new secret:
    ```bash
    kubectl rollout restart deployment/mallchain-api -n backend
    kubectl rollout restart deployment/mallchain-worker-payments -n backend
    kubectl rollout restart deployment/mallchain-worker-inventory -n backend
    kubectl rollout status deployment/mallchain-api -n backend --timeout=180s
    ```

13. Run data-integrity synthetic check (MO-3 smoke test endpoint):
    ```bash
    curl -H "Authorization: Bearer $SYNTHETIC_TOKEN" \
      https://api.mallchain.io/internal/health/data-integrity | jq
    ```
    Expect all checks `status: pass`.

14. **Only after all checks pass**: Disable maintenance mode.
    ```bash
    ./scripts/disable-maintenance-mode.sh
    ```

### Phase 2-Alt: PostgreSQL PIT Recovery (Equivalent Path for Postgres)

**Use this path when the affected datastore is the `mallchain-pg-prod` RDS PostgreSQL instance.**

A1. Same PIT timestamp selection as Phase 1A step 1-2.
A2. Baseline row counts:
    ```bash
    psql $PG_PROD_CONN_STR -c "
    SELECT schemaname, relname, n_live_tup
    FROM pg_stat_user_tables
    WHERE schemaname IN ('payments','inventory','users','orders')
    ORDER BY schemaname, relname;
    " > /tmp/pg-pre-restore-counts-$(date +%s).txt
    ```
A3. Maintenance mode ON: `./scripts/enable-maintenance-mode.sh`
A4. RDS PIT restore command:
    ```bash
    DATE_STAMP=$(date -u +%Y%m%d-%H%M)
    RESTORED_ID="mallchain-pg-restore-${DATE_STAMP}"
    TARGET_PIT_ISO=$(date -u -d @${TARGET_PIT_UTC_SEC} +%Y-%m-%dT%H:%M:%SZ)

    aws rds restore-db-instance-to-point-in-time \
      --source-db-instance-identifier mallchain-pg-prod \
      --target-db-instance-identifier $RESTORED_ID \
      --restore-time $TARGET_PIT_ISO \
      --db-instance-class db.r6g.4xlarge \
      --multi-az \
      --publicly-accessible \
      --vpc-security-group-ids sg-prod-db-01 \
      --db-subnet-group-name prod-db-subnet \
      --no-deletion-protection
    ```
A5. Poll until `DBInstanceStatus = available`:
    ```bash
    aws rds wait db-instance-available --db-instance-identifier $RESTORED_ID
    ```
A6. If logical dump is preferred over RDS PITR (e.g., custom timeline or cross-account), alternative:
    ```bash
    # Point WAL archive to target time and run pg_restore:
    pg_restore --host=$PG_RESTORED_ENDPOINT \
               --port=5432 \
               --username=postgres_admin \
               --dbname=mallchain \
               --format=custom \
               --jobs=4 \
               --verbose \
               /mnt/wal-archive/pitr-snapshot-${TARGET_PIT_UTC_SEC}.dump
    ```
A7. Post-restore row count validation (same as Phase 3, using PostgreSQL counts).
A8. Update Kubernetes secret `postgres-credentials` and restart deployments same as Phase 4.

---

## Verification

1. **Cluster Credentials Correct**:
   ```bash
   kubectl exec -n backend deploy/mallchain-api -c api -- sh -c 'python3 -c "import pymongo; c=pymongo.MongoClient(\"'\"$MONGO_CONN_STR\"'\"); print(c.server_info()[\"version\"]); print(c.list_database_names()[:5])"'
   ```
   Expected: Returns MongoDB version matching restored cluster and lists the `mallchain` database.

2. **Critical Path E2E Test**:
   ```bash
   curl -s https://api.mallchain.io/v1/products/sku-999-price-check | jq '.price,.stock'
   curl -s -X POST https://api.mallchain.io/v1/payments/test-intent \
        -H 'Content-Type: application/json' \
        -d '{"amount":100,"currency":"KES","customer_id":"test-restore-valid"}' | jq '.status'
   ```
   Expected: Product price returns; test payment intent returns `status: requires_payment_method`.

3. **Replication Lag Cleared**:
   ```bash
   promtool query instant 'max(mongodb_mongod_replset_member_optime_date{state="PRIMARY",cluster=~"'$TARGET_CLUSTER'"} - mongodb_mongod_replset_member_optime_date{state="SECONDARY",cluster=~"'$TARGET_CLUSTER'"})'
   ```
   Expected: Result < 2.0 seconds.

4. **Secret Rotation Audit**:
   ```bash
   kubectl get events -n backend --sort-by='.lastTimestamp' | grep -iE 'mongo-credentials|postgres-credentials' | tail -5
   ```
   Expected: Shows one recent `Updated` event referencing the new credentials with timestamp matching restoration window.

5. **Prometheus Alert Clearance**: `MongoReplicationLagSeconds CRIT`, `MongoOplogStale`, `HighTxThroughputQueued WARN` all RESOLVED for 5+ minutes.

6. **Old Cluster Isolation**: Confirm original cluster's `mallchain-prod` app user password has been rotated so restored cluster is the ONLY cluster accepting backend traffic.

---

## Postmortem Prompts

1. **Corruption Vector**: What caused the data corruption event? Was it a bad migration script (which one — link to PR), manual operator query (who — include audit log ID), application bug (which line of code), or an actual security event? Attach the EXACT offending query.
2. **PIT Timestamp Accuracy**: Was the chosen LGKT truly the last good time? Was any good data lost by restoring too early? Count rows lost vs corruption avoided. Recommend improvements to synthetic monitoring timestamps.
3. **Duration Breakdown**: Measure and graph time spent: Diagnostic (steps 1-5) → Restore (6-8) → Validate (9-10) → Cut-over (11-14). Which phase took the longest? Propose automation to reduce the bottleneck.
4. **Count-Delta Threshold**: Was the 0.1% delta tolerance correct? If we encountered 0.08% delta — was that truly data loss or just counter drift?
5. **Credential Swap Safety**: Did maintenance mode fully prevent in-flight writes to the old cluster after credential swap? Check application logs for any connection errors during the rollout window.
6. **Postgres Equivalency Exercise**: If the incident was on Mongo, walk through the Postgres Alt path mentally. Are there missing steps in the Postgres section? Specifically around `pg_stat_statements` reset, `pg_restore --jobs` tuning, and logical replication slot handling?
7. **SLO Impact**: Calculate actual data-staleness SLO consumption. Did we breach our 5-minute RPO? What about RTO — was the incident resolved within MTTR?
8. **Backup Frequency Review**: Current PITR continuous backup window is X days. Given the time it took to detect corruption (Y minutes/hours), is X sufficient? Should we also retain weekly snapshots for 90 days?
9. **Preventive Action Items**: What guardrails prevent recurrence? Query timeout? App-level write-audit? MongoDB `enableMajorityReadConcern` enforced? Migration dry-run mandatory? List 3 SMART action items with owners.
10. **Runbook Gap Fill**: During execution, what step was missing or wrong in this runbook? Were the commands tested? Submit PR to correct and add your name in "Contributors" section.
