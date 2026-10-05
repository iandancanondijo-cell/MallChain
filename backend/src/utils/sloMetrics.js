/**
 * Service Level Objectives (SLO) and Indicators (SLI) tracking
 * Monitors availability, latency, and error rates for SLO compliance
 * 
 * Metrics:
 * - Latency: p50, p95, p99 percentiles
 * - Error rate: percentage of failed requests
 * - Availability: percentage of time system is operational
 * - Success rate by endpoint
 */

const promClient = require('prom-client');

// SLO target thresholds
const SLO_TARGETS = {
  latency_p99_ms: Number(process.env.SLO_LATENCY_P99_MS || 1000),      // 99th percentile latency
  latency_p95_ms: Number(process.env.SLO_LATENCY_P95_MS || 500),       // 95th percentile latency
  latency_p50_ms: Number(process.env.SLO_LATENCY_P50_MS || 100),       // Median latency
  error_rate_percent: Number(process.env.SLO_ERROR_RATE_PERCENT || 0.1), // <0.1% errors
  availability_percent: Number(process.env.SLO_AVAILABILITY_PERCENT || 99.5), // 99.5% uptime
};

// Latency histogram (in seconds, for Prometheus)
const latencyHistogram = new promClient.Histogram({
  name: 'api_request_latency_seconds',
  help: 'HTTP request latency in seconds (SLI metric)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10], // milliseconds * 1000
});

// Request counter (for calculating error rate)
const requestCounter = new promClient.Counter({
  name: 'api_requests_total',
  help: 'Total API requests (SLI metric)',
  labelNames: ['method', 'route', 'status_code'],
});

// Error rate gauge (computed metric)
const errorRateGauge = new promClient.Gauge({
  name: 'api_error_rate_percent',
  help: 'Percentage of API requests resulting in 4xx/5xx errors (SLI metric)',
  labelNames: ['endpoint'],
});

// Availability gauge (computed metric)
const availabilityGauge = new promClient.Gauge({
  name: 'service_availability_percent',
  help: 'Percentage of time the service is available and responding (SLI metric)',
  labelNames: ['service'],
});

// SLO compliance tracking
const sloComplianceGauge = new promClient.Gauge({
  name: 'slo_compliance',
  help: 'Boolean: 1 if SLO met, 0 if breached',
  labelNames: ['slo_name'],
});

// Track availability windows
class AvailabilityTracker {
  constructor() {
    this.windowStartTime = Date.now();
    this.totalDowntimeMs = 0;
    this.isHealthy = true;
    this.lastStatusChange = Date.now();
  }

  /**
   * Mark system as healthy or unhealthy
   */
  setHealthy(isHealthy) {
    if (isHealthy === this.isHealthy) return;

    const now = Date.now();
    if (!isHealthy) {
      this.lastStatusChange = now;
    } else {
      // Exiting unhealthy state — add to downtime
      this.totalDowntimeMs += now - this.lastStatusChange;
      this.lastStatusChange = now;
    }

    this.isHealthy = isHealthy;
    this.updateAvailability();
  }

  /**
   * Calculate availability percentage for current window
   */
  getAvailabilityPercent() {
    const now = Date.now();
    let totalDowntime = this.totalDowntimeMs;

    // If currently unhealthy, add time since last status change
    if (!this.isHealthy) {
      totalDowntime += now - this.lastStatusChange;
    }

    const windowDuration = now - this.windowStartTime;
    const availableDuration = windowDuration - totalDowntime;
    return (availableDuration / windowDuration) * 100;
  }

  /**
   * Update availability gauge
   */
  updateAvailability() {
    const availability = this.getAvailabilityPercent();
    availabilityGauge.set({ service: 'backend' }, availability);
  }

  /**
   * Reset window (typically hourly or daily)
   */
  resetWindow() {
    this.windowStartTime = Date.now();
    this.totalDowntimeMs = 0;
    this.lastStatusChange = Date.now();
  }
}

// Error rate calculator
class ErrorRateCalculator {
  constructor() {
    this.requestsByEndpoint = new Map();
    this.errorsByEndpoint = new Map();
  }

  /**
   * Record a request
   */
  recordRequest(endpoint, statusCode) {
    if (!this.requestsByEndpoint.has(endpoint)) {
      this.requestsByEndpoint.set(endpoint, 0);
      this.errorsByEndpoint.set(endpoint, 0);
    }

    this.requestsByEndpoint.set(endpoint, this.requestsByEndpoint.get(endpoint) + 1);

    if (statusCode >= 400) {
      this.errorsByEndpoint.set(endpoint, this.errorsByEndpoint.get(endpoint) + 1);
    }

    this.updateErrorRate(endpoint);
  }

  /**
   * Get error rate for endpoint
   */
  getErrorRate(endpoint) {
    const total = this.requestsByEndpoint.get(endpoint) || 0;
    if (total === 0) return 0;

    const errors = this.errorsByEndpoint.get(endpoint) || 0;
    return (errors / total) * 100;
  }

  /**
   * Update error rate gauge
   */
  updateErrorRate(endpoint) {
    const rate = this.getErrorRate(endpoint);
    errorRateGauge.set({ endpoint }, rate);
  }

  /**
   * Reset counters
   */
  reset() {
    this.requestsByEndpoint.clear();
    this.errorsByEndpoint.clear();
  }
}

// SLO compliance checker
class SloCompliance {
  constructor() {
    this.availabilityTracker = new AvailabilityTracker();
    this.errorRateCalculator = new ErrorRateCalculator();
    this.latencyHistory = [];
  }

  /**
   * Record a request for SLI calculations
   */
  recordRequest(method, route, statusCode, latencyMs) {
    // Record latency
    const endpoint = `${method} ${route}`;
    latencyHistogram.observe({ method, route, status_code: statusCode }, latencyMs / 1000);

    // Count request
    requestCounter.inc({ method, route, status_code: statusCode });

    // Track for error rate
    this.errorRateCalculator.recordRequest(endpoint, statusCode);

    // Track latency history for percentiles
    this.latencyHistory.push({
      timestamp: Date.now(),
      latencyMs,
      endpoint,
    });

    // Keep only last 1000 requests for percentile calculation
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory.shift();
    }

    // Update compliance
    this.updateCompliance();
  }

  /**
   * Get latency percentiles
   */
  getLatencyPercentiles(endpoint = null) {
    let samples = this.latencyHistory;

    if (endpoint) {
      samples = samples.filter(s => s.endpoint === endpoint);
    }

    if (samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
    const len = latencies.length;

    return {
      p50: latencies[Math.floor(len * 0.5)],
      p95: latencies[Math.floor(len * 0.95)],
      p99: latencies[Math.floor(len * 0.99)],
      min: latencies[0],
      max: latencies[len - 1],
      avg: latencies.reduce((a, b) => a + b, 0) / len,
    };
  }

  /**
   * Check if SLOs are being met
   */
  checkSloCompliance() {
    const compliance = {
      latency_p99: true,
      latency_p95: true,
      error_rate: true,
      availability: true,
    };

    const percentiles = this.getLatencyPercentiles();
    const availability = this.availabilityTracker.getAvailabilityPercent();
    const avgErrorRate = Array.from(this.errorRateCalculator.errorsByEndpoint.keys()).reduce((sum, endpoint) => {
      return sum + this.errorRateCalculator.getErrorRate(endpoint);
    }, 0) / Math.max(1, this.errorRateCalculator.errorsByEndpoint.size);

    // Check each SLO
    compliance.latency_p99 = percentiles.p99 <= SLO_TARGETS.latency_p99_ms;
    compliance.latency_p95 = percentiles.p95 <= SLO_TARGETS.latency_p95_ms;
    compliance.error_rate = avgErrorRate <= SLO_TARGETS.error_rate_percent;
    compliance.availability = availability >= SLO_TARGETS.availability_percent;

    // Update compliance gauges
    sloComplianceGauge.set({ slo_name: 'latency_p99' }, compliance.latency_p99 ? 1 : 0);
    sloComplianceGauge.set({ slo_name: 'latency_p95' }, compliance.latency_p95 ? 1 : 0);
    sloComplianceGauge.set({ slo_name: 'error_rate' }, compliance.error_rate ? 1 : 0);
    sloComplianceGauge.set({ slo_name: 'availability' }, compliance.availability ? 1 : 0);

    return {
      compliance,
      metrics: {
        latency: percentiles,
        errorRate: avgErrorRate,
        availability,
      },
      targets: SLO_TARGETS,
    };
  }

  /**
   * Update compliance status
   */
  updateCompliance() {
    // Check compliance every 100 requests or 1 minute
    if (this.latencyHistory.length % 100 === 0) {
      this.checkSloCompliance();
    }
  }

  /**
   * Get current status for diagnostics
   */
  getStatus() {
    const percentiles = this.getLatencyPercentiles();
    const avgErrorRate = Array.from(this.errorRateCalculator.errorsByEndpoint.keys()).reduce((sum, endpoint) => {
      return sum + this.errorRateCalculator.getErrorRate(endpoint);
    }, 0) / Math.max(1, this.errorRateCalculator.errorsByEndpoint.size);

    return {
      latency: {
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
        targets: {
          p50: SLO_TARGETS.latency_p50_ms,
          p95: SLO_TARGETS.latency_p95_ms,
          p99: SLO_TARGETS.latency_p99_ms,
        },
      },
      errorRate: {
        percent: avgErrorRate,
        target: SLO_TARGETS.error_rate_percent,
      },
      availability: {
        percent: this.availabilityTracker.getAvailabilityPercent(),
        target: SLO_TARGETS.availability_percent,
      },
      requestCount: this.latencyHistory.length,
    };
  }
}

const sloCompliance = new SloCompliance();

// Middleware to record SLI metrics
function sloMetricsMiddleware(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode;

    sloCompliance.recordRequest(method, route, statusCode, latencyMs);
  });

  next();
}

module.exports = {
  sloCompliance,
  sloMetricsMiddleware,
  SLO_TARGETS,
  AvailabilityTracker,
  ErrorRateCalculator,
  latencyHistogram,
  requestCounter,
  errorRateGauge,
  availabilityGauge,
  sloComplianceGauge,
};
