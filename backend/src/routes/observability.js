const express = require('express');
const { computeSloStatus, SLO_LATENCY_P99_MS, SLO_AVAILABILITY_PCT, SLO_ERROR_RATE_PCT } = require('../middleware/sloTracker');
const { getSlowQueryStats, SLOW_QUERY_THRESHOLD_MS } = require('../middleware/mongoProfiler');
const { register } = require('../utils/metrics');

const router = express.Router();

router.get('/slo', async (_req, res) => {
  const slo = computeSloStatus();
  const slowQueries = getSlowQueryStats();

  const overallStatus =
    slo.availability.status === 'critical' || slo.errorRate.status === 'critical' || slo.latency.status === 'critical'
      ? 'critical'
      : slo.availability.status === 'warning' || slo.errorRate.status === 'warning' || slo.latency.status === 'warning'
        ? 'warning'
        : 'healthy';

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    slos: {
      availability: {
        ...slo.availability,
        description: 'Percentage of non-5xx responses',
      },
      errorRate: {
        ...slo.errorRate,
        description: 'Percentage of 5xx responses',
      },
      latency: {
        ...slo.latency,
        description: 'p99 request duration in milliseconds',
      },
    },
    errorBudget: slo.errorBudget,
    window: {
      requests: slo.windowRequests,
      durationMs: slo.windowMs,
    },
    database: {
      slowQueryThresholdMs: SLOW_QUERY_THRESHOLD_MS,
      slowQueries: slowQueries.slow,
      totalQueries: slowQueries.total,
    },
    targets: {
      latencyP99Ms: SLO_LATENCY_P99_MS,
      availabilityPct: SLO_AVAILABILITY_PCT,
      errorRatePct: SLO_ERROR_RATE_PCT,
    },
  });
});

router.get('/slo/targets', (_req, res) => {
  res.json({
    latency: { p99Ms: SLO_LATENCY_P99_MS, description: '99th percentile request latency' },
    availability: { pct: SLO_AVAILABILITY_PCT, description: 'Minimum uptime (non-5xx)' },
    errorRate: { pct: SLO_ERROR_RATE_PCT, description: 'Maximum 5xx error rate' },
    slowQuery: { thresholdMs: SLOW_QUERY_THRESHOLD_MS, description: 'MongoDB query threshold for slow-query logging' },
  });
});

router.get('/realtime', (_req, res) => {
  const { getSseStats } = require('../routes/sse');
  const sseStats = getSseStats();
  const ioConnections = global.io ? global.io.engine.clientsCount : 0;

  res.json({
    sse: sseStats,
    websocket: {
      activeConnections: ioConnections,
      maxConnections: Number(process.env.MAX_IO_CONNECTIONS || 5000),
    },
  });
});

module.exports = router;
