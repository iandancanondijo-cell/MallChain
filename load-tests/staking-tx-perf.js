import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const MONITORING_API_KEY = __ENV.MONITORING_API_KEY || '';

const stakingErrorRate = new Rate('staking_error_rate');

export const options = {
  scenarios: {
    staking_tx_perf: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 200 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<6000'],
    staking_error_rate: ['rate<0.05'],
  },
};

const headers = {
  'Content-Type': 'application/json',
};

if (MONITORING_API_KEY) {
  headers['x-api-key'] = MONITORING_API_KEY;
}

const sampleTxHashes = [
  'A0B1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1',
  '1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B',
  'F0E1D2C3B4A5F6E7D8C9B0A1F2E3D4C5B6A7F8E9D0C1B2A3F4E5D6C7B8A9F0E1',
  '00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF',
  '112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00',
];

function stakingPick() {
  const r = Math.random();
  if (r < 0.3) return 'validators';
  if (r < 0.6) return 'balance';
  if (r < 0.85) return 'unbonding';
  return 'txstatus';
}

export default function () {
  const pick = stakingPick();
  let res;

  switch (pick) {
    case 'validators': {
      res = http.get(`${BASE_URL}/api/staking/validators`, { headers });
      const ok = check(res, {
        'validators 2xx': (r) => r.status >= 200 && r.status < 300,
      });
      stakingErrorRate.add(!ok);
      break;
    }
    case 'balance': {
      const addr = 'mall1' + Math.random().toString(36).substring(2, 42);
      res = http.get(`${BASE_URL}/api/staking/balance?address=${addr}`, { headers });
      const ok = check(res, {
        'staking balance 2xx': (r) => r.status >= 200 && r.status < 300,
      });
      stakingErrorRate.add(!ok);
      break;
    }
    case 'unbonding': {
      const addr = 'mall1' + Math.random().toString(36).substring(2, 42);
      res = http.get(`${BASE_URL}/api/staking/unbonding?address=${addr}`, { headers });
      const ok = check(res, {
        'unbonding 2xx': (r) => r.status >= 200 && r.status < 300,
      });
      stakingErrorRate.add(!ok);
      break;
    }
    case 'txstatus': {
      const hash = sampleTxHashes[Math.floor(Math.random() * sampleTxHashes.length)];
      res = http.get(`${BASE_URL}/api/tx/status/${hash}`, { headers });
      const ok = check(res, {
        'tx/status 2xx or 404': (r) => (r.status >= 200 && r.status < 300) || r.status === 404,
      });
      stakingErrorRate.add(!ok);
      break;
    }
  }

  sleep(0.2);
}
