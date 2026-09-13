# Runbook: HTTP error rate spike (5xx / backend_errors_total)

## Detect
- `HighHttp5xxErrorRate` or `BackendErrorRateSpike` alerts

## Diagnose
1. `backend_errors_total` is labeled by `code`/`status_code`
   (`utils/errorHandler.js`'s `AppError` codes) — break down by label first,
   don't just look at the aggregate rate. A spike concentrated in one
   `code` points at one broken code path, not a systemic issue.
2. Cross-check `http_requests_total{status_code=~"5.."}` broken down by
   `route` — is this one endpoint or everything?
3. Check recent deploys — a route-specific spike right after a deploy is
   almost always that deploy.
4. Check dependency health (`/api/health`) — Mongo/Redis/chain degradation
   often shows up first as a 5xx spike on the routes that touch them,
   before the dependency's own alert fires.

## Mitigate
- Deploy-correlated: roll back (`kubectl rollout undo deployment/backend`).
- Dependency-correlated: follow that dependency's own runbook
  (02/03/04 in this directory).
- Neither: read the actual `errorMessage`/`errorStack` fields on the
  `backend_errors_total`-driving log lines (structured JSON via pino, see
  `utils/logger.js`) — this is a real bug needing a real fix, not something
  a runbook step can resolve generically.

## Verify recovery
Error rate back to baseline in the same Grafana panel
(`monitoring/grafana/dashboard.json`'s "Backend errors by code").
