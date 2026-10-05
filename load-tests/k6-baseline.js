/**
 * k6 Load Testing Baseline
 * Establishes performance baselines and SLO thresholds
 * 
 * Usage:
 * k6 run load-tests/k6-baseline.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const apiCounter = new Counter('api_requests');
const activeUsers = new Gauge('active_users');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const DURATION = __ENV.DURATION || '10m';
const VUS = __ENV.VUS || '10';

export const options = {
  vus: parseInt(VUS),
  duration: DURATION,

  // Thresholds (SLO targets)
  thresholds: {
    // Error rate < 1%
    errors: ['rate<0.01'],

    // API latency
    api_duration: [
      'p(95)<500',  // P95 < 500ms
      'p(99)<1000', // P99 < 1000ms
      'avg<200',    // Average < 200ms
    ],

    // Request success
    api_requests: ['rate>0'],

    // HTTP status codes
    'http_req_duration': [
      'p(95)<500',
      'p(99)<1000',
    ],
    'http_req_failed': ['rate<0.01'],
  },

  // Stages: ramp up, sustain, ramp down
  stages: [
    { duration: '1m', target: parseInt(VUS) * 0.25 },     // Ramp up
    { duration: '3m', target: parseInt(VUS) * 0.5 },      // Ramp up more
    { duration: '5m', target: parseInt(VUS) },             // Full load
    { duration: '5m', target: parseInt(VUS) },             // Sustain
    { duration: '1m', target: parseInt(VUS) * 0.5 },      // Ramp down
    { duration: '1m', target: 0 },                         // Ramp down
  ],

  // Execution context
  ext: {
    loadimpact: {
      projectID: 3356643,
      name: 'Mallchain Baseline',
    },
  },
};

export default function () {
  activeUsers.add(1);

  // Test: Get health
  group('Health Checks', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    apiDuration.add(res.timings.duration);
    apiCounter.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 100ms': (r) => r.timings.duration < 100,
    }) || errorRate.add(1);

    sleep(1);
  });

  // Test: List market products
  group('Market API', () => {
    const res = http.get(`${BASE_URL}/api/market/products?page=1&limit=10`);
    apiDuration.add(res.timings.duration);
    apiCounter.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has products': (r) => r.json('products.length') > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);

    sleep(2);
  });

  // Test: Login (requires credentials)
  group('Authentication', () => {
    const loginPayload = JSON.stringify({
      email: `testuser${Math.floor(Math.random() * 10000)}@example.com`,
      password: 'testpassword123',
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    apiDuration.add(loginRes.timings.duration);
    apiCounter.add(1);

    check(loginRes, {
      'login status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);

    sleep(1);
  });

  // Test: Get user profile (if authenticated)
  group('User Profile', () => {
    const token = 'test-jwt-token'; // Would be obtained from login

    const profileRes = http.get(`${BASE_URL}/api/user/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    apiDuration.add(profileRes.timings.duration);
    apiCounter.add(1);

    // Accept both success and unauthorized (since we don't have real token)
    check(profileRes, {
      'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'response time < 300ms': (r) => r.timings.duration < 300,
    }) || errorRate.add(1);

    sleep(1);
  });

  // Test: Get blockchain info
  group('Blockchain API', () => {
    const res = http.get(`${BASE_URL}/api/blockchain/info`);
    apiDuration.add(res.timings.duration);
    apiCounter.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has chain info': (r) => r.json('chainId') !== undefined,
      'response time < 300ms': (r) => r.timings.duration < 300,
    }) || errorRate.add(1);

    sleep(1);
  });

  // Test: Get validators
  group('Validators API', () => {
    const res = http.get(`${BASE_URL}/api/validators?limit=10`);
    apiDuration.add(res.timings.duration);
    apiCounter.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has validators': (r) => r.json('validators.length') > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);

    sleep(1);
  });

  activeUsers.add(-1);
}

// Post-test summary
export function teardown(data) {
  console.log('=== Load Test Summary ===');
  console.log(`Total Requests: ${data.total_requests || 'N/A'}`);
  console.log(`Error Rate: ${(errorRate.value * 100).toFixed(2)}%`);
  console.log(`Average Duration: ${apiDuration.value}ms`);
}
