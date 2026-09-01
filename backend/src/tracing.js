/**
 * O3: OpenTelemetry distributed tracing. Must be required BEFORE any other
 * module (see package.json's `start`/`dev` scripts using `node -r
 * ./src/tracing.js`) — auto-instrumentation patches modules (http, express,
 * mongodb, ioredis, ...) at require-time, so this has to run first or the
 * already-loaded copies in index.js's require graph would go uninstrumented.
 *
 * Entirely opt-in: without OTEL_EXPORTER_OTLP_ENDPOINT set, this file does
 * nothing at all — no SDK starts, no console-exporter noise by default.
 * Tracing without a real collector/backend to send spans to has no
 * practical use, so "quietly do nothing until configured" is the right
 * default here, the same way ALERT_WEBHOOK_URL and
 * MAX_PAYOUT_KES_PER_TX/DAY are opt-in elsewhere in this codebase.
 */
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || 'blockchain-api',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Serving static/health-check traffic on every instrumented HTTP
        // call would flood a trace backend with near-zero-value spans —
        // exclude the two highest-frequency, lowest-signal routes.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url === '/api/live' || req.url === '/metrics',
        },
      }),
    ],
  });

  sdk.start();

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      sdk.shutdown().finally(() => process.exit(0));
    });
  }
}

module.exports = {};
