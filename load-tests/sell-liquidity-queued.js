import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TEST_JWT = __ENV.TEST_JWT || '';
const MONITORING_API_KEY = __ENV.MONITORING_API_KEY || '';

const queuedLiquidityOk = new Counter('queued_liquidity_ok');
const sellLatency = new Trend('sell_latency_ms', true);
const sellErrorRate = new Rate('sell_error_rate');

export const options = {
  scenarios: {
    sell_liquidity_queued: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
    },
  },
  thresholds: {
    queued_liquidity_ok: ['count>25'],
    http_req_duration: ['p(95)<5000'],
    sell_error_rate: ['rate<0.1'],
  },
};

const headers = {
  'Content-Type': 'application/json',
};

if (MONITORING_API_KEY) {
  headers['x-api-key'] = MONITORING_API_KEY;
}

if (TEST_JWT) {
  headers['Authorization'] = `Bearer ${TEST_JWT}`;
}

function randomBech32Address() {
  const chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  let body = '';
  for (let i = 0; i < 38; i++) {
    body += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `mall1${body}`;
}

function randomTxBytes() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  const len = 200 + Math.floor(Math.random() * 300);
  for (let i = 0; i < len; i++) {
    base64 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const pad = (4 - (len % 4)) % 4;
  return base64 + '='.repeat(pad);
}

export default function () {
  if (!TEST_JWT) {
    throw new Error('TEST_JWT environment variable is required for sell-liquidity-queued.js');
  }

  const amount = Math.floor(Math.random() * (5000 - 100 + 1)) + 100;
  const body = JSON.stringify({
    amount,
    txBytes: randomTxBytes(),
    sellerAddress: randomBech32Address(),
  });

  const res = http.post(`${BASE_URL}/api/buy/sell`, body, { headers });
  sellLatency.add(res.timings.duration);

  const is2xx = res.status >= 200 && res.status < 300;
  if (is2xx) {
    queuedLiquidityOk.add(1);
  }

  const ok = check(res, {
    'sell 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  sellErrorRate.add(!ok);

  sleep(0.2);
}
