// P1: k6 load test against the backend's real, read-only endpoints.
// Deliberately does NOT exercise write/financial routes (buy/withdraw/sell)
// against a real environment — those move real money via Safaricom and
// broadcast real chain transactions; load-testing them needs a sandboxed
// environment with test credentials, not something to point at a shared
// or production target by default.
//
// Usage:
//   k6 run load-tests/k6-api-load-test.js
//   BASE_URL=https://staging.example.com k6 run load-tests/k6-api-load-test.js
//
// Install k6: https://k6.io/docs/get-started/installation/
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency', true);

export const options = {
  scenarios: {
    steady_read_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Fails the run (non-zero exit) if either of these is breached —
    // matched to the same p95/error-rate concerns as
    // monitoring/prometheus/alert_rules.yml's HighRequestLatencyP95 and
    // HighHttp5xxErrorRate, so a load test failure and a production alert
    // are checking for the same thing.
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.05'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/api/health`);
  healthLatency.add(health.timings.duration);
  const healthOk = check(health, {
    'health status is 200 or 503 (reachable)': (r) => r.status === 200 || r.status === 503,
  });
  errorRate.add(!healthOk);

  const marketConfig = http.get(`${BASE_URL}/api/buy/config`);
  const marketOk = check(marketConfig, {
    'buy config responds': (r) => r.status === 200,
  });
  errorRate.add(!marketOk);

  const ready = http.get(`${BASE_URL}/api/ready`);
  check(ready, {
    'ready endpoint reachable': (r) => r.status === 200 || r.status === 503,
  });

  sleep(1);
}
