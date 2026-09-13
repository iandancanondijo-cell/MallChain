# k6 Load Test Result Analysis and SLO Breach Response Runbook

## Document Metadata
- **Runbook ID**: RB-K6-005
- **Service**: k6 Load Testing (GitHub Actions workflow + Grafana Cloud k6 managed runner) — targets `api.mallchain.io` prod replicas via internal VPC endpoints
- **Owner**: Performance Engineering + SRE
- **Last Updated**: 2026-09-10
- **Approved By**: Head of Platform + Head of Backend Engineering

---

## Prerequisites

1. **GitHub Actions Run Access**: Operator must be a member of the `Mallchain/performance-engineers` GitHub team. Confirm: `curl -s https://api.github.com/teams/performance-engineers/memberships/${USER} | jq '.role'` → `member` or `maintainer`.
2. **k6 Cloud / Grafana Cloud API Key**: The `GRAFANA_CLOUD_API_KEY` stored in `/var/run/secrets/k6-api-key` must be scoped with `k6:read`, `k6:execute`, and `artifacts:download` permissions.
3. **Synthetic Baseline Data**: Operator must have access to the "last-known-good" (LKG) load test summary.json artifact (stored in S3 `mallchain-perf-baselines/k6/`) from the latest successful run where all SLIs passed. This is the comparison reference.
4. **Grafana Correlation Panels Bookmarked**: Have these panels pre-bookmarked and ready to open in a single dashboard group:
   - `Infra-Production/Node-CPU-RAM`: Node-level CPU, RAM, loadavg, disk I/O for backend k8s nodes
   - `API-Gateway/Nginx-Queues`: nginx ingress active connections, request queue length, upstream connect time p50/p95/p99
   - `DataLayer/DB-Redis-Queues`: Postgres active connections, pgbouncer pool wait time, Redis command latency p99, MongoDB op_counters globals
   - `Blockchain/Node-RPC-Queues`: geth/erigon RPC pending tx pool, gas price percentile, nonce gaps
5. **Incident Template and RCA Form**: Load test RCA form pre-loaded in the incident tracker. Must include pre-defined sections: Endpoint Table, 95% CI Calculator, Cap Recommendation.
6. **SLO Window Data**: The 30-day rolling SLO data for `payment-success-rate` must be pulled from the SLO tracker before starting the postmortem. Confirm: `promtool query instant 'slo:sli_error:ratio_rate30d{service="payments-api"}' | jq '.data.result[0].value[1]'`.
7. **Feature Flag Context**: Know the active feature flag set for `mallchain-api` at test execution time (via ConfigCat dashboard or `kubectl get configmap feature-flags -n backend -o yaml`). A new feature with 20% rollout is a common root cause.

---

## Pre-declared Severity

| Scenario | Severity | Escalation | MTTR Target |
|---|---|---|---|
| `K6LoadTestP95Breached WARN` — p95 target exceeded for ≤2 low-traffic endpoints; error rate < 0.5% | SEV-4 | Performance engineer email + perf slack channel. Investigated within sprint, no production change required | 5 business days |
| `K6LoadTestP95Breached WARN` — p95 target exceeded on 1+ Tier-1 endpoint (/payments, /checkout, /inventory/stock) OR error rate = 0.5-2.0% | SEV-3 | Page PerfEng on-call + Backend lead on-call. Do NOT deploy to prod until regressed endpoint identified and fixed in staging | 8 hours |
| `ErrorRate CRIT` — load test overall error rate > 2.0% OR any Tier-1 endpoint error rate > 0.1% | SEV-2 | Page PerfEng + SRE + Backend IC. Freeze prod deploy pipeline. Open SEV-2 incident | 2 hours to identify root cause |
| `ErrorRate CRIT` + SLO burn-rate alert for `payment-success-rate` fires (error budget > 2x daily budget consumed by test) | SEV-1 | Page everyone + CTO. Halt all load tests immediately. Begin impact analysis on live traffic | 30 minutes to freeze + triage |
| Load test inadvertently ran against LIVE prod (not prod-replicas) AND caused 5xx for real users | SEV-1 + Customer-Impacting | Begin customer comms. Open bridge with support lead | 15 minutes to open bridge |

**Downtime / Impact Note**: A properly executed k6 load test against prod REPLICAS causes zero user impact. However, findings that indicate real regressions must block deployment. If the test was misconfigured and hit live endpoints, impact = actual production outage.

---

## Triggers (Alert Rule Names from MO-3)

This runbook is activated when the GitHub Actions `load-test-k6` workflow completes and the following MO-3 alert rules fire based on the summary.json pushed to Prometheus pushgateway:

| Alert Name | Severity | Expression |
|---|---|---|
| `K6LoadTestP95Breached` | WARN | `k6_http_req_duration_p95{env="prod-loadtest",test_run="${{ github.run_id }}"} > ignoring() group_left() k6_slo_p95_target{endpoint=~".*"} by (endpoint)` |
| `K6LoadTestP99Severe` | WARN | `k6_http_req_duration_p99{env="prod-loadtest"} > 3 * k6_slo_p95_target by (endpoint) for 1m` |
| `ErrorRate` | CRIT | `k6_http_req_failed{env="prod-loadtest"} / k6_http_reqs{env="prod-loadtest"} > 0.02 for 2m` |
| `PaymentEndpointErrorRateCRIT` | CRIT | `k6_http_req_failed{env="prod-loadtest",endpoint="/v1/payments/*"} / k6_http_reqs{...} > 0.001 for 2m` |
| `SLOPaymentSuccessBurnRateAlert` | WARN | `(slo:sli_error:ratio_rate1h{service="payments-api"} / on() group_left() slo:objective:ratio{service="payments-api"}) > 14.4` |
| `SLOPaymentSuccessBurnRate2` | CRIT | `(slo:sli_error:ratio_rate6h{service="payments-api"} / on() group_left() slo:objective:ratio) > 6` |

**SLO Formula Reference**: The payment-success-rate SLO uses multi-window multi-burn-rate alerting per Google SRE Workbook. Ratio = `error_rate_in_window / allowed_error_rate`. 14.4x burn in 1h = ~2-day budget consumed in 1 hour. 6x burn in 6h = ~1.5-day budget consumed in 6 hours.

**Target SLO**: `sre_slo_objective_percent{service="payments-api"} = 99.9%` over 30-day window. Allowed error rate = 0.1%.

---

## Decision Tree

```
[ALERT: K6LoadTestP95Breached WARN OR ErrorRate CRIT]
        │
        ▼
  Get GitHub Actions run URL from alert labels
  (label: github_run_url="https://github.com/Mallchain/core/actions/runs/NNNNNNNNN")
        │
        ▼
  Did test run against CORRECT target (prod-replicas)?
  (check workflow log step "Set target endpoint")
        │
        ├─► NO! Target = LIVE prod endpoints (prod mallchain-api)
        │     │
        │     └─► SEV-1: ABORT LOAD TEST IMMEDIATELY
        │         ./scripts/halt-load-test.sh $RUN_ID
        │         Check live Prometheus for 5xx rate — if elevated,
        │         open customer-impacting incident.
        │
        └─► Yes → Continue analysis
        │
        ▼
  Download summary.json artifact + raw metrics
        │
        ▼
  Tier-1 endpoints (payments, checkout, stock) affected?
        │
        ├─► No (only Tier-2/3, e.g., /v1/reports, /v1/search/suggestions)
        │     └─► SEV-4/3: Document.
        │         File perf-ticket. Do NOT block deploy pipeline.
        │         Set recommended cap lower for next run.
        │
        └─► Yes → ErrorRate CRIT or Tier-1 P95 breached?
                │
                ├─► WARN only → SEV-3: Full RCA. Block deploy pipeline.
                │                 Fix in staging. Re-run k6.
                │
                └─► CRIT → SEV-2+: Open incident bridge.
                              Halt deploy pipeline.
                              Correlate with Grafana panels.
                              Build root cause table.
                              Burn-rate alert check.
```

---

## Step-by-step Recovery

### Phase 1: Fetch Load Test Artifacts

1. Navigate to the GitHub Actions run URL from the alert label. Example:
   `https://github.com/Mallchain/core/actions/runs/${{ github.run_id }}`
   Record the run-number, commit SHA, branch name, and workflow trigger (scheduled / manual / PR) in the incident scribe doc.

2. Download the `summary.json` artifact via UI or CLI:
   ```bash
   RUN_ID="NNNNNNNNN"
   GITHUB_TOKEN=$(cat /var/run/secrets/github-pat-k6)

   # List artifacts, locate summary.json
   gh api repos/Mallchain/core/actions/runs/$RUN_ID/artifacts \
     --jq '.artifacts[] | "\(.id) \(.name) \(.size_in_bytes)"'

   # Download summary.json
   ARTIFACT_ID=$(gh api repos/Mallchain/core/actions/runs/$RUN_ID/artifacts | jq -r '.artifacts[] | select(.name=="summary.json") | .id')
   gh api repos/Mallchain/core/actions/artifacts/$ARTIFACT_ID/zip > /tmp/k6-summary-${RUN_ID}.zip
   unzip -o /tmp/k6-summary-${RUN_ID}.zip -d /tmp/k6-${RUN_ID}-artifacts/
   ls -la /tmp/k6-${RUN_ID}-artifacts/
   cat /tmp/k6-${RUN_ID}-artifacts/summary.json | jq '.metrics | keys'
   ```

3. Also download the `k6-raw-metrics.csv` artifact (if generated) for endpoint-level granularity, and `test-config.js` to know the VU profile, duration, and stages.

### Phase 2: Analyze P95 / P99 / Error Rate by Endpoint

4. Extract the per-endpoint latency table from summary.json using `jq`:
   ```bash
   ARTIFACTS=/tmp/k6-${RUN_ID}-artifacts

   echo "=== K6 Load Test: Per-Endpoint Metrics ==="
   echo "Run ID: $RUN_ID"
   echo "Timestamp: $(jq -r '.meta.endTime' $ARTIFACTS/summary.json)"
   echo ""

   echo "| Endpoint | Method | Reqs | P50 (ms) | P95 (ms) | P99 (ms) | Error % | P95 Target (ms) | Status |"
   echo "|---|---|---|---|---|---|---|---|---|"

   jq -r '
     def status($p95;$target;$err):
       if $err > 0.02 or ($target and $p95 > $target) then "FAIL"
       elif $err > 0.005 or ($target and $p95 > $target * 0.9) then "WARN"
       else "PASS" end;
     .root_group.groups[]?
     | .name as $group
     | .groups[]?
     | .name as $endpointRaw
     | ($endpointRaw | capture("(?<method>GET|POST|PUT|DELETE|PATCH)::(?<url>.+)") // {method:"?",url:$endpointRaw}) as $ep
     | .metrics
     | {
         reqs: .["http_reqs"].values.count,
         p50:  (.["http_req_duration"].values.p50  * 1000 | round),
         p95:  (.["http_req_duration"].values.p95  * 1000 | round),
         p99:  (.["http_req_duration"].values.p99  * 1000 | round),
         err:  (.["http_req_failed"].values.rate * 100)
       } as $m
     | [$ep.url, $ep.method, $m.reqs, $m.p50, $m.p95, $m.p99, ($m.err*100|round/100),
        (if $ep.url|startswith("/v1/payments") then 300
         elif $ep.url|startswith("/v1/checkout") then 500
         elif $ep.url|startswith("/v1/inventory") then 200
         elif $ep.url|startswith("/v1/products") then 250
         else 400 end)] as $row
     | "| \($row[0]) | \($row[1]) | \($row[2]) | \($row[3]) | \($row[4]) | \($row[5]) | \($row[6])% | \($row[7]) | \(status($m.p95; $row[7]; $row[6]/100)) |"
   ' $ARTIFACTS/summary.json
   ```

5. Identify the slowest route (highest P95 vs target ratio). Sort by absolute P95 descending. Record the Top 3 slowest routes and Top 3 highest error rate routes in the scribe doc.

### Phase 3: Correlate with Grafana Panels (CPU/RAM/Queues)

6. Open the linked Grafana dashboards (Prerequisite 4) with the exact time window of the k6 test. The test start/end are in summary.json:
   ```bash
   echo "Test start: $(jq -r '.meta.startTime' $ARTIFACTS/summary.json)"
   echo "Test end:   $(jq -r '.meta.endTime'   $ARTIFACTS/summary.json)"
   # Paste times into Grafana's absolute time picker
   ```

7. For each failing endpoint, attempt to correlate p95 latency increase to bottleneck signals:
   a. **CPU**: `node_cpu_seconds_total{mode!="idle"} avg by (nodename) rate 1m`. Backend pod CPU throttling (`container_cpu_cfs_throttled_periods_total > 0` during peak VUs)?
   b. **RAM**: Backend pods `container_memory_working_set_bytes / container_spec_memory_limit_bytes` > 90%? GC pause spikes (JVM: `jvm_gc_pause_seconds_p99`, Go: `go_memstats_gc_cpu_fraction > 0.2`)?
   c. **Queues**: Nginx ingress `upstream_response_time_seconds_p95` elevated? PgBouncer `pgbouncer_pools_client_wait_seconds_max` > 100ms? Redis `redis_command_latency_seconds_p99` > 10ms? Mongo `mongodb_op_latency_reads_latency_p99` > 50ms?
   d. **Blockchain**: RPC `eth_blockNumber` drift between nodes? Pending tx pool > 10,000? Geth `geth_rpc_request_duration_p99` > 2s?
   e. **Network**: Inter-AZ latency spikes? DNS resolution p95 > 50ms?

8. For each potential bottleneck above, note: "During peak-VU stage (N VUs at T minutes), we observed SIGNAL_NAME at VALUE, which correlated with endpoint ENDPOINT_NAME p95 jump from X→Y ms." Build a correlation log.

### Phase 4: Open Incident with Root Cause Table

9. Using the data from Phase 2 and Phase 3, build the root-cause table in the RCA form with these exact columns:

   | Metric | Target | Actual | Delta % | Affected Endpoints | 95% CI Low | 95% CI High | Recommended Cap Next Run |
   |---|---|---|---|---|---|---|---|
   | Overall p95 latency | ≤ 400 ms global | _(from summary)_ | _%_ | _list_ | _ms_ | _ms_ | _VU or RPS cap_ |
   | Payments p95 latency | ≤ 300 ms | _(from summary)_ | _%_ | `/v1/payments/intent` `/v1/payments/callback` | _ms_ | _ms_ | _cap_ |
   | Overall error rate | ≤ 0.10% | _%_ | _x_ | _all with err > 0_ | _%_ | _%_ | _reduce VUs / stagger_ |
   | Payments error rate | ≤ 0.01% | _%_ | _x_ | `/v1/payments/*` | _%_ | _%_ | _cap_ |
   | _Bottleneck metric_ | _target_ | _actual_ | _%_ | _endpoints_ | — | — | _mitigation_ |

   **95% CI Calculation (for latency)**:
   Use standard t-interval approximation from the per-endpoint raw CSV (downloaded step 3):
   ```python
   import pandas as pd, numpy as np, scipy.stats as st
   df = pd.read_csv("/tmp/k6-${RUN_ID}-artifacts/k6-raw-metrics.csv")
   df_endpoint = df[df["endpoint"] == "/v1/payments/intent"]["duration_ms"]
   mean = df_endpoint.mean()
   ci_low, ci_high = st.t.interval(0.95, len(df_endpoint)-1, loc=mean, scale=st.sem(df_endpoint))
   p95 = df_endpoint.quantile(0.95)
   # Use p95 as point estimate, scale CI proportionally:
   p95_ci_low = p95 * (ci_low / mean)
   p95_ci_high = p95 * (ci_high / mean)
   ```
   Record p95_ci_low and p95_ci_high in the table.

10. **Recommended Cap Calculation**: If during stage `(N VUs, T sec)` we saw 2x target p95, recommend next run cap = `N * (TARGET_P95 / ACTUAL_P95) * 0.8`. E.g., 1000 VUs produced p95 600 ms against 300 ms target → next cap = 1000 * (300/600) * 0.8 = 400 VUs. Record this formula result in the `Recommended Cap Next Run` column.

### Phase 5: SLO 30-Day Payment Success Rate and Burn-Rate Analysis

11. **30-Day SLO Success Rate Calculation**: Pull live SLO data and apply SRE SLO formula:
    ```bash
    # Pull 30-day success rate = 1 - error_ratio:
    SLI_ERROR_30D=$(promtool query instant 'slo:sli_error:ratio_rate30d{service="payments-api"}' -o json | jq -r '.data.result[0].value[1]')
    SLO_OBJECTIVE=$(promtool query instant 'slo:objective:ratio{service="payments-api"}' -o json | jq -r '.data.result[0].value[1]')

    SLI_SUCCESS_30D=$(python3 -c "print(f'{(1 - $SLI_ERROR_30D) * 100:.6f}%')")
    echo "30-day rolling payment-success-rate SLI: $SLI_SUCCESS_30D"
    echo "SLO target: $(python3 -c "print(f'{$SLO_OBJECTIVE * 100:.3f}%')")"

    ERROR_BUDGET_REMAINING=$(python3 -c "eb = $SLO_OBJECTIVE - (1 - $SLI_ERROR_30D); print(f'{eb * 100:.5f}%')")
    echo "Error budget remaining (30d window): $ERROR_BUDGET_REMAINING"
    ```

12. **Burn-Rate Alerting Ratio Validation**: Confirm the burn rates from the MO-3 alerts match the formula `sli_error_window / allowed_error_rate`:
    ```bash
    # 1-hour burn rate should match SRE SRE Workbook:
    ERR_1H=$(promtool query instant 'slo:sli_error:ratio_rate1h{service="payments-api"}' | jq -r '.data.result[0].value[1]')
    ALLOWED=$(python3 -c "print((1 - $SLO_OBJECTIVE))")
    BURN_1H=$(python3 -c "print(f'{($ERR_1H / $ALLOWED):.2f}x')")
    echo "1-hour burn-rate: $BURN_1H (should match alert label value)"
    # If > 14.4x → SLOPaymentSuccessBurnRateAlert WARN fires (correct)
    # If > 6x   in 6h → SLOPaymentSuccessBurnRate2 CRIT fires (correct)
    ```

13. **Budget Consumption Decision**: If 30-day error budget remaining falls below 10% AND burn rate > 1x:
    - Deploy freeze on any change touching payments API (recommended, not automatic)
    - Schedule perf-optimization sprint backlog item
    - Lower k6 cap for next run by additional 0.5x multiplier

---

## Verification (Before Closing RCA / Incident)

1. [ ] Root cause table COMPLETE with all 8 columns: p95 target vs actual, error rate target vs actual, affected endpoints, 95% CI, recommended cap
2. [ ] Top 3 slowest routes identified with per-endpoint p95 value and delta % to target
3. [ ] At least one Grafana panel (CPU, RAM, or queues) screenshot pasted into RCA showing correlation with peak VU window (annotate)
4. [ ] 30-day payment success rate SLI calculated, compared to SLO 99.9%
5. [ ] Burn-rate ratios computed: 1-hour burn-rate = Xx, 6-hour burn-rate = Yx. Confirm values match MO-3 alert labels.
6. [ ] Recommended VU / RPS cap for next run calculated with formula (not guessed). Stored in `mallchain-perf-baselines/k6/next_run_cap.yaml`.
7. [ ] Backend engineering assignee assigned for each failing endpoint > p95 target; linked perf-optimization PR or ticket in RCA
8. [ ] If `ErrorRate CRIT` fired: Production deploy pipeline freeze APPLIED and documented. Unfreeze only after fix passes re-run k6 in staging.
9. [ ] Perf-engineering retro scheduled for next Thursday to review findings team-wide
10. [ ] Summary posted to `#perf-results` Slack channel with: run ID link, top 3 slow, top 3 high error, cap recommendation, open action items

---

## Postmortem Prompts

1. **Regression Source**: What changed between LKG baseline (last pass) and this run? List commits between the two test commits. Identify EXACTLY which commit introduced the regression (bisect if needed). Is the regression present on main or only on a feature branch?
2. **Bottleneck Confirmation**: Was the root cause CPU, memory (GC), database query (slow query log entry?), Redis contention, nginx queue, or blockchain RPC? Attach the EXACT Grafana panel URL + time range showing the correlation. Was there a single bottleneck or multiple compounding?
3. **Test Configuration Review**: What was the VU ramp-up profile (stages)? Did we jump from 0→1000 VUs in 60 seconds (step ramp) vs 10 minutes (gradual ramp)? A steep ramp causes cold-start connection-pool storms. Propose adjustment if needed.
4. **95% CI Validity**: Were the sample sizes (req counts per endpoint) large enough for a valid t-interval (≥ 30 reqs each)? If an endpoint had 12 reqs total, discard its CI as unreliable and note.
5. **Recommended Cap Adequacy**: Using the cap set by formula, simulate: "If we had run at the recommended cap, would p95 still have breached target?" Use linear latency/VU model if sublinear. If formula is consistently off, calibrate formula and update this runbook's Phase 4 step 10.
6. **SLO Budget Burn**: Was the k6 load test a simulation only (no real user payment processing)? If yes — we double-counted SLO budget in alerting (MO-3 alert fires on both test and live). Should we add a `traffic_class: loadtest` label to exclude test traffic from SLO calculations?
7. **Tiered SLO Justification**: Payments endpoint SLO = 99.9% (0.1% allowed error). Reports endpoint target SLO = 99.0%. Were both targets applied correctly to alert rules? If not, propose Prometheus rule fix.
8. **False Positive Rate**: Was any alert a false positive? (e.g., P95Breached because target was misconfigured for that endpoint, or ErrorRate from a single 5xx that was a planned deploy during test)
9. **Observability Improvements**: What 1-2 NEW metrics would have made correlation FASTER? Example: custom span on `/v1/payments/intent` → `db_ms`, `redis_ms`, `rpc_ms` sub-component breakdown via OpenTelemetry.
10. **Action Items**: Produce 5 SMART action items: (a) Assignee to fix each failing endpoint, (b) deploy-freeze lift criteria, (c) next k6 run scheduled date with new cap, (d) SLO label fix if applicable, (e) Grafana dashboard link + template update for future load tests.
