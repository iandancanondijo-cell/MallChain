import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const MONITORING_API_KEY = __ENV.MONITORING_API_KEY || '';
const PROMETHEUS_REMOTE_URL = __ENV.PROMETHEUS_REMOTE_URL || '';

const payLatency = new Trend('pay_latency_ms', true);
const payErrorRate = new Rate('pay_error_rate');

export const options = {
  scenarios: {
    payment_sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '10m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    pay_error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.02'],
  },
  ext: {
    loadimpact: {
      apm: [],
    },
  },
};

const headers = {
  'Content-Type': 'application/json',
};

if (MONITORING_API_KEY) {
  headers['x-api-key'] = MONITORING_API_KEY;
}

function weightedPick() {
  const r = Math.random();
  if (r < 0.6) return 'simulate';
  if (r < 0.8) return 'health';
  if (r < 0.9) return 'config';
  return 'ready';
}

export default function () {
  const pick = weightedPick();
  let res;

  switch (pick) {
    case 'simulate': {
      const body = JSON.stringify({
        amount: Math.floor(Math.random() * 10000) + 100,
        currency: 'KES',
      });
      res = http.post(`${BASE_URL}/api/buy/simulate-sandbox`, body, { headers });
      payLatency.add(res.timings.duration);
      const ok = check(res, {
        'simulate-sandbox 2xx': (r) => r.status >= 200 && r.status < 300,
      });
      payErrorRate.add(!ok);
      break;
    }
    case 'health': {
      res = http.get(`${BASE_URL}/api/health`, { headers });
      const ok = check(res, {
        'health 2xx or 503': (r) => r.status === 200 || r.status === 503,
      });
      payErrorRate.add(!ok);
      break;
    }
    case 'config': {
      res = http.get(`${BASE_URL}/api/buy/config`, { headers });
      const ok = check(res, {
        'buy/config 2xx': (r) => r.status >= 200 && r.status < 300,
      });
      payErrorRate.add(!ok);
      break;
    }
    case 'ready': {
      res = http.get(`${BASE_URL}/api/ready`, { headers });
      const ok = check(res, {
        'ready 2xx or 503': (r) => r.status === 200 || r.status === 503,
      });
      payErrorRate.add(!ok);
      break;
    }
  }

  sleep(0.2);
}

if (PROMETHEUS_REMOTE_URL) {
  console.log(`Prometheus remote-write URL configured: ${PROMETHEUS_REMOTE_URL}`);
}
