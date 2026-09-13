# Maintenance Mode / Emergency Pause Runbook

## When to use maintenance mode

Use emergency pause (maintenance mode) when:

* A critical bug in a money-moving surface (send / withdraw / buy / payment / marketplace escrow / staking / vault / badge) would cause loss of funds if new requests were to enter.
* You are about to run an operator action that modifies genesis (new faucet account, chain upgrade, validator rotation) and want to prevent new on-chain writes racing.
* DEX or staking chain gateway returns 503/DOWN. DEX/staking gates have their own HTTP 503 `not_ready` per-request circuit breakers but maintenance mode lets you hide those surfaces entirely at the API layer before they ever try.
* Explorer backend is DOWN for more than 10 minutes and you want users who land on `/explorer/*` user-facing routes to see the "maintenance paused" banner in the UI instead of repeated spinner.

**Do NOT** use maintenance mode instead of individual `dex`, `staking`, or `explorer_down` circuit breakers. Those return HTTP 503 + Retry-After headers so load balancers + monitoring see 503 (not 200 "everything fine") and alert correctly. Maintenance mode adds the human-facing banner + disables buttons in the frontend app shell, so only use it when you *intend* that user experience.

## Available scopes

From `adminPanel.js`'s `MAINTENANCE_SCOPES` list (keep in sync when adding new scopes):

| Scope             | Guarded routes (prefixes)                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `send`           | `/api/send/*`                                                                                         |
| `withdraw`       | `/api/withdraw/*`                                                                                     |
| `buy`            | `/api/buy/*`                                                                                          |
| `payment`        | `/api/payment/*`                                                                                      |
| `marketplace`    | `/api/marketplace/*`                                                                                  |
| `staking`        | staking controller endpoints (paused + `/api/staking/*`)                                          |
| `vault`          | `/api/vault/*`                                                                                        |
| `key-vault`      | admin key-vault endpoints                                                                             |
| `badge`          | `/api/badge/*`                                                                                        |
| `dex`            | `/api/dex/*` + dexController guarded calls (DEX_CHAIN_GATEWAY_PENDING) + `DEX` maintenance already has its own 503 circuit breaker, the scope guard is the explicit frontend banner blocker) |
| `global`         | **ALL** of the above routes return the 503 banner; read routes still work                              |

## Operator CLI / HTTP commands

### Auth

All admin `POST /api/admin/maintenance` needs a **superadmin JWT**:

```bash
export ADMIN_JWT=$(curl -s -X POST https://api.mallchain.example/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@example.com","password":"REDACTED"}' | jq -r '.token')
```

### Read status (any admin)

```bash
curl -H "Authorization: Bearer $ADMIN_JWT" https://api.mallchain.example/api/admin/maintenance | jq
curl https://api.mallchain.example/api/maintenance | jq   # public unauthenticated view (frontend banner reads this)
```

### Pause one scope

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  https://api.mallchain.example/api/admin/maintenance \
  -d '{"scope":"send","paused":true,"reason":"Hot fix on send sequence guard — ETA 10 min"}'
```

### Resume one scope

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  https://api.mallchain.example/api/admin/maintenance \
  -d '{"scope":"send","paused":false}'
```

### Global emergency halt (all scopes at once)

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  https://api.mallchain.example/api/admin/maintenance \
  -d '{"global":true,"reason":"Emergency halt: incident INC-42 chain state drift detected"}'
```

### Resume global

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  https://api.mallchain.example/api/admin/maintenance \
  -d '{"global":false}'
```

## Behavior notes

* **MaintenanceGuard fails open on Mongo unavailability.** If `MaintenanceMode.findById('singleton')` throws, the guard calls `next()` and lets the request proceed. The alternative (turning a DB blip into every payment paused) is worse. After fixing the DB, retry any in-flight user requests.
* **Cache TTL is 3 seconds**; `invalidateMaintenanceCache()` is called right after the admin `POST` so the pause applies immediately on the next request (no 3s "leak window" to new writes).
* **Explorer circuit breaker (`EXPLORER_DOWN`) is a separate system** from maintenance mode. Explorer proxy keeps its own 3-failure → 5 minute cooloff breaker and returns 503 `{code:'EXPLORER_DOWN', status:'not_ready'}` with `Retry-After` header. Maintenance mode scope `dex` + `staking` and the dex/staking gateways return the same shaped response so frontends render one banner.
* **Frontend banner** reads `GET /api/maintenance` once on app boot + every 60 seconds. User sees a banner with `reason`; affected buttons are disabled via global `useMaintenance()` hook.

## After-resume checklist

1. Un-pause global or scope.
2. Confirm `GET /api/maintenance` returns `global:false` and the scope `paused:false`.
3. Monitor `/metrics` `marketplace_queue_depth` queues for replay buildup of failed counts for ~10 minutes.
4. Inspect Explorer circuit breaker metrics (logs "Explorer proxy circuit breaker OPEN" / "CLOSED") or wait ≥ 5 minute cooloff to confirm it auto-closes.
5. Confirm `db.audit_records` has the audit entry for the toggle.

## Rollback

To undo a mistakenly-paused scope: call the same `POST /api/admin/maintenance` with `paused:false` + no `reason`, then the frontend banner clears within 60 seconds (or user refreshes manually).
