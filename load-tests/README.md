# Load tests

This directory contains k6 load-test scenarios targeting the Mallchain backend
API. Each scenario is standalone and configurable via environment variables.

Install k6: https://k6.io/docs/get-started/installation/

## Scenarios

| File | Purpose |
|---|---|
| `k6-api-load-test.js` | Baseline read-only smoke test (health, ready, config) ramping to 50 VUs |
| `payment-sustained.js` | 1000 VU sustained payment mix — simulate-sandbox weighted 60% |
| `staking-tx-perf.js` | Ramping 0→50→200 VU staking + tx-status mix |
| `sell-liquidity-queued.js` | 30 VU sustained POST /api/buy/sell with random amounts 100–5000 |

## Environment variables

All scenario files read the following variables from the process environment
(pass them inline or `export` before running `k6`).

### `BASE_URL`

**Required by every scenario.** Root URL of the backend API under test. Must
include scheme (`http://` or `https://`) and port if non-standard. Defaults to
`http://localhost:4000` when unset — useful for local `docker-compose up` runs.

```
BASE_URL=https://staging.mallchain.example k6 run load-tests/payment-sustained.js
```

### `MONITORING_API_KEY`

**Required by payment-sustained, staking-tx-perf, and sell-liquidity-queued**
when the target environment has the `apiKeyAuth` middleware (see
`backend/src/middleware/apiKeyAuth.js`) enabled on `/api/buy/*`, `/api/staking/*`,
and `/api/health`/`/api/ready`. The value is sent as the `x-api-key` request
header. Leave unset for local dev environments that bypass API-key auth.

```
MONITORING_API_KEY=$(op read op://vault/monitoring-apikey/password) k6 run …
```

### `TEST_JWT`

**Required by `sell-liquidity-queued.js`.** A valid, unexpired JWT bearer token
for an authenticated test account. The scenario sends it as the
`Authorization: Bearer <TEST_JWT>` header on every POST to `/api/buy/sell`.
The script throws immediately if `TEST_JWT` is missing, because `/api/buy/sell`
always requires an authenticated caller (see `backend/src/middleware/requireAuth.js`).

Generate a token for local dev via `backend/test-concurrent-load.js` or the
`/api/auth/login` endpoint against a seeded test user.

### `PROMETHEUS_REMOTE_URL`

**Optional, used with `payment-sustained.js` and any scenario wired through the
k6 experimental Prometheus remote-write output.** When set, tells you that
metrics are being pushed to a Prometheus-compatible remote-write endpoint
(Grafana Mimir, VictoriaMetrics, Thanos, or a Prometheus server with the
`--enable-feature=remote-write-receiver` flag).

### `K6_OUT` — Prometheus remote-write instructions

k6 v0.42+ ships with an experimental Prometheus remote-write output extension.
To ship live metrics from any scenario to your monitoring stack, set `K6_OUT`
and run the k6 binary built with `xk6-output-prometheus-remote`, or use the
official image that bundles it:

```
K6_OUT="experimental-prometheus-rw" \
K6_PROMETHEUS_RW_SERVER_URL=$PROMETHEUS_REMOTE_URL \
K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),avg" \
k6 run load-tests/payment-sustained.js
```

For Grafana Cloud / Mimir, also set HTTP basic auth via:

```
K6_PROMETHEUS_RW_USERNAME="<metrics instance ID>"
K6_PROMETHEUS_RW_PASSWORD="<API key with metrics push scope>"
```

Dashboards in `monitoring/grafana/dashboard.json` already include panels for
the custom `pay_latency_ms`, `pay_error_rate`, `queued_liquidity_ok`, and
`sell_latency_ms` metrics emitted by these scenarios.

## Running locally

```bash
export BASE_URL=http://localhost:4000
export MONITORING_API_KEY=dev-monitoring-key
export TEST_JWT=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@mallchain.local","password":"test123"}' | jq -r .token)

k6 run load-tests/k6-api-load-test.js
k6 run load-tests/staking-tx-perf.js
k6 run load-tests/sell-liquidity-queued.js
k6 run load-tests/payment-sustained.js
```

## Threshold quick reference

| Scenario | p95 | p99 | Error rate |
|---|---|---|---|
| payment-sustained | < 2000 ms | < 4000 ms | pay_error_rate < 1%, http_req_failed < 2% |
| staking-tx-perf   | < 3000 ms | < 6000 ms | staking_error_rate < 5% |
| sell-liquidity-queued | < 5000 ms | — | queued_liquidity_ok count > 25 |

k6 exits non-zero when any threshold is breached, which is the signal used by
`.github/workflows/load-test.yml` to mark a scheduled load-run as failed.
