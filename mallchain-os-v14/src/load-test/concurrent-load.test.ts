/**
 * Concurrency smoke test — OPT-IN, because it talks to a real backend.
 *
 * What this file can honestly prove: when 10 / 50 / 100 request streams hit a
 * running API at the same time, the server keeps answering, keeps latency in
 * range, and produces no *unforced* errors (no 5xx, no dropped connections).
 * It also checks that 50 Socket.IO clients can connect and stay connected
 * while that happens.
 *
 * What it cannot prove, and used to claim: capacity. "100 concurrent users"
 * here is 100 promises in one V8 isolate on one machine, all sharing a single
 * anonymous identity and a single source IP. Real capacity work lives in
 * `load-tests/k6-api-load-test.js`, which CI runs weekly against staging
 * (.github/workflows/load-test.yml) with thresholds and many virtual users on
 * a separate box.
 *
 * Two defects this rewrite removes, both of which made the old result
 * unreadable rather than merely noisy:
 *
 * 1. `getResults` filtered on `m.status` while `RequestMetrics` names the
 *    field `m.statusCode`. The 429 exclusion therefore never excluded
 *    anything: rate-limited requests were counted as unforced failures, which
 *    is where the "100 concurrent users: errorRate 19.6%" (and 31.4%) came
 *    from. Verified live — with a fresh limiter budget the same stage records
 *    0 unforced errors and 84 throttled ones.
 * 2. `beforeAll` treated a 429 as "backend not available" and every test then
 *    `return`ed early, so the file reported nine *passing* tests while
 *    sending zero requests. Confirmed directly: `npx vitest run
 *    src/load-test/concurrent-load.test.ts` against a throttled backend
 *    finished in 30ms with 9/9 green.
 *
 * Now: without LOAD_TEST_API_URL the suite is reported *skipped* (not passed),
 * and with it the run refuses to start unless the target's own headers say
 * there is budget for the whole plan, and refuses to *pass* if any request is
 * throttled mid-run.
 *
 * Running it locally:
 *   RATE_LIMIT_ANON_MAX=1500 node src/index.js          # from backend/
 *   LOAD_TEST_API_URL=http://localhost:4000 npx vitest run src/load-test
 *
 * RATE_LIMIT_ANON_MAX only relaxes the limiter for that dev process. It is not
 * a production setting, and nothing here changes the shipped default of 300.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = (process.env.LOAD_TEST_API_URL || '').replace(/\/$/, '');
const SOCKET_URL = API_BASE_URL;
const TEST_TIMEOUT = 120000; // 2 minutes for load tests

/** Enabled only when a target was named; otherwise the suite reports skipped. */
const enabled = Boolean(API_BASE_URL);
const suite = enabled ? describe : describe.skip;

if (!enabled) {
  console.log(
    '\n[load] Skipped: set LOAD_TEST_API_URL (e.g. http://localhost:4000) to run the concurrency smoke test against a live backend.\n'
  );
}

interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  thinkTimeMs: number; // Realistic delay between operations
}

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
  /** Requests answered with 429 — a misconfigured run, see expectStage. */
  throttledRequests: number;
  /** Non-429 failures grouped by signature, so the log says *why*. */
  failureSignatures: Record<string, number>;
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

  recordRequest(responseTime: number, statusCode?: number, error?: string) {
    this.metrics.push({ responseTime, statusCode, error, timestamp: Date.now() });
  }

  getResults(scenario: string): LoadTestResults {
    const duration = this.endTime - this.startTime;
    // `statusCode`, not `status` — see the header note. A 429 is the limiter
    // answering on purpose, so it is counted and reported on its own row
    // instead of being folded into the error rate.
    const throttledRequests = this.metrics.filter((m) => m.statusCode === 429).length;
    const failedRequests = this.metrics.filter((m) => m.error && m.statusCode !== 429).length;
    const successfulRequests = this.metrics.filter((m) => !m.error).length;
    const totalRequests = this.metrics.length;

    const failureSignatures: Record<string, number> = {};
    for (const m of this.metrics) {
      if (m.error && m.statusCode !== 429) {
        const key = m.statusCode ? `HTTP ${m.statusCode}` : m.error;
        failureSignatures[key] = (failureSignatures[key] || 0) + 1;
      }
    }

    const responseTimes = this.metrics.map((m) => m.responseTime).sort((a, b) => a - b);

    return {
      scenario,
      totalRequests,
      successfulRequests,
      failedRequests,
      throttledRequests,
      failureSignatures,
      errorRate: totalRequests ? (failedRequests / totalRequests) * 100 : 0,
      avgResponseTime: this.calculateAverage(responseTimes),
      p95ResponseTime: this.calculatePercentile(responseTimes, 95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 99),
      minResponseTime: responseTimes.length ? Math.min(...responseTimes) : 0,
      maxResponseTime: responseTimes.length ? Math.max(...responseTimes) : 0,
      throughput: duration ? totalRequests / (duration / 1000) : 0,
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

/**
 * Every stage's request count in one place, so the limiter precondition can be
 * checked against the whole run instead of being discovered half-way through.
 * Keep these in sync with the stages below: `plannedRequests` is what the
 * target is asked to have budget for before anything is sent.
 */
const PLAN = {
  users10: { concurrentUsers: 10, requestsPerUser: 5, thinkTimeMs: 500 },
  users50: { concurrentUsers: 50, requestsPerUser: 8, thinkTimeMs: 1000 },
  users100: { concurrentUsers: 100, requestsPerUser: 5, thinkTimeMs: 2000 },
  responseTimes: 50,
  dataConsistency: { concurrentUsers: 20, requestsPerUser: 5 },
  errorHandling: 30,
  throughput: { batches: 10, perBatch: 10 },
};

const plannedRequests =
  PLAN.users10.concurrentUsers * PLAN.users10.requestsPerUser +
  PLAN.users50.concurrentUsers * PLAN.users50.requestsPerUser +
  PLAN.users100.concurrentUsers * PLAN.users100.requestsPerUser +
  PLAN.responseTimes +
  PLAN.dataConsistency.concurrentUsers * PLAN.dataConsistency.requestsPerUser +
  PLAN.errorHandling +
  PLAN.throughput.batches * PLAN.throughput.perBatch;

async function makeApiRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<{ time: number; status?: number; ok: boolean; error?: string }> {
  const startTime = Date.now();

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const time = Date.now() - startTime;

    if (!response.ok) {
      return { time, status: response.status, ok: false, error: `HTTP ${response.status}` };
    }

    await response.json(); // Consume body
    return { time, status: response.status, ok: true };
  } catch (error) {
    const time = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    return { time, ok: false, error: message || 'Network error' };
  }
}

async function simulateUserSession(
  config: LoadTestConfig,
  metrics: LoadTestMetrics
): Promise<void> {
  for (let i = 0; i < config.requestsPerUser; i++) {
    // Think time between operations, so a stage is a stream of requests rather
    // than one burst.
    if (i > 0 && config.thinkTimeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * config.thinkTimeMs));
    }

    const operationType = i % 3;
    const result =
      operationType === 0
        ? await makeApiRequest('/api/health')
        : operationType === 1
          ? await makeApiRequest('/api/explorer/blocks?limit=10')
          : await makeApiRequest('/api/validators/list');

    metrics.recordRequest(result.time, result.status, result.error);
  }
}

function reportStage(results: LoadTestResults) {
  console.log(`\n=== ${results.scenario} ===`);
  console.log(`Total Requests: ${results.totalRequests}`);
  console.log(`Successful: ${results.successfulRequests}`);
  console.log(
    `Failed (unforced): ${results.failedRequests}` +
      (Object.keys(results.failureSignatures).length
        ? ` — ${JSON.stringify(results.failureSignatures)}`
        : '')
  );
  console.log(`Throttled (429): ${results.throttledRequests}`);
  console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
  console.log(`Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
  console.log(`P95 Response Time: ${results.p95ResponseTime.toFixed(2)}ms`);
  console.log(`P99 Response Time: ${results.p99ResponseTime.toFixed(2)}ms`);
  console.log(`Throughput: ${results.throughput.toFixed(2)} req/s`);
  console.log(`Duration: ${results.duration}ms\n`);
}

/**
 * Assertions shared by the stages.
 *
 * A throttled run is rejected rather than excused. Keeping 429s out of the
 * error rate is right for a *report* — the limiter doing its job is not an
 * outage — but wrong as a *pass condition*: it let a run in which the server
 * answered nothing but 429 score a perfect 0% error rate. If any request is
 * throttled then the budget precondition was wrong, the run measured the
 * limiter instead of the server, and it has to be re-run.
 */
function expectStage(results: LoadTestResults, maxErrorRate: number, maxAvgMs: number) {
  if (results.throttledRequests > 0) {
    throw new Error(
      `${results.scenario}: ${results.throttledRequests}/${results.totalRequests} requests were ` +
        `throttled with 429, so this run measured the rate limiter rather than the server. ` +
        `Restart the target with RATE_LIMIT_ANON_MAX above ${plannedRequests} (this run plans ` +
        `${plannedRequests} requests) and re-run.`
    );
  }
  expect(results.totalRequests).toBeGreaterThan(0);
  expect(results.errorRate).toBeLessThanOrEqual(maxErrorRate);
  expect(results.avgResponseTime).toBeLessThan(maxAvgMs);
  expect(results.successfulRequests).toBeGreaterThan(0);
}

async function testSocketIOLoad(
  concurrentUsers: number
): Promise<{ connected: number; failed: number }> {
  const sockets: Socket[] = [];
  let connected = 0;
  let failed = 0;

  const connectionPromises = Array.from({ length: concurrentUsers }).map(
    () =>
      new Promise<void>((resolve) => {
        const socket = io(SOCKET_URL, { reconnection: false, transports: ['websocket'] });

        const connectionTimeout = setTimeout(() => {
          failed++;
          socket.disconnect();
          resolve();
        }, 10000);

        socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          connected++;
          sockets.push(socket);

          socket.emit('subscribe:blocks');
          socket.emit('subscribe:market');
          socket.on('block:new', () => {
            /* event received — stability is measured by the window below */
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

  // Hold the connections open, then count the ones that were dropped: a client
  // that connected and then fell over is exactly the instability this checks.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const stillConnected = sockets.filter((s) => s.connected).length;
  failed += sockets.length - stillConnected;
  sockets.forEach((s) => s.disconnect());

  return { connected, failed };
}

suite('Concurrency smoke test: anonymous request streams', () => {
  beforeAll(async () => {
    // A 429 here still means the server is up and answering. Treating it as
    // "backend not available" is what let the whole file skip silently and
    // report nine passing tests that had sent no requests at all.
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/health`);
    } catch (error) {
      throw new Error(
        `LOAD_TEST_API_URL=${API_BASE_URL} is not reachable (${
          error instanceof Error ? error.message : String(error)
        }). Start the backend, or unset LOAD_TEST_API_URL to skip this file.`
      );
    }
    if (response.status >= 500) {
      throw new Error(`Backend answered ${response.status} before the run even started`);
    }

    // Ask the target what budget it actually has, from its own headers, rather
    // than assuming the shipped 300: RATE_LIMIT_ANON_MAX is configurable, and
    // an authenticated target is bucketed per account instead of per IP.
    const limit = Number(response.headers.get('RateLimit-Limit') || 0);
    const remaining = Number(response.headers.get('RateLimit-Remaining') || 0);
    const reset = response.headers.get('RateLimit-Reset');
    if (remaining < plannedRequests) {
      throw new Error(
        `Not enough rate-limit budget for this run: the target allows ${limit} requests per ` +
          `window and ${remaining} remain, but the plan needs ${plannedRequests}. Restart it ` +
          `with RATE_LIMIT_ANON_MAX above ${plannedRequests} (dev process only — the shipped ` +
          `default stays 300)${reset ? `, or wait for the window to reset in ${reset}s` : ''}.`
      );
    }
  }, TEST_TIMEOUT);

  it(
    'handles 10 concurrent request streams',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      await Promise.allSettled(
        Array.from({ length: PLAN.users10.concurrentUsers }, () =>
          simulateUserSession(PLAN.users10, metrics)
        )
      );
      metrics.end();

      const results = metrics.getResults('10 Concurrent Users');
      reportStage(results);
      expectStage(results, 5, 2000);
    },
    TEST_TIMEOUT
  );

  it(
    'handles 50 concurrent request streams',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      await Promise.allSettled(
        Array.from({ length: PLAN.users50.concurrentUsers }, () =>
          simulateUserSession(PLAN.users50, metrics)
        )
      );
      metrics.end();

      const results = metrics.getResults('50 Concurrent Users');
      reportStage(results);
      expectStage(results, 3, 2000);
    },
    TEST_TIMEOUT
  );

  it(
    'handles 100 concurrent request streams',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      await Promise.allSettled(
        Array.from({ length: PLAN.users100.concurrentUsers }, () =>
          simulateUserSession(PLAN.users100, metrics)
        )
      );
      metrics.end();

      const results = metrics.getResults('100 Concurrent Users');
      reportStage(results);
      expectStage(results, 10, 2000);
    },
    TEST_TIMEOUT
  );

  it(
    'keeps response times in range for 50 simultaneous requests',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      const results = await Promise.all(
        Array.from({ length: PLAN.responseTimes }, () => makeApiRequest('/api/health'))
      );
      results.forEach((r) => metrics.recordRequest(r.time, r.status, r.error));
      metrics.end();

      const loadResults = metrics.getResults('API Response Times (50 simultaneous)');
      reportStage(loadResults);
      expectStage(loadResults, 0, 2000);
      expect(loadResults.maxResponseTime).toBeLessThan(5000);
    },
    TEST_TIMEOUT
  );

  it(
    'keeps 50 Socket.IO subscribers connected',
    async () => {
      const concurrentConnections = 50;
      const { connected, failed } = await testSocketIOLoad(concurrentConnections);
      const stable = connected - failed;

      console.log('\n=== Socket.IO stability (50 concurrent) ===');
      console.log(`Connected: ${connected}`);
      console.log(`Failed or dropped within the 5s window: ${failed}`);
      console.log(`Still connected: ${stable}/${concurrentConnections}\n`);

      expect(stable).toBeGreaterThanOrEqual(concurrentConnections * 0.8);
    },
    TEST_TIMEOUT
  );

  it(
    'returns consistent payloads across 20 concurrent readers',
    async () => {
      const responses = (
        await Promise.all(
          Array.from({ length: PLAN.dataConsistency.concurrentUsers }, async () => {
            const out: unknown[] = [];
            for (let i = 0; i < PLAN.dataConsistency.requestsPerUser; i++) {
              const response = await fetch(`${API_BASE_URL}/api/health`);
              if (response.ok) out.push(await response.json());
            }
            return out;
          })
        )
      ).flat();

      const expected =
        PLAN.dataConsistency.concurrentUsers * PLAN.dataConsistency.requestsPerUser;
      console.log(`\n=== Data consistency ===\nResponses collected: ${responses.length}/${expected}\n`);

      // Every request has to have succeeded: a throttled or dropped reader
      // means the run was misconfigured, it is not a partial result to average
      // over. The old version swallowed those failures in a `catch` whose only
      // comment was "Expected in some cases".
      expect(responses.length).toBe(expected);
      expect(typeof responses[0]).toBe('object');
    },
    TEST_TIMEOUT
  );

  it(
    'answers malformed traffic without a server error',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      const results = await Promise.all(
        Array.from({ length: PLAN.errorHandling }, (_, index) => {
          // Three shapes a confused or hostile client really sends, all of them
          // valid fetch usage. (Sending a body on a GET is not: fetch throws
          // client-side before anything reaches the network, which is what this
          // stage used to do to 22 of its 30 requests and then score as server
          // errors.)
          const shape = index % 3;
          if (shape === 0) {
            // A method the read-only routes do not implement.
            return makeApiRequest('/api/health', 'POST', { injected: 'payload' });
          }
          if (shape === 1) {
            // A query parameter that cannot be parsed.
            return makeApiRequest('/api/explorer/blocks?limit=not-a-number');
          }
          // A path that does not exist.
          return makeApiRequest(`/api/definitely-not-a-route-${index}`);
        })
      );
      results.forEach((r) => metrics.recordRequest(r.time, r.status, r.error));
      metrics.end();

      const loadResults = metrics.getResults('Error handling under load');
      reportStage(loadResults);

      // A 4xx against a method the route does not implement is the expected
      // answer. What must never appear is a 5xx or a connection failure —
      // those are the server's fault, not the client's.
      const serverSideFailures = Object.keys(loadResults.failureSignatures).filter(
        (key) => !/^HTTP 4\d\d$/.test(key)
      );
      expect(serverSideFailures).toEqual([]);
    },
    TEST_TIMEOUT
  );

  it(
    'measures throughput over a fixed 100 requests',
    async () => {
      const metrics = new LoadTestMetrics();
      metrics.start();
      for (let batch = 0; batch < PLAN.throughput.batches; batch++) {
        const results = await Promise.all(
          Array.from({ length: PLAN.throughput.perBatch }, () => makeApiRequest('/api/health'))
        );
        results.forEach((r) => metrics.recordRequest(r.time, r.status, r.error));
      }
      metrics.end();

      const loadResults = metrics.getResults('Throughput (100 requests)');
      reportStage(loadResults);
      expectStage(loadResults, 0, 2000);
      expect(loadResults.throughput).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );

  afterAll(() => {
    console.log(
      '\n[load] Concurrency smoke run finished — the stage blocks above carry the measured numbers.\n'
    );
  });
});
