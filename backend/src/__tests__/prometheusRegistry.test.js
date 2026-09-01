// Regression coverage for a real bug found while auditing observability:
// index.js used to register TWO app.get('/metrics', ...) handlers — one
// early (no auth, using utils/metrics.js's registry) and one later
// (apiKeyAuth-gated, using mallwallet/monitoring/prometheus.js's OWN,
// separate registry). Express matches routes in registration order and the
// first handler never called next(), so the gated one was dead code:
// /metrics was actually served with no auth at all, and
// marketplace_tx_job_status_total (only registered on the second registry)
// was never exposed to any scrape.
//
// The fix makes mallwallet/monitoring/prometheus.js register its counter
// onto the SAME registry utils/metrics.js already owns, so index.js only
// needs (and only has) one /metrics route, gated, showing every metric.
// This test locks in "same registry" directly rather than re-deriving
// index.js's route wiring, which would need mocking mongoose/redis/etc. to
// even require that file.
describe('prometheus registry wiring', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('mallwallet/monitoring/prometheus registers onto the shared utils/metrics registry, not a second one', () => {
    const metrics = require('../utils/metrics');
    const txQueueRegister = require('../mallwallet/monitoring/prometheus');

    expect(txQueueRegister).toBe(metrics.register);
  });

  test('the shared registry exposes both a pre-existing app metric and the tx-queue counter together', async () => {
    const { register } = require('../utils/metrics');
    require('../mallwallet/monitoring/prometheus');

    const text = await register.metrics();

    expect(text).toContain('marketplace_tx_job_status_total');
    expect(text).toContain('http_requests_total');
  });
});
