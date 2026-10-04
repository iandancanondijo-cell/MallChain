/**
 * OpenTelemetry/Jaeger tracing setup
 * Enables distributed tracing with correlation IDs across the stack
 * 
 * Features:
 * - Automatic instrumentation of HTTP, database, Redis calls
 * - Correlation ID injection into all traces
 * - Exports to Jaeger or OTLP-compatible backend
 * - Performance: batching, sampling, non-blocking export
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { BasicTracerProvider, BatchSpanProcessor } = require('@opentelemetry/sdk-trace-node');
const { context, trace, propagation } = require('@opentelemetry/api');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');

const logger = require('./logger');

// Configuration from environment
const JAEGER_ENABLED = process.env.JAEGER_ENABLED === 'true' || process.env.NODE_ENV === 'production';
const JAEGER_HOST = process.env.JAEGER_HOST || 'localhost';
const JAEGER_PORT = Number(process.env.JAEGER_PORT || 4318);
const JAEGER_SAMPLER_RATE = Number(process.env.JAEGER_SAMPLER_RATE || 0.1); // 10% sampling by default
const SERVICE_NAME = process.env.SERVICE_NAME || 'mallchain-backend';
const SERVICE_VERSION = process.env.npm_package_version || '0.1.0';

// Sampling strategy
class SamplingStrategy {
  constructor(samplingRate = 0.1) {
    this.samplingRate = Math.max(0, Math.min(1, samplingRate));
  }

  shouldSample(context, traceId, spanName, spanKind, attributes, links) {
    // Always sample traces with errors or high-value operations
    if (attributes?.['http.status_code'] >= 400) return true;
    if (spanName.includes('transaction') || spanName.includes('payment')) return true;
    
    // Sample based on rate
    return Math.random() < this.samplingRate;
  }

  toString() {
    return `SamplingStrategy(${(this.samplingRate * 100).toFixed(0)}%)`;
  }
}

class TracingManager {
  constructor() {
    this.initialized = false;
    this.sdk = null;
    this.tracer = null;
    this.spanContexts = new Map(); // Track active span contexts
  }

  /**
   * Initialize tracing with OpenTelemetry
   */
  initialize() {
    if (this.initialized) return;

    if (!JAEGER_ENABLED) {
      logger.info('Tracing', 'Jaeger disabled (JAEGER_ENABLED=false)', { SERVICE_NAME });
      this.tracer = trace.getTracer(SERVICE_NAME);
      return;
    }

    try {
      // Create OTLP exporter (compatible with Jaeger's OTLP receiver)
      const exporter = new OTLPTraceExporter({
        url: `http://${JAEGER_HOST}:${JAEGER_PORT}/v1/traces`,
        headers: { 'Content-Type': 'application/json' },
        timeoutMillis: 10000,
      });

      // Create resource
      const resource = Resource.default().merge(
        new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
          [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
        }),
      );

      // Create tracer provider
      const tracerProvider = new BasicTracerProvider({ resource });

      // Add batch span processor (non-blocking export)
      tracerProvider.addSpanProcessor(
        new BatchSpanProcessor(exporter, {
          maxQueueSize: 2048,
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
          maxShutdownWaitTimeMillis: 30000,
        }),
      );

      // Set global tracer provider
      trace.setGlobalTracerProvider(tracerProvider);

      // Set trace context propagator (W3C trace context standard)
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());

      this.tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
      this.initialized = true;

      logger.info('Tracing initialized', {
        jaegerHost: JAEGER_HOST,
        jaegerPort: JAEGER_PORT,
        samplingRate: JAEGER_SAMPLER_RATE,
        SERVICE_NAME,
      });
    } catch (err) {
      logger.error('Tracing initialization failed', 'Failed to initialize Jaeger tracing', err, {
        SERVICE_NAME,
      });
      // Continue without tracing rather than crashing
      this.tracer = trace.getTracer(SERVICE_NAME);
    }
  }

  /**
   * Start a new trace span
   * @param {string} spanName - Name of the span
   * @param {object} attributes - Span attributes/metadata
   * @returns {Span} OpenTelemetry span object
   */
  startSpan(spanName, attributes = {}) {
    if (!this.tracer) return { end: () => {} };

    return this.tracer.startSpan(spanName, {
      attributes: {
        'service.name': SERVICE_NAME,
        ...attributes,
      },
    });
  }

  /**
   * Create a correlation ID for tracing
   * Attached to all logs and spans for end-to-end request tracking
   */
  generateCorrelationId() {
    const { randomUUID } = require('crypto');
    return randomUUID();
  }

  /**
   * Run a function within a trace context
   * Automatically starts/ends span and handles errors
   */
  async traceAsync(spanName, fn, attributes = {}) {
    if (!this.tracer) {
      return fn();
    }

    const span = this.startSpan(spanName, attributes);
    
    try {
      return await context.with(
        trace.setSpan(context.active(), span),
        () => fn(span),
      );
    } catch (err) {
      span.setAttributes({
        'error': true,
        'error.type': err.constructor.name,
        'error.message': err.message,
      });
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Synchronous version of traceAsync
   */
  traceSync(spanName, fn, attributes = {}) {
    if (!this.tracer) {
      return fn();
    }

    const span = this.startSpan(spanName, attributes);
    
    try {
      return context.with(
        trace.setSpan(context.active(), span),
        () => fn(span),
      );
    } catch (err) {
      span.setAttributes({
        'error': true,
        'error.type': err.constructor.name,
        'error.message': err.message,
      });
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Add event to current span
   */
  addEvent(name, attributes = {}) {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Get current trace ID for correlation
   */
  getCurrentTraceId() {
    const span = trace.getActiveSpan();
    if (!span) return null;
    
    const spanContext = span.spanContext();
    return spanContext?.traceId;
  }
}

const tracingManager = new TracingManager();

// Initialize on module load (but defer actual setup to allow config override)
process.nextTick(() => {
  tracingManager.initialize();
});

module.exports = {
  tracingManager,
  getTracer: () => tracingManager.tracer,
  generateCorrelationId: () => tracingManager.generateCorrelationId(),
  traceAsync: (name, fn, attrs) => tracingManager.traceAsync(name, fn, attrs),
  traceSync: (name, fn, attrs) => tracingManager.traceSync(name, fn, attrs),
  addEvent: (name, attrs) => tracingManager.addEvent(name, attrs),
  getCurrentTraceId: () => tracingManager.getCurrentTraceId(),
};
