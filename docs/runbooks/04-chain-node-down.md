# Runbook: Chain node (marketplaced) down or not syncing

## Detect
- `MallchainBackendDown`-adjacent symptoms but `/api/health`'s `chain`
  field specifically shows the problem (`status: "down"` or `"stale"`)
- `/api/ready` returning 503 with `reason: "blockchain_stale"` or
  `"blockchain_unavailable"` (`utils/chainHealth.js`'s staleness check)

## Diagnose
1. `curl http://<node>:26657/status` directly — is the process even up?
2. If up but stale: check `catching_up` and `latest_block_height` in that
   same `/status` response — a node that's up but far behind is a sync
   problem, not a crash.
3. Check disk space on the chain-data volume — a full disk is a common,
   boring cause of a node silently stalling.

## Mitigate
- Process down: restart it. If `blockchain_working/data` (or the
  equivalent PVC) is intact, it resumes from where it left off — no
  restore needed for a simple crash/restart.
- Corrupted data / won't start: restore chain data from the latest backup
  (`scripts/restore.sh`) — expect it to need to re-sync forward from the
  backup's height, which takes real time proportional to how stale that
  backup is.
- Stuck syncing: check peer connectivity (`persistent_peers` config) —
  a node with no reachable peers can't sync no matter how long you wait.

## Impact while down
Every route wrapped in `maintenanceGuard` still enforces its own
maintenance-mode check independently of chain health — chain being down
does not automatically pause money-moving routes; it just means those
routes will themselves start failing on their own chain calls. Consider
manually flipping relevant scopes via `POST /api/admin/maintenance` (see
`docs/runbooks/09-emergency-maintenance-mode.md`) if the outage is
expected to be prolonged, so failures are a clear, user-facing "paused"
message instead of confusing mid-request errors.

## Verify recovery
`/api/ready` returns 200, `catching_up: false` in the node's own `/status`.
