# Runbook: Backend down / crash-looping

## Detect
- `MallchainBackendDown` alert (Prometheus, `up{job="mallchain-backend"} == 0` for 2m)
- `scripts/smoke-test.sh` failing on `/api/live`

## Diagnose
1. `kubectl -n mallchain logs deployment/backend --tail=200` (or `docker logs`
   locally) — look for the crash/exit reason, not just the last line.
2. `kubectl -n mallchain get pods` — CrashLoopBackOff vs. Pending (the
   latter is a scheduling/resource issue, not an app bug) vs. Running-but-
   unresponsive (check readiness probe failures specifically).
3. Check whether this started right after a deploy (`kubectl rollout history`)
   — if so, this is probably a bad release, not an environmental failure.

## Common causes in this codebase
- **Missing required secret at boot.** `config/index.js` hard-fails
  (`process.exit(1)`) in production if `JWT_SECRET`/`PAYMENT_WEBHOOK_SECRET`/
  `VAULT_ADDR`+`VAULT_TOKEN`/`OPERATOR_MNEMONIC` are unset — check startup
  logs for the specific "X is required in production" message.
- **Redis unreachable at boot.** `index.js`'s `start()` hard-fails in
  production if Redis can't be reached (`global.redisClient.ping()` throws)
  — check Redis is actually up before assuming the backend image is broken.
- **Bad deploy.** Roll back: `kubectl -n mallchain rollout undo deployment/backend`.

## Mitigate
- Roll back a bad deploy immediately rather than debugging forward under
  pressure — investigate the root cause afterward from the previous
  version's logs.
- If it's a missing/misconfigured secret, fix the Secret/ConfigMap and
  restart the deployment.

## Verify recovery
`./scripts/smoke-test.sh` against the affected environment — all checks
green, not just the process staying up.
