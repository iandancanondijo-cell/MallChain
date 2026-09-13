# Runbook: MongoDB unavailable

## Detect
- `/api/health` reports `database: {status: "error"}` or `"disconnected"`
- Requests failing with Mongoose connection errors in logs

## Diagnose
1. Check the Mongo host/service itself is up (`kubectl -n mallchain get
   pods -l app=mongo` or your managed provider's status page).
2. Check network path: can the backend pod actually reach Mongo (security
   group / NetworkPolicy — see `infra/k8s/30-network-policies.yaml`, which
   only allows backend → Mongo, so a policy misconfiguration looks exactly
   like a Mongo outage from the backend's side)?
3. Check connection pool exhaustion: `MONGO_MAX_POOL_SIZE` (default 20) —
   under real load this can be a symptom of too many concurrent slow
   queries rather than Mongo actually being down.

## Mitigate
- The backend is designed to start in degraded mode if Mongo is down at
  boot (`index.js`'s `start()` logs a warning and continues rather than
  crashing) — a *running* backend with Mongo down will serve `/api/live`
  fine but fail almost every real endpoint. Don't mistake "process is up"
  for "service is healthy" here — check `/api/health`, not just liveness.
- If the managed Mongo instance itself failed: failover to a replica if one
  exists, or restore from the latest backup (`scripts/restore.sh`) onto a
  replacement instance — see `docs/disaster-recovery/disaster-recovery-plan.md`.

## Verify recovery
`/api/health` reports `database: {status: "ok"}`, then `./scripts/smoke-test.sh`.
