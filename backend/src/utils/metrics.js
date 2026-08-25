const promClient = require('prom-client');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// HTTP request duration histogram
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// HTTP request counter
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Blockchain operations counter
const blockchainOperationsTotal = new promClient.Counter({
  name: 'blockchain_operations_total',
  help: 'Total number of blockchain operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Balance adjustments counter
const balanceAdjustmentsTotal = new promClient.Counter({
  name: 'balance_adjustments_total',
  help: 'Total number of balance adjustments',
  labelNames: ['type', 'currency'],
  registers: [register],
});

// Transactions processed counter
const transactionsProcessedTotal = new promClient.Counter({
  name: 'transactions_processed_total',
  help: 'Total number of transactions processed',
  labelNames: ['status'],
  registers: [register],
});

// Payment failures counter
const paymentFailuresTotal = new promClient.Counter({
  name: 'payment_failures_total',
  help: 'Total number of payment failures',
  labelNames: ['reason'],
  registers: [register],
});

// Backend error rate — every response the global error handler formats,
// labeled by the structured AppError code and HTTP status. Feeds alerting
// on error-rate spikes.
const backendErrorsTotal = new promClient.Counter({
  name: 'backend_errors_total',
  help: 'Total number of errors handled by the global error handler',
  labelNames: ['code', 'status_code'],
  registers: [register],
});

// Socket.IO error counter — socket errors used to only reach a console log,
// invisible to the same alerting/dashboards every other error path feeds.
const socketErrorsTotal = new promClient.Counter({
  name: 'socket_errors_total',
  help: 'Total number of Socket.IO connection errors',
  registers: [register],
});

// Socket.IO room-subscription rejections — counts attempts blocked by the
// per-socket room cap (see index.js's joinRoomWithCap), a signal for
// runaway/abusive subscription behavior worth alerting on separately from
// ordinary auth/validation rejections.
const socketRoomCapRejectionsTotal = new promClient.Counter({
  name: 'socket_room_cap_rejections_total',
  help: 'Total number of room-subscription attempts rejected by the per-socket room cap',
  registers: [register],
});

// Liquidity pool activity lifecycle — one increment per stage transition
// recorded in LiquidityPoolActivity (buy/withdraw/reconciliation/mallpoints
// flows), so buy success rate / payout latency / conversion failures are
// visible on dashboards instead of only queryable from Mongo after the fact.
const liquidityActivityTotal = new promClient.Counter({
  name: 'liquidity_activity_total',
  help: 'Total number of LiquidityPoolActivity records by flow/stage/status',
  labelNames: ['flow', 'stage', 'status'],
  registers: [register],
});

// Middleware to track HTTP requests
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route?.path || req.path;
    
    httpRequestDurationMicroseconds.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  
  next();
}

module.exports = {
  register,
  metricsMiddleware,
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  blockchainOperationsTotal,
  balanceAdjustmentsTotal,
  transactionsProcessedTotal,
  paymentFailuresTotal,
  backendErrorsTotal,
  socketErrorsTotal,
  socketRoomCapRejectionsTotal,
  liquidityActivityTotal,
};
