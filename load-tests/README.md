# Load tests

`k6-api-load-test.js` — a k6 script against the backend's read-only
endpoints (`/api/health`, `/api/ready`, `/api/buy/config`), ramping from 0 to
50 virtual users. Thresholds (p95 latency < 2s, error rate < 5%) match the
same concerns as `monitoring/prometheus/alert_rules.yml`'s
`HighRequestLatencyP95` / `HighHttp5xxErrorRate` — a failing load test and a
firing production alert represent the same underlying problem.

```
k6 run load-tests/k6-api-load-test.js
BASE_URL=https://staging.example.com k6 run load-tests/k6-api-load-test.js
```

Install k6: https://k6.io/docs/get-started/installation/

## Why not the write/financial routes (buy/withdraw/sell)?

Deliberately out of scope for an automated load-test target: those routes
move real money through Safaricom and broadcast real chain transactions.
Load-testing them needs its own sandboxed environment with test Safaricom
credentials and a disposable chain, which is an environment/account setup
decision for whoever runs this, not something to default to running against
a shared staging or production URL.

## Frontend/other existing load tests

`run-load-tests.sh` (repo root) already orchestrates a separate,
custom Jest/Node-based concurrent-load test
(`mallchain-os-v14/src/load-test/concurrent-load.test.ts` and
`test-concurrent-load.js`) — this k6 script is additive, not a replacement.

## Not wired into CI

Intentionally not run automatically on every PR/push: that would need a
real, always-on staging environment for k6 to point at, which is an
infrastructure decision (see `infra/terraform/`) rather than something to
assume. Run manually or wire into a scheduled workflow once that
environment exists.
