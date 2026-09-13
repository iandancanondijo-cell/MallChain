# Redis Failover and Memory Fragmentation Recovery Runbook

## Document Metadata
- **Runbook ID**: RB-REDIS-002
- **Service**: Redis Cluster with Sentinel (redis-master, redis-replica-1/2, sentinel-0/1/2)
- **Owner**: SRE Team — Data Platform
- **Last Updated**: 2026-09-10
- **Approved By**: Head of Platform

---

## Prerequisites

Before initiating failover or recovery steps:

1. **Sentinel Connectivity**: Operator must have `redis-cli` installed and network access to all 3 sentinel nodes on port 26379 from the bastion host. Validate: `redis-cli -h sentinel-0.prod.internal -p 26379 ping` → `PONG`.
2. **Sentinel Quorum**: Confirm `quorum = 2` (or matching the deployment) is active. If fewer than 2 sentinels can agree, fix sentinel cluster BEFORE attempting master failover.
3. **Memory Diagnostic Permissions**: Operator must hold `redis-admin` IAM role which grants `DEBUG OBJECT`, `MEMORY USAGE`, and `--bigkeys` scan permissions.
4. **Backend Rate Limit Bypass**: Coordinate with the backend team to temporarily disable (or raise by 10x) any Redis-dependent rate limits during the failover window. This prevents cascading 429 errors during the <10s cutover.
5. **Rollback Snapshot**: If failover is triggered by `RedisDown CRIT` (not just fragmentation WARN), take an RDB snapshot of the current master BEFORE making topology changes IF the master is still partially reachable: `redis-cli -h OLD_MASTER --rdb /tmp/redis-pre-failover-$(date +%s).rdb`.
6. **Change Ticket Reference**: All failovers must reference an active CHG-* change ticket or incident INC-* number. Log the ticket number in step comments.
7. **Monitoring Panels Open**: The operator must have the following Grafana panels open before starting:
   - `Redis-Overview`: Replication state, connected_slaves, instantaneous_ops_per_sec
   - `Redis-Memory`: mem_fragmentation_ratio, used_memory_rss, used_memory_peak
   - `SRE-Incident-Bridge`: Live incident chat and scribe doc link

---

## Pre-declared Severity

| Scenario | Severity | Escalation Policy | MTTR Target |
|---|---|---|---|
| Only `RedisMemoryFragmentationRatio WARN` fires (>1.4 for 15m, no replication errors) | SEV-4 | SRE on-call email only, work within shift | 4 hours |
| Fragmentation >1.8 + 1 replica out of sync, master still writable | SEV-3 | Page SRE on-call, page DataPlatform on-call after 30m | 60 minutes |
| `RedisDown CRIT` fires — master node DOWN, sentinel lost quorum, reads only from replica | SEV-2 | Page SRE + DataPlatform + Backend IC immediately | 25 minutes |
| `RedisDown CRIT` + all 3 nodes unreachable (total cache unavailable, DB primary taking full load) | SEV-1 | Page everyone + CTO + enable DB read replicas emergency scaling | 15 minutes |
| Failover completed but split-brain detected (2 masters accepting writes) | SEV-1 + Data Corruption Risk | DataPlatform lead + DBRE engaged immediately | 10 minutes |

**Downtime Impact**: Redis outage causes: (a) session token lookups go to primary DB (3x latency), (b) inventory stock counts show stale, (c) price cache miss leads to DB overload after 3 minutes, (d) all rate limiting disabled. Database CPU typically spikes from 20% → 80% within 90 seconds.

---

## Triggers (Alert Rule Names from MO-3)

This runbook is activated by the combination of alerts below from MO-3 additions:

| Alert Name | Severity | Expression |
|---|---|---|
| `RedisDown` | CRIT | `redis_up{env="prod",role="master"} == 0 for 1m` |
| `RedisDownCluster` | CRIT | `min by (cluster) (redis_up{env="prod"}) == 0 for 30s` |
| `RedisReplicationLinkBroken` | CRIT | `redis_connected_slaves{env="prod",role="master"} < 2 for 2m` |
| `RedisMemoryFragmentationRatio` | WARN | `redis_mem_fragmentation_ratio{env="prod",role="master"} > 1.4 for 15m` |
| `RedisMemoryFragmentationHigh` | WARN | `redis_mem_fragmentation_ratio{env="prod",role="master"} > 1.8 for 5m` |
| `RedisMasterNotReachableViaSentinel` | CRIT | `redis_sentinel_master_status{env="prod",name="mymaster"} == 0 for 1m` |
| `RedisSentinelQuorumLost` | CRIT | `count(redis_sentinel_ok{env="prod"}) < 2 for 2m` |

**Compounding Alert Rule**: Page SEV-2 immediately if `RedisDown CRIT` AND `APIDatabaseCPUUtilization > 60` fire together (cache stampede beginning).

---

## Decision Tree

```
[ALERT: RedisDown CRIT OR RedisMemoryFragmentationRatio WARN]
        │
        ▼
  Open incident channel #inc-redis-${TS}
  Post Grafana snapshot links
        │
        ├─► Which alert fired?
        │       │
        │       ├─► ONLY Fragmentation WARN (no Down CRIT)
        │       │       │
        │       │       ├─► Fragmentation ratio between 1.4 - 1.8?
        │       │       │       └─► Skip failover.
        │       │       │           Jump to Step-by-step → Fragmentation Repair
        │       │       │
        │       │       └─► Fragmentation > 1.8?
        │       │               └─► Run --bigkeys scan first.
        │       │                   If volatile keys > 40%, run failover.
        │       │
        │       └─► RedisDown CRIT fired
        │               │
        │               └─► Can sentinel-0 reach the current master?
        │                       │
        │                       ├─► Yes (ping OK)
        │                       │     └─► Is master actually healthy?
        │                       │             Run INFO replication.
        │                       │             If ops/sec normal → False alert.
        │                       │             Clear and investigate flapping.
        │                       │
        │                       └─► No (no ping, timeout, or role=unknown)
        │                             └─► CONTINUE TO FAILOVER PROCEDURE
        │
        ▼
  Confirm sentinel quorum >= 2
        │
        ├─► Yes → Proceed with sentinel failover
        │
        └─► No  → Manual intervention required.
                  Connect directly to replicas.
                  Pick replica with highest master_repl_offset.
                  Promote manually (see Rollback section).
```

---

## Step-by-step Recovery

### Phase 1: Diagnostic and Topology Capture

1. Log into the Redis bastion and dump current replication state from all nodes:
   ```bash
   for host in redis-0 redis-1 redis-2; do
     echo "===== $host ====="
     redis-cli -h $host -a $(cat /var/run/secrets/redis-password) INFO replication | head -20
     echo ""
   done
   ```
   Scribe records: Note which node has `role:master`, list each replica's `master_link_status`, and record `master_repl_offset` on all nodes.

2. If fragmentation alerts are active, capture fragmentation baseline:
   ```bash
   for host in redis-0 redis-1 redis-2; do
     echo "===== $host memory ====="
     redis-cli -h $host -a $(cat /var/run/secrets/redis-password) INFO memory | grep -E "fragmentation_ratio|used_memory_human|used_memory_rss_human"
   done
   ```

3. Confirm sentinel view of the master:
   ```bash
   redis-cli -h sentinel-0 -p 26379 SENTINEL get-master-addr-by-name mymaster
   # Expected output: IP + PORT of master
   ```

### Phase 2: Sentinel-Initiated Failover

4. Execute sentinel-managed failover. This command blocks until the sentinel quorum agrees on a new master:
   ```bash
   echo "[INC-${INCIDENT_NUM}] Initiating sentinel failover at $(date -u +%H:%M:%SZ)"
   redis-cli -h sentinel-0 -p 26379 SENTINEL failover mymaster
   # Expected: +OK
   ```

5. Poll sentinel every 3 seconds for up to 90 seconds, monitoring the failover progress:
   ```bash
   for i in $(seq 1 30); do
     echo "--- Poll $i at $(date +%H:%M:%S) ---"
     redis-cli -h sentinel-0 -p 26379 SENTINEL master mymaster | grep -E "ip|port|flags|num-slaves|last-ok-ping-reply"
     echo ""
     sleep 3
   done
   ```

6. Expected flags transition during a healthy failover:
   - `flags=master` on old master → `flags=master,down` → `flags=s_down` (removed after ~10s)
   - One replica flags transition: `flags=slave` → `flags=slave,promoted` → `flags=master`

### Phase 3: Verify New Master Election

7. On the newly elected master, confirm `role:master` and replica count:
   ```bash
   NEW_MASTER=$(redis-cli -h sentinel-0 -p 26379 SENTINEL get-master-addr-by-name mymaster | head -1)
   echo "New master IP reported by sentinel: $NEW_MASTER"
   redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) INFO replication
   ```
   Expected output contains: `role:master`, `connected_slaves:2`, and each slave line shows `state=online,offset=...,lag=0` or `lag=1`.

8. Validate write/read path to new master:
   ```bash
   TEST_KEY="failover-test:$(date +%s)"
   redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) SET $TEST_KEY "passed" EX 300
   redis-cli -h redis-1 -a $(cat /var/run/secrets/redis-password) GET $TEST_KEY
   redis-cli -h redis-2 -a $(cat /var/run/secrets/redis-password) GET $TEST_KEY
   ```
   Expected: Both replicas return `"passed"` with replication lag under 1 second.

### Phase 4: Reattach Old Master as Replica

9. Identify the old master (now likely offline or in `role:master` orphan state). SSH into the old master host:
   ```bash
   ssh OLD_MASTER_HOST
   # Check its current view of the world
   redis-cli -h 127.0.0.1 -a $(cat /var/run/secrets/redis-password) INFO replication
   ```

10. Force old master to become replica of the new master:
    ```bash
    redis-cli -h OLD_MASTER_HOST -a $(cat /var/run/secrets/redis-password) REPLICAOF $NEW_MASTER 6379
    # Expected: +OK
    ```

11. Wait 15 seconds then re-verify on the new master that `connected_slaves:2`.

### Phase 5: Memory Fragmentation Repair (if WARN triggered)

12. If fragmentation ratio > 1.8, run a bigkeys scan to identify culprits (run against new master):
    ```bash
    redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) --bigkeys -i 0.1 > /tmp/bigkeys-scan-$(date +%s).txt 2>&1
    echo "Biggest keys:"
    tail -30 /tmp/bigkeys-scan-*.txt | grep -E "Biggest|summary"
    ```
    Run this with `-i 0.1` (100ms pause between 100 keys) to avoid saturating the server during post-failover recovery.

13. If fragmentation > 2.2 AND 60%+ of keys are TTL-backed volatile keys, trigger a background rewrite:
    ```bash
    redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) BGREWRITEAOF
    # Then after 2 min, check:
    redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) INFO persistence | grep aof_rewrite_in_progress
    ```

### Rollback Steps (If Failover Incomplete / Split Brain)

**TRIGGER**: If after 90 seconds two different nodes both report `role:master` when probed directly (bypassing sentinel):

1. Freeze client writes by running emergency maintenance mode:
   ```bash
   kubectl annotate deployment/mallchain-api -n backend mallchain.io/maintenance="redis-split-brain" --overwrite
   ```

2. Pick the authoritative master: choose the node with the HIGHEST `master_repl_offset` value captured in Phase 1. Let this be `AUTH_MASTER`.

3. On the *wrong* master (lower offset):
   ```bash
   redis-cli -h WRONG_MASTER -a $(cat /var/run/secrets/redis-password) REPLICAOF $AUTH_MASTER 6379
   redis-cli -h WRONG_MASTER -a $(cat /var/run/secrets/redis-password) CONFIG SET slave-read-only yes
   ```

4. Manually inform sentinels of corrected topology:
   ```bash
   for s in sentinel-0 sentinel-1 sentinel-2; do
     redis-cli -h $s -p 26379 SENTINEL reset mymaster
   done
   sleep 10
   redis-cli -h sentinel-0 -p 26379 SENTINEL master mymaster
   ```

5. Diff any writes accepted by the wrong master during split window: Compare the RDB snapshot (Prerequisite 5) against current state. If divergence exists, engage DataPlatform for key-level merge.

6. Unfreeze clients only after DBRE signs off on data consistency.

---

## Verification

Complete ALL checks before declaring incident resolved:

1. **Sentinel Consensus**:
   ```bash
   for s in sentinel-0 sentinel-1 sentinel-2; do
     echo "$s reports:"
     redis-cli -h $s -p 26379 SENTINEL get-master-addr-by-name mymaster
   done
   ```
   Expected: All 3 sentinels return the SAME IP:PORT.

2. **Replication Topology**:
   ```bash
   redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) INFO replication | grep -E "role|connected_slaves|slave.*state"
   ```
   Expected: `role:master`, `connected_slaves:2`, both show `state=online`.

3. **Fragmentation (if applicable)**:
   ```bash
   redis-cli -h $NEW_MASTER -a $(cat /var/run/secrets/redis-password) INFO memory | grep mem_fragmentation_ratio
   ```
   Expected: `mem_fragmentation_ratio` < 1.2 on the new master (failover restarts the process, resetting RSS).

4. **Backend API Redis Connection Pool**:
   ```bash
   kubectl exec -n backend deploy/mallchain-api -c api -- redis-cli -h redis.prod.internal PING
   kubectl get pods -n backend -l app=mallchain-api
   ```
   Expected: `PONG`. All pods Running/Ready, no new restarts during failover window.

5. **Inventory Cache Hit Rate**:
   ```bash
   # Grafana panel query shortcut — confirm via promtool:
   promtool query instant 'sum(rate(redis_keyspace_hits_total{env="prod",keyspace="inventory"}[2m])) / sum(rate(redis_keyspace_hits_total{env="prod",keyspace="inventory"}[2m]) + rate(redis_keyspace_misses_total{env="prod",keyspace="inventory"}[2m]))'
   ```
   Expected: Hit rate returns to baseline (>92%) within 5 minutes of failover completion.

6. **Prometheus Alert Clearance**: `RedisDown CRIT` → RESOLVED for >5 minutes. If fragmentation was trigger, `RedisMemoryFragmentationRatio` → RESOLVED.

---

## Postmortem Prompts

The incident assignee must draft a postmortem within 48 hours addressing:

1. **Failure Mode Analysis**: Was the RedisDown alert a true node failure, a network partition, an OOM-kill, a kernel panic, or excessive GC pause? Cite dmesg or `/var/log/redis/redis-server.log` lines.
2. **Sentinel Effectiveness**: Did sentinel detect the failure within the expected `down-after-milliseconds` window? If detection took longer, why? How long between `+sdown` and `+failover-triggered` sentinel events?
3. **Fragmentation Root Cause**: If fragmentation triggered the WARN — which key patterns drove the fragmentation? Was it hash-field churn? Many small strings? LIST with repeated LPOP/LPUSH? Recommend a data structure change if appropriate.
4. **`--bigkeys` Scan Impact**: Did the `-i 0.1` throttled scan impact QPS during recovery? Should it be even more throttled or offloaded to a replica?
5. **Data Loss Window**: What is the maximum `master_repl_offset` delta between the old master down-moment and the elected new master? How many write operations does that translate to? Are those writes covered by DB write-through (no actual loss)?
6. **Rollback Efficacy Review**: Was split-brain scenario encountered? If so, did the manual REPLICAOF intervention work? If not, what additional checks should be added to this runbook?
7. **SLO Impact**: Compute cache hit-rate SLO degradation. Is the 30-day rolling `inventory-cache-hit-rate > 92%` still met? If not, has error budget been consumed >10%?
8. **Configuration Tuning**: Should `repl-backlog-size` be increased? Should `min-replicas-to-write 1` and `min-replicas-max-lag 5` be activated to prevent silent data loss?
9. **Capacity Planning**: Current Redis memory footprint is X GB with peak Y GB. Is the 30% headroom rule (`maxmemory-policy allkeys-lru`, `maxmemory = 70% of node RAM`) maintained after this incident? If not, propose instance size upgrade.
10. **Alert Tuning**: Were any alerts noisy? Should `RedisMemoryFragmentationRatio WARN` threshold shift from 1.4 → 1.6? Should we add a predictive alert on `mem_fragmentation_bytes` derivative?
