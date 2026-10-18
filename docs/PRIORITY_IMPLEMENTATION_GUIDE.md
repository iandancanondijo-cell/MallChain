# 8 Priority Areas Implementation Guide

This document provides integration instructions for all 8 priority enhancements implemented for Mallchain.

## Quick Start

All files have been created production-ready. To integrate:

```bash
# 1. Install new dependencies
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @pact-foundation/pact

# 2. Update backend/src/index.js to load tracing and new middleware
# 3. Enable features via environment variables (see each section)
# 4. Deploy to Kubernetes with updated Terraform configs
```

---

## PRIORITY 1: Observability & Incident Response

**Files Created:**
- `backend/src/utils/tracing.js` - OpenTelemetry/Jaeger integration
- `backend/src/utils/sloMetrics.js` - SLO/SLI tracking
- `infra/grafana/dashboards/slo-dashboard.json` - Grafana dashboard

**Integration Steps:**

1. **Enable Tracing (in `backend/src/index.js` before other requires):**
```javascript
require('./src/utils/tracing'); // Must be first
const logger = require('./src/utils/logger');
```

2. **Add SLO metrics middleware:**
```javascript
const { sloMetricsMiddleware } = require('./src/utils/sloMetrics');
app.use(sloMetricsMiddleware);
```

3. **Configure environment variables (.env):**
```
JAEGER_ENABLED=true
JAEGER_HOST=localhost
JAEGER_PORT=4318
JAEGER_SAMPLER_RATE=0.1
NODE_ENV=production
```

4. **Update logger to include correlation IDs:**
The logger already supports correlation IDs via `correlationId` field in data.

5. **Import Grafana dashboard:**
- Open Grafana UI → Dashboards → Import
- Upload `infra/grafana/dashboards/slo-dashboard.json`
- Dashboard displays: Availability, P99 Latency, Error Rate

**Verification:**
```bash
curl http://localhost:3000/api/health
# Should see X-Request-ID header with correlation ID
```

---

## PRIORITY 2: Database Query Optimization

**Files Created:**
- `backend/src/utils/queryAnalyzer.js` - Slow query profiler
- `backend/src/config/indexes.js` - Index documentation and creation

**Integration Steps:**

1. **Enable slow query monitoring:**
```javascript
// In backend/src/index.js
const { queryAnalyzer, MongoProfilerConfig } = require('./src/utils/queryAnalyzer');
const { ensureIndexes } = require('./src/config/indexes');

// On MongoDB connection:
mongoose.connection.on('connected', async () => {
  await ensureIndexes(mongoose);
  await MongoProfilerConfig.configure(mongoose.connection.db, 1);
});
```

2. **Set slow query threshold:**
```
SLOW_QUERY_THRESHOLD_MS=100
```

3. **Profile a query:**
```javascript
const result = await queryAnalyzer.profileQuery(
  'users',
  'findOne',
  { email: 'test@example.com' },
)(async () => {
  return Users.findOne({ email: 'test@example.com' });
});
```

4. **Get index recommendations:**
```javascript
const recommendations = queryAnalyzer.getIndexRecommendations();
console.log(recommendations);
// Output: MongoDB commands to create missing indexes
```

**Verification:**
```bash
# Check slow queries
curl http://localhost:3000/api/admin/slow-queries

# Check indexes
curl http://localhost:3000/api/admin/indexes
```

---

## PRIORITY 3: API Caching Strategy

**Files Created:**
- `backend/src/middleware/cacheControl.js` - ETag and cache headers
- `backend/src/utils/pagination.js` - Cursor/keyset pagination

**Integration Steps:**

1. **Add cache control middleware:**
```javascript
const { cacheControlMiddleware, attachVersionId } = require('./src/middleware/cacheControl');

app.use(attachVersionId);
app.use(cacheControlMiddleware);
```

2. **Use cursor pagination for large result sets:**
```javascript
// In route handler
const { CursorPagination } = require('./src/utils/pagination');
const pagination = CursorPagination.parse(req.query);
const result = await CursorPagination.paginate(collection, filter, pagination);

res.json({
  items: result.docs,
  pagination: result.pagination, // Includes 'cursor' for next page
});
```

3. **Enable cache versioning:**
```
# Clients pass in requests:
GET /api/market/products?v=1.0
# Or via header:
Accept-Version: 1.0
```

4. **Test ETag caching:**
```bash
# First request
curl -i http://localhost:3000/api/market/products

# Response includes: ETag, Cache-Control headers
# Second request with If-None-Match
curl -i -H "If-None-Match: W/\"abc123...\"" http://localhost:3000/api/market/products
# Response: 304 Not Modified (saves bandwidth)
```

**Verification:**
```bash
# Check cache statistics
curl http://localhost:3000/api/admin/cache/stats

# Purge cache
curl -X POST http://localhost:3000/api/admin/cache/purge \
  -H "Content-Type: application/json" \
  -d '{"pattern": "market:*"}'
```

---

## PRIORITY 4: Real-time Communication Resilience

**Files Created:**
- `backend/src/services/eventPersistence.js` - Redis Streams event queue

**Integration Steps:**

1. **Initialize event persistence:**
```javascript
// In backend/src/index.js
const { getInstance } = require('./src/services/eventPersistence');
const eventPersistence = getInstance(global.redisClient);

await eventPersistence.initialize();
```

2. **Publish events to stream:**
```javascript
// In Socket.IO handlers
const { getInstance } = require('./src/services/eventPersistence');
const eventPersistence = getInstance();

await eventPersistence.publish('user.created', {
  userId: user.id,
  email: user.email,
}, { source: 'api' });
```

3. **Subscribe to events:**
```javascript
eventPersistence.subscribe('user.created', (data) => {
  console.log('New user:', data.email);
  // Broadcast to connected clients
  io.emit('user_created', data);
});
```

4. **Handle client reconnection:**
```javascript
// When client reconnects
const missedEvents = await eventPersistence.replayMissedEvents(
  clientId,
  lastEventId
);

// Send missed events to client
socket.emit('missed_events', missedEvents);
```

**Environment Variables:**
```
EVENT_STREAM_NAME=mallchain:events
EVENT_CONSUMER_GROUP=mallchain:backend
EVENT_BATCH_SIZE=100
EVENT_STREAM_TRIM_MS=3600000
REDIS_URL=redis://localhost:6379
```

**Verification:**
```bash
# Monitor event stream
redis-cli
XINFO STREAM mallchain:events
XLEN mallchain:events
```

---

## PRIORITY 5: Security Hardening

**Files Created:**
- `backend/src/middleware/requestSigning.js` - HMAC signature validation
- `backend/src/utils/secretRotation.js` - Secret rotation policy
- Enhanced `backend/src/middleware/corsMiddleware.js`

**Integration Steps:**

1. **Enable request signing for sensitive endpoints:**
```javascript
const { requireRequestSignature } = require('./src/middleware/requestSigning');

// Apply to sensitive routes
app.post('/api/withdraw', requireRequestSignature, withdrawHandler);
app.post('/api/payment', requireRequestSignature, paymentHandler);
```

2. **Client generates signatures:**
```javascript
const { generateClientSignature } = require('./src/middleware/requestSigning');

const { signature, timestamp, keyVersion, headers } = generateClientSignature(
  'POST',
  '/api/withdraw',
  { amount: 100, address: 'cosmos1...' },
  process.env.REQUEST_SIGNING_KEY
);

// Include headers in request
fetch('/api/withdraw', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers,
  },
  body: JSON.stringify({ amount: 100, address: 'cosmos1...' }),
});
```

3. **Enable secret rotation:**
```javascript
const { rotationManager } = require('./src/utils/secretRotation');

// Check rotation status
const status = rotationManager.getStatus();
console.log(status);

// Force rotation (admin operation)
await rotationManager.forceRotate('jwt');
```

**Environment Variables:**
```
REQUEST_SIGNING_KEY_1=your-secret-key-here
ROTATE_JWT_SECRETS=true
JWT_ROTATION_INTERVAL_DAYS=30
JWT_KEY_RETENTION_DAYS=7
ROTATE_API_KEYS=true
API_KEY_ROTATION_INTERVAL_DAYS=90
```

**Verification:**
```bash
# Check CORS headers
curl -i -X OPTIONS http://localhost:3000/api/auth \
  -H "Origin: http://localhost:5173"
# Should include: Access-Control-Allow-Origin, Access-Control-Allow-Methods
```

---

## PRIORITY 6: Test Coverage Expansion

**Files Created:**
- `backend/jest.config.extended.js` - Extended Jest config
- `backend/test-setup/pact-setup.js` - Contract testing (Pact.js)
- `load-tests/k6-baseline.js` - Load testing baseline

**Integration Steps:**

1. **Setup contract testing:**
```bash
npm install --save-dev @pact-foundation/pact
```

```javascript
// In test file
const { provider, exampleContracts } = require('../test-setup/pact-setup');

describe('User API Contract', () => {
  beforeAll(() => provider.listen());

  it('should match login contract', async () => {
    await provider.addInteraction(exampleContracts.loginSuccess);
    // Make request to mock Pact server
    // Verify response matches contract
  });

  afterAll(() => provider.finalize());
});
```

2. **Setup load testing:**
```bash
# Install k6 (see https://k6.io/docs/getting-started/installation/)
brew install k6  # macOS
# or
apt-get install k6  # Linux
```

```bash
# Run baseline load test
k6 run load-tests/k6-baseline.js

# With custom parameters
k6 run -e BASE_URL=http://api.example.com \
       -e DURATION=5m \
       -e VUS=50 \
       load-tests/k6-baseline.js
```

3. **Run extended test suite:**
```bash
npm run test:coverage
# Generates coverage reports in ./coverage/
```

**Test Coverage Targets:**
- Overall: 75% (branches, functions, lines, statements)
- Utils: 90%
- Middleware: 90%

---

## PRIORITY 7: API Versioning & Feature Flags

**Files Created:**
- `backend/src/middleware/apiVersioning.js` - Version routing
- `backend/src/utils/featureFlags.js` - Runtime feature toggles

**Integration Steps:**

1. **Setup API versioning:**
```javascript
const { apiVersioningMiddleware, setupVersionedRoutes } = require('./src/middleware/apiVersioning');

setupVersionedRoutes(app);
app.use(apiVersioningMiddleware);

// Mount versioned routes
app.use('/api/v1', authRoutesV1);
app.use('/api/v2', authRoutesV2);
```

2. **Setup feature flags:**
```javascript
const { featureFlags } = require('./src/utils/featureFlags');

app.use(featureFlags.middleware());

// In route handler
app.get('/api/payments', async (req, res) => {
  const useV2Pipeline = await req.features.isEnabled('payment.v2');
  
  if (useV2Pipeline) {
    return paymentServiceV2.process(req, res);
  } else {
    return paymentServiceV1.process(req, res);
  }
});
```

3. **Manage feature flags:**
```bash
# Enable flag for 50% of users (gradual rollout)
curl -X POST http://localhost:3000/api/admin/flags/payment.v2/rollout \
  -H "Content-Type: application/json" \
  -d '{"percentage": 50}'

# Add specific user to feature list
curl -X POST http://localhost:3000/api/admin/flags/payment.v2/users \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'
```

4. **Check API versions:**
```bash
curl http://localhost:3000/api/versions
# Response:
# {
#   "versions": [
#     { "version": "1.0", "supported": true, "deprecated": false },
#     { "version": "2.0", "supported": true, "deprecated": false, "beta": true }
#   ],
#   "latestStable": "1.0"
# }
```

---

## PRIORITY 8: Deployment Reliability

**Files Created:**
- `infra/terraform/main.tf` - Kubernetes deployment config
- `infra/terraform/variables.tf` - Terraform variables
- `infra/argocd/applications.yaml` - GitOps configuration

**Integration Steps:**

1. **Setup Terraform:**
```bash
cd infra/terraform

# Initialize Terraform
terraform init \
  -backend-config="bucket=mallchain-terraform-state" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=us-west-2"

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
app_version = "1.0.0"
image_registry = "docker.io/mallchain"
backend_replicas = 2
backend_max_replicas = 10
EOF
```

2. **Deploy with Terraform:**
```bash
# Plan deployment
terraform plan -out=tfplan

# Apply
terraform apply tfplan
```

3. **Setup GitOps with ArgoCD:**
```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Apply Mallchain applications
kubectl apply -f infra/argocd/applications.yaml

# Monitor sync status
argocd app list
argocd app sync mallchain-backend
```

4. **Configure automated secret rotation:**
```bash
# ArgoCD will automatically execute secret rotation CronJob
# Secrets rotate every Sunday at 2 AM
# Check status:
kubectl get cronjob -n mallchain
kubectl get jobs -n mallchain
```

**Kubernetes Features Enabled:**
- Blue-green deployments (RollingUpdate strategy)
- Pod Disruption Budgets (safe rollouts)
- Horizontal Pod Autoscaling (CPU/Memory)
- Health checks (Liveness/Readiness probes)
- Resource limits and requests
- Security context (non-root user)
- Pod anti-affinity (spread across nodes)

**Verify Deployment:**
```bash
# Check pods
kubectl get pods -n mallchain
kubectl describe pod mallchain-backend-xxxxx -n mallchain

# Check metrics
kubectl top nodes
kubectl top pods -n mallchain

# Check events
kubectl get events -n mallchain
```

---

## Integration Checklist

- [ ] Install new dependencies (npm install)
- [ ] Enable tracing in index.js
- [ ] Add SLO metrics middleware
- [ ] Configure indexes and profiler
- [ ] Add cache control middleware
- [ ] Setup event persistence
- [ ] Enable request signing for sensitive routes
- [ ] Configure feature flags
- [ ] Setup API versioning
- [ ] Deploy with Terraform
- [ ] Configure ArgoCD
- [ ] Setup monitoring dashboards
- [ ] Run load tests to verify baselines
- [ ] Document custom feature flags

---

## Environment Configuration

**Minimum .env for all features:**
```
NODE_ENV=production

# Observability
JAEGER_ENABLED=true
JAEGER_HOST=jaeger.monitoring
JAEGER_PORT=4318

# Database
SLOW_QUERY_THRESHOLD_MS=100

# Caching
CACHE_CONTROL_ENABLED=true

# Events
EVENT_STREAM_NAME=mallchain:events
REDIS_URL=redis://redis:6379

# Security
REQUEST_SIGNING_KEY_1=your-secret-key
ROTATE_JWT_SECRETS=true

# Feature Flags
FEATURE_FLAGS_ENABLED=true

# API Versioning
API_VERSION_SUPPORT=1.0,2.0

# Kubernetes
TRUST_PROXY=true
```

---

## Monitoring & Alerting

**Key metrics to monitor:**
1. `service_availability_percent` - SLO target: 99.5%
2. `api_error_rate_percent` - SLO target: <0.1%
3. `api_request_latency_seconds` - P99: <1000ms
4. `database_slow_queries_total` - Investigate spikes
5. `event_stream_lag` - Should stay low
6. `slo_compliance` - 1 = met, 0 = breached

**Alert thresholds:**
- Availability < 99%: Page on-call
- Error rate > 1%: Warning
- P99 latency > 2s: Warning
- Slow queries > 100/min: Warning
- Event lag > 1000: Warning

---

## Support & Documentation

Each utility includes comprehensive JSDoc comments. Example usage in tests.

For questions:
1. Check file headers for feature overview
2. Read JSDoc for function-level docs
3. Check existing tests for examples
4. Review environment variables in config

---

## Rollback Plan

If issues arise:

**Tracing:** Set `JAEGER_ENABLED=false`
**Caching:** Remove `cacheControlMiddleware`
**Events:** Stop consuming from stream
**Request signing:** Remove from route middleware
**Feature flags:** Set all to 0% rollout
**API versioning:** Fall back to latest version
**Kubernetes:** `kubectl rollout undo deployment/mallchain-backend -n mallchain`

---

## Next Steps

1. **Immediate (Day 1):**
   - Integrate Priority 1-3 (Observability, DB Optimization, Caching)
   - Run baseline load tests

2. **Short term (Week 1-2):**
   - Integrate Priority 4-7 (Real-time, Security, Testing, Versioning)
   - Identify and address slow queries
   - Set up monitoring alerts

3. **Medium term (Month 1):**
   - Integrate Priority 8 (Deployment)
   - Test blue-green deployments
   - Validate SLO baselines
   - Tune feature flag rollout percentages

4. **Ongoing:**
   - Monitor metrics dashboards
   - Rotate secrets quarterly
   - Review and update SLO targets
   - Perform load testing before releases
