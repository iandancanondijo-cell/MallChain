/**
 * Database Query Analyzer and Profiler
 * Tracks slow queries, expensive operations, and provides performance insights
 * 
 * Features:
 * - Automatic slow query logging (>threshold)
 * - MongoDB profiler integration
 * - Query execution time tracking
 * - Recommendations for index optimization
 */

const logger = require('./logger');
const promClient = require('prom-client');

const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS || 100);

// Metrics for slow queries
const slowQueryCounter = new promClient.Counter({
  name: 'database_slow_queries_total',
  help: 'Total number of queries exceeding slow query threshold',
  labelNames: ['collection', 'operation', 'reason'],
});

const queryLatencyHistogram = new promClient.Histogram({
  name: 'database_query_latency_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['collection', 'operation'],
  buckets: [0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5],
});

const indexMissingCounter = new promClient.Counter({
  name: 'database_index_missing_total',
  help: 'Total number of queries detected without appropriate indexes',
  labelNames: ['collection', 'fields'],
});

class QueryAnalyzer {
  constructor() {
    this.queryLog = [];
    this.slowQueries = [];
    this.indexRecommendations = new Map();
  }

  /**
   * Wrap a MongoDB operation to profile it
   */
  profileQuery(collection, operation, query = {}) {
    return async (executor) => {
      const startTime = Date.now();
      let result;
      let error;

      try {
        result = await executor();
      } catch (err) {
        error = err;
      }

      const latencyMs = Date.now() - startTime;
      this.recordQuery({
        collection,
        operation,
        query,
        latencyMs,
        error,
      });

      if (error) throw error;
      return result;
    };
  }

  /**
   * Record query execution
   */
  recordQuery(queryData) {
    const { collection, operation, query, latencyMs, error } = queryData;

    // Record metric
    queryLatencyHistogram.observe(
      { collection, operation },
      latencyMs / 1000,
    );

    // Check for slow query
    if (latencyMs > SLOW_QUERY_THRESHOLD_MS) {
      this.logSlowQuery({
        collection,
        operation,
        query,
        latencyMs,
      });

      slowQueryCounter.inc({
        collection,
        operation,
        reason: error ? 'error' : 'threshold_exceeded',
      });
    }

    // Analyze for missing indexes
    this.analyzeIndexUsage(collection, operation, query);

    // Keep last 1000 queries for analysis
    this.queryLog.push({
      timestamp: Date.now(),
      ...queryData,
    });

    if (this.queryLog.length > 1000) {
      this.queryLog.shift();
    }
  }

  /**
   * Log slow query with context
   */
  logSlowQuery(slowQuery) {
    const { collection, operation, query, latencyMs } = slowQuery;

    logger.warn('database', `Slow query: ${collection}.${operation}`, {
      collection,
      operation,
      latencyMs,
      threshold: SLOW_QUERY_THRESHOLD_MS,
      query: JSON.stringify(query).slice(0, 500),
      excess: `${(latencyMs - SLOW_QUERY_THRESHOLD_MS).toFixed(0)}ms over threshold`,
    });

    this.slowQueries.push({
      timestamp: Date.now(),
      collection,
      operation,
      query,
      latencyMs,
    });

    // Keep last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries.shift();
    }
  }

  /**
   * Analyze query for missing or underutilized indexes
   */
  analyzeIndexUsage(collection, operation, query) {
    // Scan operations (full collection scans) are red flags
    if (operation === 'scan' || operation === 'find') {
      const queryFields = Object.keys(query || {});
      
      if (queryFields.length > 0) {
        const key = `${collection}:${queryFields.sort().join(',')}`;
        
        if (!this.indexRecommendations.has(key)) {
          this.indexRecommendations.set(key, {
            collection,
            fields: queryFields,
            count: 0,
          });

          indexMissingCounter.inc({
            collection,
            fields: queryFields.join(','),
          });
        }

        const rec = this.indexRecommendations.get(key);
        rec.count += 1;
      }
    }
  }

  /**
   * Get slow query statistics
   */
  getSlowQueryStats() {
    if (this.queryLog.length === 0) {
      return {
        totalQueries: 0,
        slowQueries: 0,
        slowPercentage: 0,
        recentSlow: [],
      };
    }

    const totalQueries = this.queryLog.length;
    const slowCount = this.slowQueries.length;
    const slowPercentage = (slowCount / totalQueries) * 100;

    return {
      totalQueries,
      slowQueries: slowCount,
      slowPercentage: slowPercentage.toFixed(2),
      recentSlow: this.slowQueries.slice(-10),
    };
  }

  /**
   * Get recommended indexes
   */
  getIndexRecommendations() {
    const recommendations = Array.from(this.indexRecommendations.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(rec => ({
        collection: rec.collection,
        fields: rec.fields,
        hits: rec.count,
        mongoCommand: `db.${rec.collection}.createIndex({ ${rec.fields.map(f => `"${f}": 1`).join(', ')} })`,
      }));

    return recommendations;
  }

  /**
   * Clear statistics
   */
  clear() {
    this.queryLog = [];
    this.slowQueries = [];
    this.indexRecommendations.clear();
  }

  /**
   * Export statistics for monitoring dashboard
   */
  exportStats() {
    return {
      slowQueries: this.getSlowQueryStats(),
      indexRecommendations: this.getIndexRecommendations(),
      threshold: SLOW_QUERY_THRESHOLD_MS,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * MongoDB Profiler Configuration
 * Enables profiler to catch all slow queries at database level
 */
class MongoProfilerConfig {
  /**
   * Enable profiler on a MongoDB database
   * @param {object} db - MongoDB database object
   * @param {number} level - 0=off, 1=slow, 2=all
   */
  static async configure(db, level = 1) {
    try {
      // Level 1: log slow queries (>slowMs)
      // Level 2: log all queries (for development only)
      const slowMs = SLOW_QUERY_THRESHOLD_MS;

      await db.admin().setProfilingLevel(level, { slowms: slowMs });
      logger.info('database', 'MongoDB profiler enabled', {
        level,
        slowMs,
      });

      return true;
    } catch (err) {
      logger.error('database', 'Failed to enable MongoDB profiler', err, {
        level,
      });
      return false;
    }
  }

  /**
   * Get profiler stats from MongoDB
   */
  static async getProfilerStats(db) {
    try {
      const stats = await db.collection('system.profile').find({}).toArray();
      
      return {
        count: stats.length,
        recentEntries: stats.slice(-10).map(entry => ({
          timestamp: entry.ts,
          operation: entry.op,
          namespace: entry.ns,
          durationMicros: entry.millis * 1000,
          query: entry.command,
        })),
      };
    } catch (err) {
      logger.error('database', 'Failed to read MongoDB profiler stats', err);
      return null;
    }
  }

  /**
   * Disable profiler
   */
  static async disable(db) {
    try {
      await db.admin().setProfilingLevel(0);
      logger.info('database', 'MongoDB profiler disabled');
      return true;
    } catch (err) {
      logger.error('database', 'Failed to disable MongoDB profiler', err);
      return false;
    }
  }
}

const queryAnalyzer = new QueryAnalyzer();

module.exports = {
  queryAnalyzer,
  QueryAnalyzer,
  MongoProfilerConfig,
  SLOW_QUERY_THRESHOLD_MS,
  slowQueryCounter,
  queryLatencyHistogram,
  indexMissingCounter,
};
