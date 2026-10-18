#!/usr/bin/env node

/**
 * Load Test Suite for PIN Verification System
 * 
 * Stress-tests /api/wallet/verify-pin endpoint with:
 * 1. Baseline load (100 req/sec for 30s)
 * 2. Stress load (500 req/sec for 30s)
 * 3. Lockout stress (50 simultaneous failed attempts)
 * 4. Recovery test (after cooldown)
 * 
 * Metrics: response time distribution (p50, p95, p99), error rates, rate limiting
 * 
 * Run with: node load-test-pin.js [--target http://localhost:4000] [--duration 30] [--rate 100]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse command-line arguments
const args = process.argv.slice(2);
let targetUrl = 'http://localhost:4000';
let duration = 30;
let rps = 100;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target' && args[i + 1]) {
    targetUrl = args[i + 1];
    i++;
  } else if (args[i] === '--duration' && args[i + 1]) {
    duration = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--rate' && args[i + 1]) {
    rps = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--verbose') {
    verbose = true;
  }
}

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * HTTP request helper
 */
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${targetUrl}${path}`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer mock-test-token',
      ...headers,
    };

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      defaultHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: defaultHeaders,
      timeout: 5000,
    };

    const start = Date.now();

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - start;
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: parsed, elapsed });
        } catch {
          resolve({ status: res.statusCode, body: null, elapsed });
        }
      });
    });

    req.on('error', (err) => {
      const elapsed = Date.now() - start;
      reject({ error: err.message, elapsed });
    });

    req.on('timeout', () => {
      const elapsed = Date.now() - start;
      req.destroy();
      reject({ error: 'timeout', elapsed });
    });

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Statistics collector
 */
class Stats {
  constructor(name) {
    this.name = name;
    this.responseTimes = [];
    this.statusCodes = {};
    this.errors = [];
    this.startTime = Date.now();
  }

  recordRequest(responseTime, statusCode, error = null) {
    this.responseTimes.push(responseTime);
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    if (error) {
      this.errors.push(error);
    }
  }

  getPercentile(percentile) {
    if (this.responseTimes.length === 0) return 0;
    const sorted = this.responseTimes.slice().sort((a, b) => a - b);
    const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  report() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const totalRequests = this.responseTimes.length + this.errors.length;
    const avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.responseTimes.length);
    const p50 = this.getPercentile(50);
    const p95 = this.getPercentile(95);
    const p99 = this.getPercentile(99);

    log(`\n${this.name}`, 'yellow');
    log(`=====================================`);
    log(`Duration: ${elapsed.toFixed(2)}s`);
    log(`Total Requests: ${totalRequests}`);
    log(`Successful: ${this.responseTimes.length}`);
    log(`Failed: ${this.errors.length}`, this.errors.length > 0 ? 'red' : 'green');
    log(`Request Rate: ${(totalRequests / elapsed).toFixed(2)} req/s`);
    log(``);
    log(`Response Times (ms):`);
    log(`  Average: ${avgResponseTime.toFixed(2)}`);
    log(`  p50:     ${p50.toFixed(2)}`);
    log(`  p95:     ${p95.toFixed(2)}`);
    log(`  p99:     ${p99.toFixed(2)}`);
    log(`  Min:     ${Math.min(...this.responseTimes).toFixed(2)}`);
    log(`  Max:     ${Math.max(...this.responseTimes).toFixed(2)}`);
    log(``);
    log(`Status Codes:`);
    for (const [code, count] of Object.entries(this.statusCodes)) {
      const pct = ((count / totalRequests) * 100).toFixed(1);
      const color = code === '200' ? 'green' : (code === '429' ? 'yellow' : 'red');
      log(`  ${code}: ${count} (${pct}%)`, color);
    }

    if (this.errors.length > 0) {
      log(``);
      log(`Errors:`);
      const errorTypes = {};
      for (const err of this.errors) {
        errorTypes[err] = (errorTypes[err] || 0) + 1;
      }
      for (const [err, count] of Object.entries(errorTypes)) {
        log(`  ${err}: ${count}`, 'red');
      }
    }
  }
}

/**
 * Load test: send requests at a steady rate
 */
async function loadTest(name, rps, duration, pinValue) {
  const stats = new Stats(name);
  const interval = 1000 / rps;
  const endTime = Date.now() + duration * 1000;
  let nextRequestTime = Date.now();
  let requestCount = 0;

  log(`\nStarting ${name} (${rps} req/s for ${duration}s)...`, 'blue');

  return new Promise((resolve) => {
    const ticker = setInterval(async () => {
      const now = Date.now();

      while (nextRequestTime <= now && now < endTime) {
        (async () => {
          try {
            const res = await request('POST', '/api/wallet/verify-pin', { pin: pinValue });
            stats.recordRequest(res.elapsed, res.status);
            if (verbose && requestCount % 100 === 0) {
              log(`  Request ${requestCount}: ${res.status} (${res.elapsed}ms)`, 'gray');
            }
          } catch (e) {
            stats.recordRequest(e.elapsed || 0, 'error', e.error);
          }
          requestCount++;
        })();
        nextRequestTime += interval;
      }

      if (now >= endTime) {
        clearInterval(ticker);
        setTimeout(() => {
          stats.report();
          resolve(stats);
        }, 1000);
      }
    }, Math.max(10, interval / 10));
  });
}

/**
 * Lockout stress test: simulate 50 simultaneous failed attempts
 */
async function lockoutStressTest() {
  const stats = new Stats('Lockout Stress Test (50 simultaneous users)');

  log(`\nStarting lockout stress test...`, 'blue');

  const promises = [];
  for (let i = 0; i < 50; i++) {
    const headers = {
      'Authorization': `Bearer user-${i}`,
      'X-Forwarded-For': `192.168.1.${i % 256}`,
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      promises.push(
        request('POST', '/api/wallet/verify-pin', { pin: 'wrong' }, headers)
          .then(res => {
            stats.recordRequest(res.elapsed, res.status);
            return { success: true, status: res.status };
          })
          .catch(err => {
            stats.recordRequest(err.elapsed || 0, 'error', err.error);
            return { success: false, error: err.error };
          })
      );
    }
  }

  await Promise.all(promises);
  stats.report();
  return stats;
}

/**
 * Recovery test: verify system recovers after cooldown
 */
async function recoveryTest() {
  log(`\nStarting recovery test...`, 'blue');
  log(`Waiting 5 minutes for cooldown (simulated: checking after short delay)...`, 'yellow');

  await new Promise(resolve => setTimeout(resolve, 10000));

  const stats = new Stats('Recovery Test (after cooldown)');

  log(`Sending verification requests after cooldown...`, 'gray');

  for (let i = 0; i < 10; i++) {
    try {
      const res = await request('POST', '/api/wallet/verify-pin', { pin: '1234' });
      stats.recordRequest(res.elapsed, res.status);
    } catch (e) {
      stats.recordRequest(e.elapsed || 0, 'error', e.error);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  stats.report();
  return stats;
}

/**
 * Main test runner
 */
async function runAllTests() {
  log(`\nMallchain PIN Verification Load Test`, 'yellow');
  log(`Target: ${targetUrl}`, 'yellow');
  log(`====================================`, 'yellow');

  try {
    const healthRes = await request('GET', '/health', null);
    log(`✓ Target reachable (${healthRes.status})`, 'green');
  } catch (e) {
    log(`✗ Target unreachable: ${e.error}`, 'red');
    process.exit(1);
  }

  const results = [];

  log(`\n${colors.blue}═══ TEST 1: BASELINE LOAD ═══${colors.reset}`);
  log(`Target: 100 requests/second for 30 seconds`);
  log(`Expected: High success rate, <100ms avg response time`);
  const baselineResult = await loadTest('Baseline Load', 100, 30, '1234');
  results.push({ name: 'Baseline', result: baselineResult });

  log(`\n${colors.blue}═══ TEST 2: STRESS LOAD ═══${colors.reset}`);
  log(`Target: 500 requests/second for 30 seconds`);
  log(`Expected: Rate limiter activates, 429 responses increase`);
  const stressResult = await loadTest('Stress Load', 500, 30, '1234');
  results.push({ name: 'Stress', result: stressResult });

  log(`\n${colors.blue}═══ TEST 3: LOCKOUT STRESS ═══${colors.reset}`);
  log(`Target: 50 simultaneous users with 3 failed attempts each`);
  log(`Expected: Each user locks after 3 failures, returns 429`);
  const lockoutResult = await lockoutStressTest();
  results.push({ name: 'Lockout Stress', result: lockoutResult });

  log(`\n${colors.blue}═══ TEST 4: RECOVERY TEST ═══${colors.reset}`);
  log(`Target: Verify system recovers after cooldown period`);
  log(`Expected: Successful requests after cooldown`);
  const recoveryResult = await recoveryTest();
  results.push({ name: 'Recovery', result: recoveryResult });

  // Summary
  log(`\n${colors.yellow}════════════════════════════════════════${colors.reset}`);
  log(`OVERALL SUMMARY`, 'yellow');
  log(`════════════════════════════════════════`, 'yellow');

  for (const { name, result } of results) {
    const totalRequests = result.responseTimes.length + result.errors.length;
    const successRate = ((result.responseTimes.length / totalRequests) * 100).toFixed(1);
    const avgTime = result.responseTimes.length > 0
      ? (result.responseTimes.reduce((a, b) => a + b, 0) / result.responseTimes.length).toFixed(2)
      : '0.00';

    const color = result.errors.length === 0 ? 'green' : (result.errors.length < totalRequests * 0.1 ? 'yellow' : 'red');
    log(`${name.padEnd(20)} | Success: ${successRate.padEnd(6)}% | Avg: ${avgTime.padEnd(8)}ms`, color);
  }

  log(``);
  log(`✓ Load tests completed`, 'green');
  process.exit(0);
}

runAllTests().catch(e => {
  log(`\nFatal error: ${e.message}`, 'red');
  process.exit(1);
});
