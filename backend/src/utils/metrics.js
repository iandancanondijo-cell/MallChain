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
};
