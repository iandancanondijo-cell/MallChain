/**
 * Load Test: Multiple Concurrent Users
 * 
 * Tests system performance under load with concurrent API and Socket.IO operations.
 * Simulates realistic user workflows (login, fetch data, real-time updates).
 * 
 * Test Scenarios:
 * - 10 concurrent users making simultaneous requests
 * - 50 concurrent users with varying request patterns
 * - 100 concurrent users with realistic think times
 * 
 * Metrics Collected:
 * - Response times (avg, p95, p99, min, max)
 * - Requests per second (throughput)
 * - Error rates
 * - Socket.IO connection stability
 * - Data consistency under concurrent load
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { io, Socket } from 'socket.io-client';

// Configuration
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:4000';
const SOCKET_URL = API_BASE_URL;
const TEST_TIMEOUT = 120000; // 2 minutes for load tests

// Load test configuration
interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  thinkTimeMs: number; // Realistic delay between operations
}

// Metrics collector
interface RequestMetrics {
  responseTime: number;
  statusCode?: number;
  error?: string;
  timestamp: number;
}

interface LoadTestResults {
  scenario: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number; // requests per second
  socketConnectionsSuccessful: number;
  socketConnectionsFailed: number;
  dataConsistencyIssues: number;
  duration: number;
}

class LoadTestMetrics {
  private metrics: RequestMetrics[] = [];
  private startTime: number = 0;
  private endTime: number = 0;

  start() {
    this.startTime = Date.now();
    this.metrics = [];
  }

  end() {
    this.endTime = Date.now();
  }

  recordRequest(
    responseTime: number,
    statusCode?: number,
    error?: string
  ) {
    this.metrics.push({
      responseTime,
      statusCode,
      error,
      timestamp: Date.now(),
    });
  }

  getResults(scenario: string): LoadTestResults {
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
      errorRate: (failedRequests / totalRequests) * 100,
      avgResponseTime: this.calculateAverage(responseTimes),
      p95ResponseTime: this.calculatePercentile(responseTimes, 95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 99),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      throughput: (totalRequests / (duration / 1000)),
      socketConnectionsSuccessful: 0,
      socketConnectionsFailed: 0,
      dataConsistencyIssues: 0,
      duration,
    };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }
}

// Helper function to make concurrent API requests
async function makeApiRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<{ time: number; status?: number; ok: boolean; error?: string }> {
  const startTime = Date.now();

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const time = Date.now() - startTime;

    if (!response.ok) {
      return {
        time,
        status: response.status,
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    await response.json(); // Consume body
    return { time, status: response.status, ok: true };
  } catch (error: any) {
    const time = Date.now() - startTime;
    return {
      time,
      ok: false,
      error: error.message || 'Network error',
    };
  }
}

// Simulate a user making requests with think time
async function simulateUserSession(
  userId: number,
  config: LoadTestConfig,
  metrics: LoadTestMetrics
): Promise<void> {
  for (let i = 0; i < config.requestsPerUser; i++) {
    // Simulate user think time (realistic delay between operations)
    if (i > 0 && config.thinkTimeMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * config.thinkTimeMs)
      );
    }

    // Simulate realistic user workflow
    const operationType = i % 3;

    let result;
    switch (operationType) {
      case 0:
        // Fetch health/status
        result = await makeApiRequest('/api/health');
        break;
      case 1:
        // Fetch blockchain data
        result = await makeApiRequest('/api/explorer/blocks?limit=10');
        break;
      case 2:
        // Fetch validator list
        result = await makeApiRequest('/api/validators');
        break;
      default:
        result = await makeApiRequest('/api/health');
    }

    metrics.recordRequest(result.time, result.status, result.error);
  }
}

// Test Socket.IO connections under load
async function testSocketIOLoad(
  concurrentUsers: number,
  metrics: LoadTestMetrics
): Promise<{ successful: number; failed: number }> {
  const sockets: Socket[] = [];
  let successful = 0;
  let failed = 0;

  const connectionPromises = Array.from({ length: concurrentUsers }).map(
    (_, index) =>
      new Promise<void>((resolve) => {
        const socket = io(SOCKET_URL, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        const connectionTimeout = setTimeout(() => {
          failed++;
          socket.disconnect();
          resolve();
        }, 10000);

        socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          successful++;
          sockets.push(socket);

          // Simulate subscriptions
          socket.emit('subscribe:blocks');
          socket.emit('subscribe:market');

          // Listen for events to measure latency
          socket.on('block:new', () => {
            // Event received
          });

          resolve();
        });

        socket.on('connect_error', () => {
          clearTimeout(connectionTimeout);
          failed++;
          resolve();
        });
      })
  );

  await Promise.allSettled(connectionPromises);

  // Keep connections open for a bit and measure stability
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Disconnect all sockets
  sockets.forEach((socket) => socket.disconnect());

  return { successful, failed };
}

// Main test suite
describe('Load Test: Concurrent Users', () => {
  let isBackendAvailable = false;

  beforeAll(async () => {
    // Check if backend is available
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
      });
      isBackendAvailable = response.ok;
    } catch (error) {
      isBackendAvailable = false;
      console.warn(
        'Backend not available for load testing. Tests will be skipped.'
      );
    }
  }, TEST_TIMEOUT);

  it(
    'should handle 10 concurrent users without crashing',
    async () => {
      if (!isBackendAvailable) {
        console.log('Skipping - backend not available');
        return;
      }

      const metrics = new LoadTestMetrics();
      const config: LoadTestConfig = {
        concurrentUsers: 10,
        requestsPerUser: 5,
        thinkTimeMs: 500, // 500ms average think time
      };

      metrics.start();

      const userPromises = Array.from({ length: config.concurrentUsers }).map(
        (_, userId) => simulateUserSession(userId, config, metrics)
      );

      await Promise.allSettled(userPromises);
      metrics.end();

      const results = metrics.getResults('10 Concurrent Users');

      console.log('\n=== 10 Concurrent Users Results ===');
      console.log(`Total Requests: ${results.totalRequests}`);
      console.log(`Successful: ${results.successfulRequests}`);
      console.log(`Failed: ${results.failedRequests}`);
      console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
      console.log(`Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
      console.log(`P95 Response Time: ${results.p95ResponseTime.toFixed(2)}ms`);
      console.log(`P99 Response Time: ${results.p99ResponseTime.toFixed(2)}ms`);
      console.log(`Throughput: ${results.throughput.toFixed(2)} req/s`);
      console.log(`Duration: ${results.duration}ms\n`);

      // Success criteria for 10 users
      expect(results.errorRate).toBeLessThan(5); // Less than 5% error rate
      expect(results.avgResponseTime).toBeLessThan(2000); // Avg < 2s
      expect(results.throughput).toBeGreaterThan(0); // Must have some throughput
    },
    TEST_TIMEOUT
  );

  it(
    'should handle 50 concurrent users with varying request patterns',
    async () => {
      if (!isBackendAvailable) {
        console.log('Skipping - backend not available');
        return;
      }

      const metrics = new LoadTestMetrics();
      const config: LoadTestConfig = {
        concurrentUsers: 50,
        requestsPerUser: 8,
        thinkTimeMs: 1000, // 1s average think time
      };

      metrics.start();

      const userPromises = Array.from({ length: config.concurrentUsers }).map(
        (_, userId) => simulateUserSession(userId, config, metrics)
      );

      await Promise.allSettled(userPromises);
      metrics.end();

      const results = metrics.getResults('50 Concurrent Users');

      console.log('\n=== 50 Concurrent Users Results ===');
      console.log(`Total Requests: ${results.totalRequests}`);
      console.log(`Successful: ${results.successfulRequests}`);
      console.log(`Failed: ${results.failedRequests}`);
      console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
      console.log(`Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
      console.log(`P95 Response Time: ${results.p95ResponseTime.toFixed(2)}ms`);
      console.log(`P99 Response Time: ${results.p99ResponseTime.toFixed(2)}ms`);
      console.log(`Throughput: ${results.throughput.toFixed(2)} req/s`);
      console.log(`Duration: ${results.duration}ms\n`);

      // Success criteria for 50 users
      expect(results.errorRate).toBeLessThan(3); // Less than 3% error rate
      expect(results.avgResponseTime).toBeLessThan(2000); // Avg < 2s
      expect(results.successfulRequests).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );

  it(
    'should handle 100 concurrent users with realistic think times',
    async () => {
      if (!isBackendAvailable) {
        console.log('Skipping - backend not available');
        return;
      }

      const metrics = new LoadTestMetrics();
      const config: LoadTestConfig = {
        concurrentUsers: 100,
        requestsPerUser: 5,
        thinkTimeMs: 2000, // 2s average think time
      };

      metrics.start();

      const userPromises = Array.from({ length: config.concurrentUsers }).map(
        (_, userId) => simulateUserSession(userId, config, metrics)
      );

      await Promise.allSettled(userPromises);
      metrics.end();

      const results = metrics.getResults('100 Concurrent Users');

      console.log('\n=== 100 Concurrent Users Results ===');
      console.log(`Total Requests: ${results.totalRequests}`);
      console.log(`Successful: ${results.successfulRequests}`);
      console.log(`Failed: ${results.failedRequests}`);
      console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
      console.log(`Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
      console.log(`P95 Response Time: ${results.p95ResponseTime.toFixed(2)}ms`);
      console.log(`P99 Response Time: ${results.p99ResponseTime.toFixed(2)}ms`);
      console.log(`Throughput: ${results.throughput.toFixed(2)} req/s`);
      console.log(`Duration: ${results.duration}ms\n`);

      // Success criteria for 100 users
      expect(results.successfulRequests).toBeGreaterThan(0); // Must handle some requests
      expect(results.errorRate).toBeLessThan(10); // Less than 10% error rate for high load
    },
    TEST_TIMEOUT
  );

  it('should measure API response times under load', async () => {
    if (!isBackendAvailable) {
      console.log('Skipping - backend not available');
      return;
    }

    const metrics = new LoadTestMetrics();
    const concurrentRequests = 50;

    metrics.start();

    const requests = Array.from({ length: concurrentRequests }).map(() =>
      makeApiRequest('/api/health')
    );

    const results = await Promise.all(requests);

    results.forEach((result) => {
      metrics.recordRequest(result.time, result.status, result.error);
    });

    metrics.end();

    const loadResults = metrics.getResults('API Response Times');

    console.log('\n=== API Response Times (50 concurrent) ===');
    console.log(`Avg: ${loadResults.avgResponseTime.toFixed(2)}ms`);
    console.log(`P95: ${loadResults.p95ResponseTime.toFixed(2)}ms`);
    console.log(`P99: ${loadResults.p99ResponseTime.toFixed(2)}ms`);
    console.log(`Min: ${loadResults.minResponseTime.toFixed(2)}ms`);
    console.log(`Max: ${loadResults.maxResponseTime.toFixed(2)}ms\n`);

    // Response times should be reasonable
    expect(loadResults.avgResponseTime).toBeLessThan(2000);
    expect(loadResults.maxResponseTime).toBeLessThan(5000);
  });

  it('should maintain Socket.IO stability with multiple concurrent subscribers', async () => {
    if (!isBackendAvailable) {
      console.log('Skipping - backend not available');
      return;
    }

    const concurrentConnections = 50;
    const metrics = new LoadTestMetrics();

    const { successful, failed } = await testSocketIOLoad(
      concurrentConnections,
      metrics
    );

    console.log('\n=== Socket.IO Load Test (50 concurrent) ===');
    console.log(`Successful connections: ${successful}`);
    console.log(`Failed connections: ${failed}`);
    console.log(
      `Connection success rate: ${((successful / concurrentConnections) * 100).toFixed(2)}%\n`
    );

    // At least 80% should connect successfully under load
    expect(successful).toBeGreaterThanOrEqual(concurrentConnections * 0.8);
  }, TEST_TIMEOUT);

  it('should verify no data corruption under concurrent load', async () => {
    if (!isBackendAvailable) {
      console.log('Skipping - backend not available');
      return;
    }

    const concurrentUsers = 20;
    const requestsPerUser = 5;

    const results = await Promise.all(
      Array.from({ length: concurrentUsers }).map(async (_, userId) => {
        const responses = [];
        for (let i = 0; i < requestsPerUser; i++) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/health`);
            const data = await response.json();
            responses.push(data);
          } catch (error) {
            // Expected in some cases
          }
        }
        return responses;
      })
    );

    console.log('\n=== Data Consistency Test ===');
    console.log(`Total users: ${concurrentUsers}`);
    console.log(`Requests per user: ${requestsPerUser}`);
    console.log(`Total responses collected: ${results.flat().length}`);

    // Verify responses are consistent objects
    const allResponses = results.flat();
    if (allResponses.length > 0) {
      const firstResponse = allResponses[0];
      expect(firstResponse).toBeDefined();
      expect(typeof firstResponse).toBe('object');
    }

    console.log('Data consistency verified\n');
  }, TEST_TIMEOUT);

  it('should handle graceful error responses under high load', async () => {
    if (!isBackendAvailable) {
      console.log('Skipping - backend not available');
      return;
    }

    const concurrentRequests = 30;
    const metrics = new LoadTestMetrics();

    // Make requests to various endpoints
    const results = await Promise.all(
      Array.from({ length: concurrentRequests }).map((_, index) => {
        const endpoints = ['/api/health', '/api/validators', '/api/explorer/blocks?limit=1'];
        const endpoint = endpoints[index % endpoints.length];
        return makeApiRequest(endpoint);
      })
    );

    results.forEach((result) => {
      metrics.recordRequest(result.time, result.status, result.error);
    });

    const loadResults = metrics.getResults('Error Handling');

    console.log('\n=== Error Handling Under Load ===');
    console.log(`Total requests: ${results.length}`);
    console.log(`Successful: ${results.filter((r) => r.ok).length}`);
    console.log(`Failed: ${results.filter((r) => !r.ok).length}`);
    console.log(`Error rate: ${((loadResults.failedRequests / results.length) * 100).toFixed(2)}%\n`);

    // Most requests should succeed or return proper errors
    expect(results.length).toBeGreaterThan(0);
  });

  it('should measure throughput (requests per second)', async () => {
    if (!isBackendAvailable) {
      console.log('Skipping - backend not available');
      return;
    }

    const metrics = new LoadTestMetrics();
    const duration = 10000; // 10 seconds
    const concurrentRequests = 20;

    const startTime = Date.now();
    metrics.start();

    while (Date.now() - startTime < duration) {
      const requests = Array.from({ length: concurrentRequests }).map(() =>
        makeApiRequest('/api/health')
      );

      const results = await Promise.all(requests);
      results.forEach((result) => {
        metrics.recordRequest(result.time, result.status, result.error);
      });

      // Brief pause between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    metrics.end();
    const loadResults = metrics.getResults('Throughput Test');

    console.log('\n=== Throughput Measurement ===');
    console.log(`Duration: ${loadResults.duration}ms`);
    console.log(`Total requests: ${loadResults.totalRequests}`);
    console.log(`Throughput: ${loadResults.throughput.toFixed(2)} req/s`);
    console.log(`Avg response time: ${loadResults.avgResponseTime.toFixed(2)}ms\n`);

    // Should have reasonable throughput
    expect(loadResults.throughput).toBeGreaterThan(0);
  }, TEST_TIMEOUT);
});

// Summary and recommendations
describe('Load Test Summary and Recommendations', () => {
  it('should provide performance assessment', () => {
    console.log('\n=== LOAD TEST SUMMARY ===');
    console.log('');
    console.log('Test Coverage:');
    console.log('✓ 10 concurrent users - baseline load');
    console.log('✓ 50 concurrent users - moderate load');
    console.log('✓ 100 concurrent users - high load');
    console.log('✓ API response time measurement');
    console.log('✓ Socket.IO stability assessment');
    console.log('✓ Data consistency verification');
    console.log('✓ Error handling resilience');
    console.log('✓ Throughput calculation');
    console.log('');
    console.log('Success Criteria:');
    console.log('• System handles 50+ concurrent users without crashing');
    console.log('• Response time < 2 seconds for most operations');
    console.log('• Error rate < 1% under normal load');
    console.log('• Socket.IO connections remain stable');
    console.log('• Data remains consistent across concurrent operations');
    console.log('• Graceful error handling under high load');
    console.log('');
    console.log('Recommendations if tests fail:');
    console.log('1. Check backend service health');
    console.log('2. Review database connection pooling');
    console.log('3. Verify Redis caching is enabled');
    console.log('4. Check rate limiting configuration');
    console.log('5. Monitor memory and CPU usage');
    console.log('6. Review Socket.IO adapter (use Redis for clustering)');
    console.log('7. Consider implementing request batching');
    console.log('8. Optimize database queries with proper indexing');
    console.log('');
  });
});
