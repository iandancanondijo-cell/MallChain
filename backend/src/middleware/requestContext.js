const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const als = new AsyncLocalStorage();

function RequestContextMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const startTime = process.hrtime.bigint();

  req.correlationId = correlationId;
  req.id = requestId;

  const ctx = {
    correlationId,
    requestId,
    startTime,
    userId: null,
    method: req.method,
    path: req.path,
  };

  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);

  als.run(ctx, next);
}

function getContext() {
  return als.getStore();
}

function getCorrelationId() {
  const ctx = als.getStore();
  return ctx?.correlationId || 'none';
}

function getTraceIds() {
  const ctx = als.getStore();
  if (!ctx) return { correlationId: 'none', requestId: 'none' };
  return { correlationId: ctx.correlationId, requestId: ctx.requestId };
}

function setContextUser(userId) {
  const ctx = als.getStore();
  if (ctx) ctx.userId = userId;
}

function getRequestDurationMs() {
  const ctx = als.getStore();
  if (!ctx) return 0;
  return Number(process.hrtime.bigint() - ctx.startTime) / 1e6;
}

function runInContext(ctx, fn) {
  return als.run(ctx, fn);
}

module.exports = {
  RequestContextMiddleware,
  getContext,
  getCorrelationId,
  getTraceIds,
  setContextUser,
  getRequestDurationMs,
  runInContext,
};
