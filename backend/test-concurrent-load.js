/**
 * Backend Load Test: Concurrent Users
 * 
 * Tests backend API performance under load with multiple concurrent connections.
 * Simulates realistic scenarios with varying user behaviors.
 * 
 * Run with: node test-concurrent-load.js
 * 
 * Test Scenarios:
 * - 10 concurrent users making simultaneous requests
 * - 50 concurrent users with varying request patterns
 * - 100 concurrent users with realistic think times
 * - Socket.IO load with 50+ concurrent subscribers
 */

const http = require('http');
const io = require('socket.io-client');

// Configuration
const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const API_ENDPOINTS = [
  '/api/health',
  '/api/validators',
  '/api/explorer/blocks?limit=10',
];

// Metrics collection
class LoadTestMetrics {
  constructor() {
    this.metrics = [];
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = Date.now();
    this.metrics = [];
  }

  end() {
    this.endTime = Date.now();
  }

  recordRequest(responseTime, statusCode, error) {
    this.metrics.push({
      responseTime,
      statusCode,
      error,
      timestamp: Date.now(),
    });
  }

  getResults(scenario) {
    const duration = this.endTime - this.startTime;
    const successfulRequests = this.metrics.filter((m) => !m.error).length;
    const failedRequests = this.metrics.filter((m) => m.error).length;
    const totalRequests = this.metrics.length;

    const responseTimes = this.metrics.map((m) => m.responseTime).sort((a, b) => a - b);

    return {
      scenario,
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      avgResponseTime: this.calculateAverage(responseTimes),
      p95ResponseTime: this.calculatePercentile(responseTimes, 95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 99),
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      throughput: duration > 0 ? (totalRequests / (duration / 1000)) : 0,
      duration,
    };
  }

  calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  printResults(results) {
    console.log('\n' + '='.repeat(50));
    console.log(`Scenario: ${results.scenario}`);
    console.log('='.repeat(50));
    console.log(`Total Requests: ${results.totalRequests}`);
    console.log(`Successful: ${results.successfulRequests}`);
    console.log(`Failed: ${results.failedRequests}`);
    console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
    console.log(`\nResponse Times:`);
    console.log(`  Average: ${results.avgResponseTime.toFixed(2)}ms`);
    console.log(`  P95: ${results.p95ResponseTime.toFixed(2)}ms`);
    console.log(`  P99: ${results.p99ResponseTime.toFixed(2)}ms`);
    console.log(`  Min: ${results.minResponseTime.toFixed(2)}ms`);
    console.log(`  Max: ${results.maxResponseTime.toFixed(2)}ms`);
    console.log(`\nThroughput: ${results.throughput.toFixed(2)} req/s`);
    console.log(`Duration: ${results.duration}ms`);
    console.log('='.repeat(50) + '\n');
  }
}

// Make HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(API_BASE_URL + endpoint);

    const handler = (response) => {
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        const time = Date.now() - startTime;
        resolve({
          time,
          statusCode: response.statusCode,
          ok: response.statusCode === 200,
          error: response.statusCode !== 200 ? `HTTP ${response.statusCode}` : null,
        });
      });
    };

    const req = http.request(url, { method: 'GET' }, handler);
    req.on('error', () => {
      const time = Date.now() - startTime;
      resolve({
        time,
        ok: false,
        error: 'Connection error',
      });
    });
    req.end();
  });
}

// Simulate a user session
async function simulateUserSession(userId, concurrentUsers, requestsPerUser, thinkTimeMs, metrics) {
  for (let i = 0; i < requestsPerUser; i++) {
    if (i > 0 && thinkTimeMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * thinkTimeMs)
      );
    }

    const endpoint = API_ENDPOINTS[i % API_ENDPOINTS.length];
    const result = await makeRequest(endpoint);
    metrics.recordRequest(result.time, result.statusCode, result.error);
  }
}

// Test Socket.IO load
async function testSocketIOLoad(concurrentConnections) {
  console.log(`\nTesting Socket.IO with ${concurrentConnections} concurrent connections...`);

  let successful = 0;
  let failed = 0;
  const connectionPromises = [];

  for (let i = 0; i < concurrentConnections; i++) {
    connectionPromises.push(
      new Promise((resolve) => {
        const socket = io(API_BASE_URL, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 3,
        });

        const timeout = setTimeout(() => {
          failed++;
          socket.disconnect();
          resolve();
        }, 10000);

        socket.on('connect', () => {
          clearTimeout(timeout);
          successful++;
          
          // Simulate subscriptions
          socket.emit('subscribe:blocks');
          socket.emit('subscribe:market');

          // Disconnect after 5 seconds
          setTimeout(() => {
            socket.disconnect();
            resolve();
          }, 5000);
        });

        socket.on('connect_error', () => {
          clearTimeout(timeout);
          failed++;
          resolve();
        });
      })
    );
  }

  await Promise.allSettled(connectionPromises);

  console.log(`Socket.IO Results:`);
  console.log(`  Successful connections: ${successful}`);
  console.log(`  Failed connections: ${failed}`);
  console.log(`  Success rate: ${((successful / concurrentConnections) * 100).toFixed(2)}%`);

  return { successful, failed };
}

// Run load tests
async function runLoadTests() {
  console.log('\n' + '='.repeat(60));
  console.log('CONCURRENT LOAD TEST SUITE');
  console.log('='.repeat(60));
  console.log(`Backend URL: ${API_BASE_URL}`);
  console.log('');

  // Check backend availability
  try {
    console.log('Checking backend availability...');
    await makeRequest('/api/health');
    console.log('✓ Backend is available\n');
  } catch (error) {
    console.error('✗ Backend not available');
    process.exit(1);
  }

  const allResults = [];

  // Test 1: 10 concurrent users
  console.log('Test 1: 10 Concurrent Users');
  console.log('----');
  const metrics1 = new LoadTestMetrics();
  metrics1.start();

  const users1 = Array.from({ length: 10 }).map((_, userId) =>
    simulateUserSession(userId, 10, 5, 500, metrics1)
  );

  await Promise.allSettled(users1);
  metrics1.end();

  const results1 = metrics1.getResults('10 Concurrent Users');
  metrics1.printResults(results1);
  allResults.push(results1);

  // Test 2: 50 concurrent users
  console.log('Test 2: 50 Concurrent Users');
  console.log('----');
  const metrics2 = new LoadTestMetrics();
  metrics2.start();

  const users2 = Array.from({ length: 50 }).map((_, userId) =>
    simulateUserSession(userId, 50, 8, 1000, metrics2)
  );

  await Promise.allSettled(users2);
  metrics2.end();

  const results2 = metrics2.getResults('50 Concurrent Users');
  metrics2.printResults(results2);
  allResults.push(results2);

  // Test 3: 100 concurrent users
  console.log('Test 3: 100 Concurrent Users');
  console.log('----');
  const metrics3 = new LoadTestMetrics();
  metrics3.start();

  const users3 = Array.from({ length: 100 }).map((_, userId) =>
    simulateUserSession(userId, 100, 5, 2000, metrics3)
  );

  await Promise.allSettled(users3);
  metrics3.end();

  const results3 = metrics3.getResults('100 Concurrent Users');
  metrics3.printResults(results3);
  allResults.push(results3);

  // Test 4: Socket.IO load
  console.log('Test 4: Socket.IO Load Test');
  console.log('----');
  await testSocketIOLoad(50);

  // Test 5: API response times (50 concurrent)
  console.log('\nTest 5: API Response Times (50 Concurrent)');
  console.log('----');
  const metrics4 = new LoadTestMetrics();
  metrics4.start();

  const requests = Array.from({ length: 50 }).map(() =>
    makeRequest('/api/health')
  );

  const requestResults = await Promise.all(requests);
  requestResults.forEach((result) => {
    metrics4.recordRequest(result.time, result.statusCode, result.error);
  });

  metrics4.end();

  const results4 = metrics4.getResults('API Response Times');
  metrics4.printResults(results4);
  allResults.push(results4);

  // Test 6: Sustained load (10 seconds)
  console.log('Test 6: Sustained Load (10 seconds)');
  console.log('----');
  const metrics5 = new LoadTestMetrics();
  const duration = 10000;
  const startTime = Date.now();

  metrics5.start();

  while (Date.now() - startTime < duration) {
    const batchRequests = Array.from({ length: 20 }).map(() =>
      makeRequest('/api/health')
    );

    const batchResults = await Promise.all(batchRequests);
    batchResults.forEach((result) => {
      metrics5.recordRequest(result.time, result.statusCode, result.error);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  metrics5.end();

  const results5 = metrics5.getResults('Sustained Load');
  metrics5.printResults(results5);
  allResults.push(results5);

  // Print summary
  printSummary(allResults);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('LOAD TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('');

  console.log('Performance Overview:');
  console.log('┌─────────────────────────┬─────────┬─────────┬──────────┐');
  console.log('│ Scenario                │ Avg (ms)│ P99 (ms)│ Req/s    │');
  console.log('├─────────────────────────┼─────────┼─────────┼──────────┤');

  results.forEach((result) => {
    const scenarioName = result.scenario.padEnd(23);
    const avg = result.avgResponseTime.toFixed(0).padStart(5);
    const p99 = result.p99ResponseTime.toFixed(0).padStart(5);
    const throughput = result.throughput.toFixed(2).padStart(6);
    console.log(`│ ${scenarioName} │ ${avg} │ ${p99} │ ${throughput}  │`);
  });

  console.log('└─────────────────────────┴─────────┴─────────┴──────────┘');
  console.log('');

  console.log('Success Criteria Assessment:');
  let allPassed = true;

  results.forEach((result) => {
    console.log(`\n${result.scenario}:`);

    const errorRateOk = result.errorRate < 1;
    console.log(`  • Error Rate < 1%: ${errorRateOk ? '✓ PASS' : '✗ FAIL'} (${result.errorRate.toFixed(2)}%)`);
    if (!errorRateOk) allPassed = false;

    const responseTimeOk = result.avgResponseTime < 2000;
    console.log(`  • Avg Response < 2s: ${responseTimeOk ? '✓ PASS' : '✗ FAIL'} (${result.avgResponseTime.toFixed(0)}ms)`);
    if (!responseTimeOk) allPassed = false;

    const throughputOk = result.throughput > 0;
    console.log(`  • Positive Throughput: ${throughputOk ? '✓ PASS' : '✗ FAIL'} (${result.throughput.toFixed(2)} req/s)`);
    if (!throughputOk) allPassed = false;
  });

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✓ ALL TESTS PASSED');
  } else {
    console.log('✗ SOME TESTS FAILED - Review metrics and adjust configuration');
  }
  console.log('='.repeat(60) + '\n');

  console.log('Recommendations:');
  console.log('1. For production: Ensure 50+ concurrent user support');
  console.log('2. Monitor response times: target < 2s for 95% of requests');
  console.log('3. Implement caching: Use Redis for frequently accessed data');
  console.log('4. Database optimization: Ensure indexes on frequently queried fields');
  console.log('5. Connection pooling: Configure appropriate pool size');
  console.log('6. Rate limiting: Adjust thresholds based on throughput requirements');
  console.log('7. Load balancing: Use horizontal scaling for production');
  console.log('8. Socket.IO: Deploy with Redis adapter for clustering');
  console.log('');
}

// Main execution
if (require.main === module) {
  runLoadTests().catch((error) => {
    console.error('Load test failed:', error);
    process.exit(1);
  });
}

module.exports = {
  LoadTestMetrics,
  makeRequest,
  simulateUserSession,
  testSocketIOLoad,
};
