# Runbook: Roll Back a Bad Deploy in 2 Minutes

## Preamble: When to Use This Runbook

This runbook is the **2-minute emergency rollback procedure** for Mallchain's
three-tier production deployment. Execute it *immediately* if any of the following
are true within 15 minutes of a deploy:

- 5xx error rate on `/health` or any user-facing endpoint stays above **2%** for
  more than 60 seconds (see monitoring/prometheus/alert_rules.yml).
- User-reported "site down / can't log in / transactions stuck" reports from
  more than one independent source and confirmed by on-call.
- Data corruption symptoms: KYC state disappearing, wallet balances jumping
  by more than 1% in aggregate, duplicate `TreasuryLedger` entries in MongoDB.
- Any on-call engineer's "smell test" says the deploy is wrong (trust the
  smell test — roll back first, debug later).

**Do NOT waste time debugging.** The 3-tier rollback below takes about 90 seconds
end-to-end. Once the site is stable on the previous image, you can take all the
time you need to debug the bad tag in staging.

## Overview: 3 Tiers + 2 Data Stores

Mallchain production runs in the `mallchain` Kubernetes namespace, with five
components you may need to touch during a rollback. In order of decreasing
probability of needing intervention:

| # | Tier              | K8s resource kind | Rollback mechanism (native? |
|---|-------------------|-------------------|-----------------------------|
| 1 | Backend API       | `Deployment/backend` | `kubectl rollout undo` (native) |
| 2 | Frontend (SPA)    | `Deployment/frontend` | `kubectl rollout undo` (native) |
| 3 | marketplaced (Cosmos chain) | `StatefulSet/marketplaced` | **image patch** (STS has no native `rollout undo`) |
| 4 | MongoDB (Atlas)   | — (managed)       | Point-in-time restore (5-min snapshots) |
| 5 | Redis (ElastiCache/self) | `StatefulSet/redis` / managed | Replica failover (only if data corrupted) |

Tiers 1–3 are **stateless or chain-replicated**: rolling them back to a
previous image tag is safe even if you do it blindly. Tiers 4 and 5 are
stateful data stores — you should only touch them if you confirmed the bad
deploy **mutated on-disk state** (bad migration, corrupted wallet cache, etc.).

> **Maintenance mode rule (MUST):** Before rolling back tiers 1–3, enable
> **maintenance mode** to halt writes from landing during the rollback window.
> See "Step 0: Maintenance Mode Halt" below. Skipping this step creates a
> race where the backend accepts a write at the same moment the old image
> comes up and the Pod restarts — you can land a write the new code intended
> but the old code doesn't know how to process (orphaned escrow rows, etc.).

---

## Prerequisites (Check These ONCE Per Shift, Not Per Incident)

Before you are on-call for rollback, verify the following are true:

1. **You have a working `kubectl`** with context pointing at the production
   EKS cluster and namespace defaulted to `mallchain`. Run:
   ```bash
   kubectl config current-context          # should be arn:...:cluster/mallchain-prod-eu-west-1
   kubectl -n mallchain get pods           # should list backend/frontend/marketplaced pods
   ```
2. **You have Atlas console access** (or the Atlas CLI with a token that can
   trigger a PIT restore on the `prod-marketplace` cluster).
3. **The cluster has a working `redis-cli` client pod** or you have `redis-cli`
   locally and network access to the Redis sentinel/endpoint.
4. **The maintenance-mode endpoint is reachable.** See Step 0.
5. **You know the previous GOOD image tag.** If the deploy was from the
   `Deploy` GitHub Actions workflow (`.github/workflows/deploy.yml`), the
   previous tag is either `sha-<old-sha>` or `v1.x.y`. In a pinch, just use
   `kubectl -n mallchain rollout history deployment/backend` — it lists
   revisions with annotations including the image digest used.

---

## Step 0: Enable Maintenance Mode (Halt Writes — 30 Seconds)

**Do this FIRST, before touching any Kubernetes resource.**

Mallchain has a maintenance-mode switch in the backend that flips all
write-path endpoints (auth, wallet, transfers, KYC, marketplace listing
create/update) to return HTTP `503 Service Unavailable` with a
`Retry-After` header while still serving read-only GETs and health checks.
Maintenance mode is persisted in MongoDB via the `MaintenanceMode` model
(backend/src/models/MaintenanceMode.js), so it survives Pod restarts.

### Enable via admin API (preferred):

```bash
# Use the admin API key (same one used for rate-limit bypass / ops tooling).
# This hits the currently-running backend — if the bad deploy broke the admin
# endpoint entirely, skip to the direct-Mongo fallback below.
curl -s -X POST \
  -H "x-api-key: ${OPS_ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "reason": "emergency rollback", "halted_by": "on-call-handle"}' \
  https://api.mallchain.example.com/admin/maintenance-mode

# Confirm: returns {"enabled":true,"..."}. All write endpoints now 503.
```

### Fallback: flip directly in Mongo (if admin API is down):

If the bad deploy broke the admin endpoint (e.g., broken middleware that
rejects the x-api-key before it reaches the handler), flip the flag directly
in MongoDB. You can use an Atlas Data API call, `mongosh` from the bastion,
or even port-forward into a temporary pod:

```bash
# From the ops bastion with mongosh:
mongosh "mongodb+srv://prod-mallchain.<id>.mongodb.net/marketplace" \
  --apiVersion 1 --username ops_rollback --password "${MONGO_OPS_PASSWORD}" \
  --eval 'db.maintenancemodes.updateOne({}, {$set: {enabled: true, reason: "emergency rollback", haltedBy: "on-call", updatedAt: new Date()}}, {upsert: true})'
```

### Confirm maintenance mode is active:

```bash
# Any write-path endpoint should 503. GETs (including /health) still work.
curl -s -o /dev/null -w "%{http_code}" https://api.mallchain.example.com/auth/login
# Expected: 503
curl -s -o /dev/null -w "%{http_code}" https://api.mallchain.example.com/health
# Expected: 200 or 204
```

Disable maintenance mode only AFTER all 3 tiers are verified rolled back
AND (if you did a Mongo PIT restore) the database is back online.

---

## Step 1: Roll Back Backend Deployment (15 Seconds)

The backend `Deployment` (`backend/src/index.js` → `infra/k8s/10-backend.yaml`)
supports native Kubernetes `rollout undo`. By default each deployment keeps
the last **10** `revisionHistoryLimit`, so unless the bad deploy was the
11th consecutive deploy in a day without cleanup, the previous revision is
still in the history.

### Option A: Undo to the immediately previous revision (90% of incidents):

```bash
# 1. Confirm which revision is bad and which is good.
kubectl -n mallchain rollout history deployment/backend
# Output columns: REVISION  CHANGE-CAUSE  (you'll see N+1 = bad deploy, N = good)
# Example:
# REVISION  CHANGE-CAUSE
# 47        kubernetes.io/change-cause: deploy sha-abc1234 (old, GOOD)
# 48        kubernetes.io/change-cause: deploy sha-def5678 (current, BAD)

# 2. Undo one revision back (48 → 47 in the example above).
kubectl -n mallchain rollout undo deployment/backend
# deployment.apps/backend rolled back

# 3. Wait for rollout to complete (blocks until Ready replicas match Desired).
kubectl -n mallchain rollout status deployment/backend --timeout=3m
# Waiting for deployment "backend" rollout to finish: 2 of 5 updated replicas are available...
# deployment "backend" successfully rolled out
```

### Option B: Undo to a specific revision (N):

If you know exactly which revision is good (e.g., you ran `rollout history`
and revision 42 is the last known-good from the `v1.14.3` tag deploy), use
`--to-revision`:

```bash
kubectl -n mallchain rollout undo deployment/backend --to-revision=42
kubectl -n mallchain rollout status deployment/backend --timeout=3m
```

### Verify the backend is back on the old version:

```bash
# Check the running image tag in any ready pod.
kubectl -n mallchain get pods -l app=backend -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | head -1
# Expected: 123456789012.dkr.ecr.eu-west-1.amazonaws.com/mallchain-backend:sha-abc1234 (old tag), NOT the :sha-def5678 tag you rolled back from.

# Hit /version or /health — confirm the reported build SHA matches.
curl -s https://api.mallchain.example.com/health | jq '.buildSha, .imageTag'
```

---

## Step 2: Roll Back Frontend Deployment (15 Seconds)

Procedure is **identical to Step 1**, just swap `backend` → `frontend`.
The frontend is a React SPA served by nginx (`mallchain-os-v14/Dockerfile`,
`infra/k8s/12-frontend.yaml`), so the rollout is even faster (smaller image,
no DB connection pool to drain).

```bash
# 1. Confirm history.
kubectl -n mallchain rollout history deployment/frontend

# 2. Undo previous, or specific revision.
kubectl -n mallchain rollout undo deployment/frontend
#   OR: kubectl -n mallchain rollout undo deployment/frontend --to-revision=N

# 3. Wait for status.
kubectl -n mallchain rollout status deployment/frontend --timeout=3m
```

### Verify frontend rollback:

```bash
# Running image check.
kubectl -n mallchain get pods -l app=frontend -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | head -1

# Hit the CDN / index.html with cache-bust and confirm the build timestamp
# or asset manifest matches the old tag.
curl -s -H "Cache-Control: no-cache" https://app.mallchain.example.com/ | grep -Eo 'buildId|assetManifest[^"]*' | head -3
```

> **CDN cache note:** If you use Cloudflare in front of the frontend, you
> may need to PURGE the cache for `index.html` after the rollout to force
> browser clients to re-fetch the old bundle. This is outside Kubernetes;
> do it via the Cloudflare dashboard or their API if you see stale 404s for
> assets that only existed in the bad deploy.

---

## Step 3: Roll Back marketplaced StatefulSet (Image Patch — 45 Seconds)

The Cosmos chain node runs as a `StatefulSet/marketplaced`
(`infra/k8s/11-marketplaced.yaml`). **Kubernetes StatefulSets do NOT support
`kubectl rollout undo` natively** — the `rollout undo` subcommand only works
for `Deployment` and `DaemonSet`. Attempting `kubectl rollout undo
statefulset/marketplaced` will return `error: no rollbacker for
*apps.StatefulSet`.

The correct rollback for a StatefulSet is to **patch the `.spec.template.spec`
container image back to the previous tag** and let the StatefulSet controller
do its ordered rolling restart (pod-2 → pod-1 → pod-0 for a 3-replica STS —
maintains quorum since only one pod restarts at a time).

### 3.1 Determine the previous GOOD image tag

Two sources of truth:

**Source A: StatefulSet `rollout history` (works for reading, just not undoing):**
```bash
kubectl -n mallchain rollout history statefulset/marketplaced
# REVISION  CHANGE-CAUSE
# 19        kubernetes.io/change-cause: deploy sha-abc1234 (GOOD)
# 20        kubernetes.io/change-cause: deploy sha-def5678 (BAD, current)
```
Even though `undo` doesn't work, `history` still tracks the revisioned
PodTemplates for StatefulSets — the revision number is real, you just
can't jump with `--to-revision`.

**Source B: Current-running pod spec (if the bad deploy only partially rolled out):**
```bash
kubectl -n mallchain get sts marketplaced -o jsonpath='{.spec.template.spec.containers[0].image}'
# current (BAD): .../mallchain-marketplaced:sha-def5678
```

### 3.2 Patch the STS container image back

Replace the tag in the patch below with the GOOD tag (e.g., `sha-abc1234`
from the history output, or the previous semantic tag `v1.14.3`):

```bash
GOOD_IMAGE_TAG="sha-abc1234"   # REPLACE with your known-good tag
ECR="123456789012.dkr.ecr.eu-west-1.amazonaws.com"   # matches deploy.yml

kubectl -n mallchain patch statefulset marketplaced \
  --type='strategic' \
  -p "{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"marketplaced\",\"image\":\"${ECR}/mallchain-marketplaced:${GOOD_IMAGE_TAG}\"}]}}}}"
# statefulset.apps/marketplaced patched
```

> Why strategic merge patch instead of `kubectl set image`? Both work;
> `set image` is shorter and you can use it if you prefer:
> ```bash
> kubectl -n mallchain set image statefulset/marketplaced \
>   marketplaced="${ECR}/mallchain-marketplaced:${GOOD_IMAGE_TAG}"
> ```

### 3.3 Wait for the ordered rolling restart

StatefulSet rolls **one pod at a time**, waiting for each to be `Ready`
before moving to the next (by default `podManagementPolicy: OrderedReady`
which is what `infra/k8s/11-marketplaced.yaml` uses). For the standard
3-replica validator/seed deployment, this takes ~30–60 seconds total.

```bash
# Block until all 3 pods are Ready with the new (old) image.
kubectl -n mallchain rollout status statefulset/marketplaced --timeout=5m
# Waiting for 1 pods to be ready...
# Waiting for partitioned roll out to finish: 1 out of 3 new pods have been updated...
# partitioned roll out complete: 3 new pods have been updated...
```

### 3.4 Verify chain consensus survived

The Cosmos chain (via Tendermint/CometBFT) tolerates one node restarting
at a time with a 3-validator deployment — quorum is 2/3. Still, explicitly
confirm consensus height is advancing after the STS rollout completes:

```bash
# Exec into any marketplaced pod and query the latest block height twice,
# ~10 seconds apart — height must increase.
kubectl -n mallchain exec -it marketplaced-0 -- marketplaced status 2>/dev/null \
  | jq '.SyncInfo.latest_block_height, .SyncInfo.catching_up'
# Expected: "<height>", false
sleep 10
kubectl -n mallchain exec -it marketplaced-0 -- marketplaced status 2>/dev/null \
  | jq '.SyncInfo.latest_block_height'
# Expected: strictly greater than the previous height.
```

If `catching_up` is `true` or the height didn't advance for 30+ seconds,
check the pod logs for `ErrInvalidProposal` or vote-timeout messages —
rarely, a binary-version mismatch across pods during the rolling restart
can cause a short consensus stall; it self-resolves once the third pod
finishes upgrading (downgrading) back to the uniform old tag.

---

## Step 4 (Conditional): MongoDB Atlas Point-in-Time Restore

Only do this step if the bad deploy **corrupted on-disk state in MongoDB**.
Symptoms that warrant a PIT restore:

- A bad migration ran (see `backend/src/models/*` — any schema change that
  was non-idempotent and ran against production before rollback).
- Duplicate key errors in backend logs for unique indexes that can't be
  fixed with a simple delete (e.g., orphaned escrow records that locked
  user funds).
- On-call confirms a service-level write bug wrote garbage to KYC, user
  settings, or treasury ledgers.

If you don't see any of these, **skip Step 4**. The 3-tier rollback above
is enough.

### Procedure (Atlas UI or CLI):

Atlas PIT restore works on a 5-minute snapshot interval. You always
restore into a **new cluster** (restore is not in-place on the running
cluster); once the new cluster is up you repoint the backend's
`MONGO_URI` secret.

```bash
# Atlas CLI (mongocli) equivalent of "restore to 5 minutes before deploy started"
# (the 5-min granularity is non-negotiable — you get the snapshot boundary
# immediately preceding the requested timestamp).
DEPLOY_STARTED_AT="2025-01-15T09:02:17Z"   # when the bad deploy's CI merged
PROJECT_ID="${ATLAS_PROJECT_ID}"
CLUSTER_NAME="prod-mallchain"

# 1. Grab the snapshot ID for the point in time immediately BEFORE the deploy.
#    (Add ~30 seconds buffer to be safe; round DOWN.)
RESTORE_TS=$(date -u -d "${DEPLOY_STARTED_AT} 30 seconds ago" +%s)
SNAPSHOT_ID=$(mongocli atlas clusters snapshots describe "${CLUSTER_NAME}" \
  --projectId "${PROJECT_ID}" \
  --type oplog \
  --timestamp "${RESTORE_TS}" \
  -o json | jq -r '.id')

# 2. Trigger restore to a new cluster (naming convention: prod-mallchain-rollback-<timestamp>).
NEW_CLUSTER="${CLUSTER_NAME}-rollback-$(date -u +%Y%m%d%H%M)"
mongocli atlas clusters restore start pointInTime "${CLUSTER_NAME}" "${SNAPSHOT_ID}" \
  --projectId "${PROJECT_ID}" \
  --targetClusterName "${NEW_CLUSTER}"

# 3. Poll for the new cluster to reach state=IDLE (~5–15 minutes depending on DB size).
while true; do
  STATE=$(mongocli atlas clusters describe "${NEW_CLUSTER}" --projectId "${PROJECT_ID}" -o json | jq -r '.stateName')
  echo "Cluster state: ${STATE}"
  [ "$STATE" = "IDLE" ] && break
  sleep 30
done

# 4. Update the backend k8s Secret `mongo-uri` and roll the backend again
#    (trivial — it's just a pod restart with the new env var).
NEW_URI=$(mongocli atlas clusters describe "${NEW_CLUSTER}" --projectId "${PROJECT_ID}" -o json | jq -r '.mongoURIWithOptions')
kubectl -n mallchain create secret generic mongo-credentials \
  --from-literal=MONGO_URI="${NEW_URI}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -
kubectl -n mallchain rollout restart deployment/backend
kubectl -n mallchain rollout status deployment/backend --timeout=3m
```

After the repoint, do a quick smoke test against `/health` and confirm
at least 3 consecutive API calls to `GET /api/market/activity` return
data without 5xx.

---

## Step 5 (Conditional): Redis Failover to Replica

Only do this step if the bad deploy **corrupted Redis state**. Redis
in this deployment is used for: rate-limit counters, auth/session
cache, wallet socket pub/sub, idempotency keys, and the transaction
queue backlog.

Corruption scenarios:
- A bug in the idempotency layer wrote malformed keys that crash the
  Lua script on read (see `backend/src/middleware/idempotency.js`).
- Wallet sync (`backend/services/walletSync.js`) pumped corrupted
  balance cache entries and every `GET /wallet/balance` 500s.
- Redis master process started logging `MISCONF` or write errors after
  the deploy and won't recover.

For transient Redis issues (network blip, master restarted on its own),
a full failover is overkill — skip it. Only fail over when the master's
on-disk state (RDB/AOF) is confirmed bad.

### Procedure:

```bash
# 1. Confirm the master is still reachable (or not).
redis-cli -h redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" INFO replication | grep role
# Expected: role:master (if master is still alive but corrupted).

# 2. Pick a healthy replica. Run INFO replication on both replicas to find
#    the one with the highest master_repl_offset (most caught up).
redis-cli -h redis-replica-0.redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" INFO replication | grep master_repl_offset
redis-cli -h redis-replica-1.redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" INFO replication | grep master_repl_offset

# 3. Promote the most-caught-up replica to master (example: replica-1):
redis-cli -h redis-replica-1.redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" REPLICAOF NO ONE
# Wait ~2 seconds, then confirm:
redis-cli -h redis-replica-1.redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" INFO replication | grep role
# role:master

# 4. Flip the backend's REDIS_HOST secret to the new master and re-point
#    the other replica to the new master.
kubectl -n mallchain set env deployment/backend \
  REDIS_HOST="redis-replica-1.redis.mallchain.svc.cluster.local"
kubectl -n mallchain rollout status deployment/backend --timeout=3m

# 5. Re-attach the old master (once you recover its disk) as a replica
#    of the new master to rebuild the HA pair:
redis-cli -h redis.mallchain.svc.cluster.local -a "${REDIS_PASSWORD}" \
  REPLICAOF redis-replica-1.redis.mallchain.svc.cluster.local 6379
```

After failover, expect ~30 seconds of cold-cache misses (rate limits
lifted for a short window, sessions regenerated). Monitor 5xx rate and
the Prometheus `redis_connected_clients` metric.

---

## Step 6: Verify Everything Green + Disable Maintenance Mode

Before you call the incident "rolled back and stable," run the project's
smoke test script (it's intentionally tiny — ~10 seconds):

```bash
./scripts/smoke-test.sh --env production
# Outputs PASS/FAIL for health, auth flow, a marketplace GET, a chain height query.
```

Then disable maintenance mode (reverse of Step 0):

```bash
curl -s -X POST \
  -H "x-api-key: ${OPS_ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  https://api.mallchain.example.com/admin/maintenance-mode
```

Final sanity curl: a write-path endpoint that went 503 earlier should now
work (it will return an auth error if you don't supply creds, but NOT 503):

```bash
curl -s -o /dev/null -w "%{http_code}" https://api.mallchain.example.com/auth/login
# Expected: 401 (missing credentials — accepted the request, not 503)
```

---

## Postmortem Checklist (Do This Within 24 Hours)

A rollback without a postmortem is how you get the same bug shipped twice.
Assign one owner (typically the on-call engineer who performed the rollback)
to fill in every item below and file it as an internal incident doc:

- [ ] **Timeline (UTC):** exact timestamps for: merge of bad PR, deploy
      started, deploy completed, first alert, first user report, page to
      on-call, maintenance mode enabled, each tier rollback started/finished,
      PIT restore (if any), maintenance mode disabled, all-clear.
- [ ] **Root cause category:**
      - [ ] Backend code bug (uncaught exception / 5xx rate)
      - [ ] Schema migration (non-idempotent / data loss)
      - [ ] Frontend regression (broken bundle / stale asset hashes)
      - [ ] Chain binary (consensus stall / app handler panic)
      - [ ] Config drift (env var / secret typo)
      - [ ] Dependency (CV / lockfile upgrade)
      - [ ] Infra (K8s / Atlas / Redis unrelated to deploy)
- [ ] **Rollback gap analysis:**
      - [ ] Did `rollout undo` find a previous revision? If not, why not
            (history limit too low / GC'd)?
      - [ ] Did maintenance mode correctly isolate traffic? Were there
            orphaned writes anyway?
      - [ ] For marketplaced: was the STS ordered restart fast enough?
            Did consensus stall?
      - [ ] Did PIT restore (if used) land at the correct 5-min boundary
            or did you lose writes you didn't want to lose?
- [ ] **Alerting gaps:** what fired / didn't fire? Was the alert to page
      ratio 1:1 or spammy?
- [ ] **Repro steps in staging:** exact commands to reproduce the bug on
      the staging cluster, pinned to the bad SHA.
- [ ] **Fix PR(s):** links to each PR that addresses the root cause, with
      a test case (unit / integration / e2e) that would have caught the
      bug on a pre-merge run.
- [ ] **Post-incident review scheduled:** 30-minute team review within
      3 business days.

---

## Quick Reference Cheat Sheet (Print / Pin to War Room)

Copy this block to a sticky note during an incident — it's the entire
procedure compressed to what you actually type:

```bash
# 0. MAINTENANCE MODE
curl -X POST -H "x-api-key: $KEY" -d '{"enabled":true}' https://api/admin/maintenance-mode

# 1. BACKEND ROLLBACK
kubectl -n mallchain rollout history deployment/backend
kubectl -n mallchain rollout undo deployment/backend [--to-revision=N]
kubectl -n mallchain rollout status deployment/backend --timeout=3m

# 2. FRONTEND ROLLBACK
kubectl -n mallchain rollout undo deployment/frontend [--to-revision=N]
kubectl -n mallchain rollout status deployment/frontend --timeout=3m

# 3. MARKETPLACED (STS) ROLLBACK
kubectl -n mallchain set image sts/marketplaced marketplaced="$ECR:$GOOD_TAG"
kubectl -n mallchain rollout status statefulset/marketplaced --timeout=5m
kubectl -n mallchain exec marketplaced-0 -- marketplaced status | jq .SyncInfo

# 4. (IF DATA CORRUPTED) MONGO PIT RESTORE → repoint secret → restart backend
# 5. (IF REDIS CORRUPTED) REPLICAOF NO ONE → flip secret → restart backend

# 6. VERIFY + UNHALT
./scripts/smoke-test.sh --env production
curl -X POST -H "x-api-key: $KEY" -d '{"enabled":false}' https://api/admin/maintenance-mode
```

## See Also

- `infra/k8s/10-backend.yaml`, `11-marketplaced.yaml`, `12-frontend.yaml` —
  the actual resource specs that define revision history, container names,
  and liveness/readiness probes cited above.
- `backend/src/models/MaintenanceMode.js` — maintenance-mode schema and the
  write-halt middleware that consumes it.
- `scripts/smoke-test.sh` — the 10-second verification script.
- `.github/workflows/deploy.yml` — the CI that produced the bad image tag
  in the first place; read its trigger matrix to understand what revision
  number corresponds to what tag.
