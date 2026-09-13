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

// CSP violation reports submitted by browsers via POST /csp-report — one
// increment per distinct (blocked_uri, violated_directive, document_uri)
// tuple in a 1-minute window, deduplicated by Map key below. Feeds the
// mallchain-prod dashboard panel "CSP/HSTS Violations per blocked-uri" and
// lets us distinguish real breakage from a single noisy extension.
const cspViolationsTotal = new promClient.Counter({
  name: 'csp_violations_total',
  help: 'Total number of CSP/HSTS violation reports received via /csp-report, deduped per minute',
  labelNames: ['blocked_uri', 'violated_directive', 'document_uri'],
  registers: [register],
});

// Operator/treasury `stake` (gas denom) balances — see jobs/operatorStakeWatcher.js.
// A gauge, not a counter: balances go up (top-ups) and down (every
// operator-signed tx), and what matters for alerting is the current level,
// not a cumulative total.
const operatorStakeBalance = new promClient.Gauge({
  name: 'operator_stake_balance',
  help: 'Current stake (gas denom) balance of the operator/treasury wallets, in base units',
  labelNames: ['wallet'],
  registers: [register],
});

// Every auto-top-up attempt's outcome — 'success' is the boring case;
// everything else (treasury_insufficient, broadcast_failed, ...) is a
// reason a human needs to look, which OperatorStakeTopUpFailed alerts on.
const operatorStakeTopUpTotal = new promClient.Counter({
  name: 'operator_stake_topup_total',
  help: 'Total operator stake auto-top-up attempts by outcome',
  labelNames: ['status'],
  registers: [register],
});

// Treasury staking-rewards sweeping — see jobs/treasuryRewardsSweeper.js.
// This is the chain's actual ongoing source of new stake (x/mint inflation,
// paid out via x/distribution to delegators): treasuryRewardsClaimedTotal
// tracks how much stake the treasury has pulled in this way over time, a
// very different (self-sustaining) story from operatorStakeTopUpTotal's
// "someone sent it money" transfers.
const treasuryRewardsClaimedTotal = new promClient.Counter({
  name: 'treasury_rewards_claimed_total',
  help: 'Total stake claimed by the treasury from staking rewards (x/mint inflation via x/distribution)',
  registers: [register],
});

const treasuryDelegatedStake = new promClient.Gauge({
  name: 'treasury_delegated_stake',
  help: 'Stake currently bonded (delegated) by the treasury wallet — not spendable until unbonded, but earning rewards',
  registers: [register],
});

const cspDedupeWindowMs = 60_000;
const cspSeen = new Map();

function recordCspViolation({ blockedUri, violatedDirective, documentUri }) {
  const blocked = blockedUri || 'unknown';
  const directive = violatedDirective || 'unknown';
  const doc = (documentUri || 'unknown').substring(0, 120);
  const key = `${blocked}\x00${directive}\x00${doc}`;
  const now = Date.now();
  const lastSeen = cspSeen.get(key) || 0;
  if (now - lastSeen >= cspDedupeWindowMs) {
    cspSeen.set(key, now);
    cspViolationsTotal.inc({ blocked_uri: blocked, violated_directive: directive, document_uri: doc });
  }
  if (cspSeen.size > 2000) {
    cspSeen.clear();
  }
}

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
  cspViolationsTotal,
  recordCspViolation,
  operatorStakeBalance,
  operatorStakeTopUpTotal,
  treasuryRewardsClaimedTotal,
  treasuryDelegatedStake,
};
