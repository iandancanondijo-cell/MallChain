import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const walletDuration = new Trend('wallet_duration');

// Test configuration
export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },  // Ramp up
        { duration: '1m', target: 50 },   // Peak load
        { duration: '30s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // SLO thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95th percentile < 500ms, 99th < 1s
    http_req_failed: ['rate<0.01'], // < 1% error rate
    errors: ['rate<0.01'],
    login_duration: ['p(95)<800'],
    wallet_duration: ['p(95)<600'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!',
};

export default function () {
  // Scenario 1: Health check (high frequency, low impact)
  if (__VU <= 5) {
    healthCheck();
  }

  // Scenario 2: Authentication flow
  const loginRes = login();
  if (loginRes.status === 200) {
    const token = loginRes.json().token;

    // Scenario 3: Authenticated endpoints
    getWalletBalance(token);
    getTransactionHistory(token);
    getUserProfile(token);
  }

  // Scenario 4: Public endpoints
  getMarketStats();

  sleep(1);
}

function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health response has status': (r) => r.json().status === 'ok',
  });
  errorRate.add(!success);
}

function login() {
  const payload = JSON.stringify(testUser);
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  loginDuration.add(res.timings.duration);

  const success = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login returns token': (r) => r.json().token !== undefined,
  });
  errorRate.add(!success);

  return res;
}

function getWalletBalance(token) {
  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const res = http.get(`${BASE_URL}/api/wallet/balance`, params);
  walletDuration.add(res.timings.duration);

  const success = check(res, {
    'wallet balance status is 200': (r) => r.status === 200,
    'wallet has balance field': (r) => r.json().balance !== undefined,
  });
  errorRate.add(!success);
}

function getTransactionHistory(token) {
  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const res = http.get(`${BASE_URL}/api/transactions?limit=10`, params);

  const success = check(res, {
    'transactions status is 200': (r) => r.status === 200,
    'transactions returns array': (r) => Array.isArray(r.json().transactions),
  });
  errorRate.add(!success);
}

function getUserProfile(token) {
  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const res = http.get(`${BASE_URL}/api/auth/me`, params);

  const success = check(res, {
    'profile status is 200': (r) => r.status === 200,
    'profile has user data': (r) => r.json().user !== undefined,
  });
  errorRate.add(!success);
}

function getMarketStats() {
  const res = http.get(`${BASE_URL}/api/market/stats`);

  const success = check(res, {
    'market stats status is 200': (r) => r.status === 200,
  });
  errorRate.add(!success);
}

// Setup function - runs once before test
export function setup() {
  // Verify API is reachable
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`API not reachable at ${BASE_URL}`);
  }
  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once after test
export function teardown(data) {
  console.log(`Test completed. Started at: ${data.startTime}`);
}
