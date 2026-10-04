const promClient = require('prom-client');
const { register } = require('../utils/metrics');

const SLO_LATENCY_P99_MS = 500;
const SLO_AVAILABILITY_PCT = 99.9;
const SLO_ERROR_RATE_PCT = 1.0;

const sloLatencyBudget = new promClient.Histogram({
  name: 'slo_latency_budget',
  help: 'Request latency distribution relative to SLO budget (500ms p99)',
  labelNames: ['route'],
  buckets: [10, 25, 50, 100, 200, 300, 500, 1000, 2000, 5000],
  registers: [register],
});

const sloAvailabilityTotal = new promClient.Counter({
  name: 'slo_availability_total',
  help: 'Total requests counted for availability SLO',
  labelNames: ['status'],
  registers: [register],
});

const sloErrorBudgetConsumed = new promClient.Gauge({
  name: 'slo_error_budget_consumed',
  help: 'Fraction of error budget consumed (1.0 = budget exhausted)',
  registers: [register],
});

const sloLatencyViolations = new promClient.Counter({
  name: 'slo_latency_violations_total',
  help: 'Requests exceeding the latency SLO threshold',
  labelNames: ['route'],
  registers: [register],
});

const sloWindow = {
  windowMs: 30 * 60 * 1000,
  requests: [],
  errors: 0,
  total: 0,
  latencyViolations: 0,
};

function recordSloEvent({ route, statusCode, durationMs }) {
  sloWindow.total += 1;

  const is5xx = statusCode >= 500;
  sloAvailabilityTotal.inc({ status: is5xx ? 'error' : 'ok' });

  sloLatencyBudget.observe({ route: route || 'unknown' }, durationMs);

  if (durationMs > SLO_LATENCY_P99_MS) {
    sloWindow.latencyViolations += 1;
    sloLatencyViolations.inc({ route: route || 'unknown' });
  }

  if (is5xx) {
    sloWindow.errors += 1;
  }

  sloWindow.requests.push({ ts: Date.now(), statusCode, durationMs });

  const cutoff = Date.now() - sloWindow.windowMs;
  while (sloWindow.requests.length > 0 && sloWindow.requests[0].ts < cutoff) {
    sloWindow.requests.shift();
  }
}

function computeSloStatus() {
  const now = Date.now();
  const cutoff = now - sloWindow.windowMs;
  const recent = sloWindow.requests.filter(r => r.ts >= cutoff);

  if (recent.length === 0) {
    return {
      availability: { current: 100, target: SLO_AVAILABILITY_PCT, status: 'healthy' },
      errorRate: { current: 0, target: SLO_ERROR_RATE_PCT, status: 'healthy' },
      latency: { p99Ms: 0, target: SLO_LATENCY_P99_MS, status: 'healthy' },
      windowRequests: 0,
    };
  }

  const total = recent.length;
  const errors = recent.filter(r => r.statusCode >= 500).length;
  const latencyViolations = recent.filter(r => r.durationMs > SLO_LATENCY_P99_MS).length;

  const availability = ((total - errors) / total) * 100;
  const errorRate = (errors / total) * 100;

  const durations = recent.map(r => r.durationMs).sort((a, b) => a - b);
  const p99Index = Math.ceil(durations.length * 0.99) - 1;
  const p99 = durations[Math.max(0, p99Index)];

  const errorBudgetUsed = errorRate / SLO_ERROR_RATE_PCT;
  sloErrorBudgetConsumed.set(Math.min(errorBudgetUsed, 10));

  const availabilityStatus = availability >= SLO_AVAILABILITY_PCT ? 'healthy' : availability >= (SLO_AVAILABILITY_PCT - 0.1) ? 'warning' : 'critical';
  const errorRateStatus = errorRate <= SLO_ERROR_RATE_PCT ? 'healthy' : errorRate <= (SLO_ERROR_RATE_PCT * 2) ? 'warning' : 'critical';
  const latencyStatus = p99 <= SLO_LATENCY_P99_MS ? 'healthy' : p99 <= (SLO_LATENCY_P99_MS * 2) ? 'warning' : 'critical';

  return {
    availability: { current: Math.round(availability * 1000) / 1000, target: SLO_AVAILABILITY_PCT, status: availabilityStatus },
    errorRate: { current: Math.round(errorRate * 1000) / 1000, target: SLO_ERROR_RATE_PCT, status: errorRateStatus },
    latency: { p99Ms: Math.round(p99), target: SLO_LATENCY_P99_MS, status: latencyStatus },
    errorBudget: { consumed: Math.round(errorBudgetUsed * 1000) / 1000, remaining: Math.max(0, Math.round((1 - errorBudgetUsed) * 1000) / 1000) },
    windowRequests: total,
    windowMs: sloWindow.windowMs,
  };
}

function sloMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const route = req.route?.path || req.path;
    recordSloEvent({ route, statusCode: res.statusCode, durationMs });
  });

  next();
}

module.exports = {
  sloMiddleware,
  computeSloStatus,
  recordSloEvent,
  SLO_LATENCY_P99_MS,
  SLO_AVAILABILITY_PCT,
  SLO_ERROR_RATE_PCT,
};
