# Monitoring

Prometheus alert rules and a Grafana dashboard for the Mallchain backend, matched
to the metrics actually emitted by `backend/src/utils/metrics.js` and
`backend/src/mallwallet/monitoring/prometheus.js` (both share one registry —
see the fix in `backend/src/index.js`'s `/metrics` route — so everything here
comes from a single scrape).

## What's here (code-level, ready to use)

- `prometheus/alert_rules.yml` — alerting rules (error rate, latency, payment
  failures, tx-queue failure rate, memory, etc.)
- `prometheus/prometheus.yml` — example scrape config, including the
  `x-api-key` header `/metrics` requires (see `apiKeyAuth` middleware)
- `grafana/dashboard.json` — importable dashboard (Dashboards → Import → 
  upload JSON, point it at your Prometheus datasource)

## Distributed tracing (O3)

`backend/src/tracing.js` — OpenTelemetry, auto-instrumenting
http/express/mongodb/ioredis/etc. Entirely opt-in via
`OTEL_EXPORTER_OTLP_ENDPOINT` (see `.env.example`): unset means the SDK
never starts at all — no overhead, no console-exporter noise by default.
Wired into `backend/package.json`'s `start`/`dev` scripts and
`backend/Dockerfile`'s `CMD` via `node -r ./src/tracing.js`, which has to
run before `src/index.js` itself so auto-instrumentation can patch modules
before anything else requires them.

## What still needs a human / an account (not implementable as code)

- **A Prometheus + Alertmanager + Grafana deployment to run these on.** This
  repo doesn't provision infrastructure — these are the configs to drop into
  whatever Prometheus/Grafana instance actually gets stood up (managed
  service or self-hosted).
- **An Alertmanager receiver.** `alert_rules.yml` defines *what* fires; where
  it goes (PagerDuty/Opsgenie/Slack/email) is an Alertmanager `route` +
  `receivers` config that needs real credentials for whichever paging service
  the team picks — that's an account/subscription decision, not something to
  guess and hardcode here.
- **`ADMIN_API_KEY`** for the scrape config's `x-api-key` header — pull the
  real value from whatever secret store the deployment uses; never commit it.
- **An OTLP collector/APM backend to point `OTEL_EXPORTER_OTLP_ENDPOINT` at**
  (a self-hosted otel-collector + Jaeger/Tempo, or a vendor's OTLP ingest) —
  same category as the Prometheus/Grafana instance above.
