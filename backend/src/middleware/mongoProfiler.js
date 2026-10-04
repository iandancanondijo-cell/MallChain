const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { getTraceIds } = require('./requestContext');

const SLOW_QUERY_THRESHOLD_MS = Number(process.env.MONGO_SLOW_QUERY_MS || 200);

let slowQueryCount = 0;
let totalQueryCount = 0;

function getSlowQueryStats() {
  return { slow: slowQueryCount, total: totalQueryCount };
}

function resetSlowQueryStats() {
  slowQueryCount = 0;
  totalQueryCount = 0;
}

function installMongoProfiler() {
  if (installMongoProfiler._installed) return;
  installMongoProfiler._installed = true;

  mongoose.connection.on('open', () => {
    const db = mongoose.connection.db;
    if (!db) return;

    try {
      db.admin().command({ profile: 1, slowms: SLOW_QUERY_THRESHOLD_MS }).catch(() => {});
    } catch {
      // profiling not available (e.g. DocumentDB without admin access)
    }
  });

  const originalExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function (...args) {
    const start = Date.now();
    totalQueryCount += 1;

    try {
      const result = await originalExec.apply(this, args);
      const duration = Date.now() - start;

      if (duration >= SLOW_QUERY_THRESHOLD_MS) {
        slowQueryCount += 1;
        const { correlationId, requestId } = getTraceIds();
        const queryModel = this.model?.modelName || 'unknown';
        const queryOp = this.op || 'unknown';

        logger.warn('mongo-slow-query', 'Slow MongoDB query detected', {
          correlationId,
          requestId,
          model: queryModel,
          operation: queryOp,
          durationMs: duration,
          threshold: SLOW_QUERY_THRESHOLD_MS,
          filter: truncateFilter(this.getFilter()),
        });
      }

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      if (duration >= SLOW_QUERY_THRESHOLD_MS) {
        slowQueryCount += 1;
      }
      throw err;
    }
  };
}

function truncateFilter(filter) {
  try {
    const str = JSON.stringify(filter);
    if (!str) return '{}';
    return str.length > 500 ? str.slice(0, 500) + '...' : str;
  } catch {
    return '[unserializable]';
  }
}

module.exports = {
  installMongoProfiler,
  getSlowQueryStats,
  resetSlowQueryStats,
  SLOW_QUERY_THRESHOLD_MS,
};
