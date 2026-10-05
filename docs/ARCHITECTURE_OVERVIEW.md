# Mallchain Enhanced Architecture Overview

## System Architecture After Enhancements

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│        mallchain-os-v14 (Port 5173)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │    Cloudflare Named Tunnel            │
         │    (Permanent URL to Backend)         │
         └────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js)                        │
│              Port 4000 / :3000 (Kubernetes)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  NEW: Observability Layer                              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • Jaeger Tracing (Correlation IDs)                    │  │
│  │  • OpenTelemetry Instrumentation                       │  │
│  │  • Prometheus SLO Metrics                              │  │
│  │  • Request → Jaeger → Traces                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Request Processing                                │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  1. AttachVersionId          (API v1/v2)              │  │
│  │  2. ApiVersioningMiddleware  (Version routing)         │  │
│  │  3. AuthMiddleware           (JWT)                     │  │
│  │  4. RateLimiter              (Per-account)             │  │
│  │  5. RequestSigningValidation (Sensitive ops)           │  │
│  │  6. FeatureFlagsMiddleware   (Runtime toggles)         │  │
│  │  7. SloMetricsMiddleware     (Track p50/p95/p99)      │  │
│  │  8. CacheControlMiddleware   (ETag validation)         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Business Logic Routes                                 │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • Auth Routes (Login/Register)                        │  │
│  │  • Market Routes (Products/Orders)                     │  │
│  │  • Wallet Routes (Transfer/Balance)                    │  │
│  │  • Badge Routes (Purchase/Issue)                       │  │
│  │  • Admin Routes (Settings/Users)                       │  │
│  │                                                         │  │
│  │  Each route includes:                                  │  │
│  │  ✓ Cursor Pagination (3 strategies)                    │  │
│  │  ✓ Request Signing Validation                          │  │
│  │  ✓ Cache-Control Headers                               │  │
│  │  ✓ SLO Tracking                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Data Layer                                            │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • Query Profiler (Logs slow queries >100ms)          │  │
│  │  • 60+ Optimized Indexes                               │  │
│  │  • Automated Index Creation on Startup                 │  │
│  │  • MongoDB Profiling (level 1 - slow only)            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                 │
└─────────────────────────────────────────────────────────────────┘
         │              │               │              │
         ▼              ▼               ▼              ▼
    ┌────────┐    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │MongoDB │    │  Redis  │   │ Jaeger   │   │Prometheus│
    │ rs0    │    │ Streams │   │ Tracing  │   │ Metrics  │
    │ 27020  │    │ 6379    │   │ 4318     │   │ 9090     │
    │        │    │         │   │          │   │          │
    │• Users │    │• Events │   │• Traces  │   │• SLOs    │
    │• Tokens│    │• Replay │   │• Spans   │   │• Errors  │
    │• Wallets    │• Lag    │   │• Logs    │   │• Latency │
    │• Orders│    │• TTL    │   │          │   │• Counters│
    │• Indexes   │         │   │          │   │          │
    └────────┘    └─────────┘   └──────────┘   └──────────┘
         │              │               │              │
         └──────────────┴───────────────┴──────────────┘
                        │
                        ▼
            ┌─────────────────────┐
            │  Grafana Dashboard  │
            │  Port 3000          │
            └─────────────────────┘
              (SLO Monitoring Panel)
```

---

## Data Flow Diagrams

### 1. Request with Full Tracing & Monitoring

```
Client Request
    │
    ├─→ Cloudflare Tunnel
    │
    └─→ Backend
        │
        ├─→ AttachVersionId: Add API version to request
        │
        ├─→ Tracing.startSpan("http_request")
        │   └─→ Generate correlationId
        │
        ├─→ ApiVersioningMiddleware
        │   └─→ Route to /api/v1 or /api/v2
        │
        ├─→ AuthMiddleware
        │   └─→ Verify JWT (via Redis token denylist)
        │
        ├─→ RateLimiter
        │   └─→ Check user/account quota
        │
        ├─→ RequestSigningValidation (if sensitive)
        │   └─→ Verify HMAC-SHA256 signature
        │
        ├─→ FeatureFlagsMiddleware
        │   └─→ Evaluate flags (Redis cache)
        │
        ├─→ SloMetricsMiddleware
        │   └─→ Start latency histogram
        │
        ├─→ CacheControlMiddleware
        │   └─→ Check If-None-Match (ETag)
        │   └─→ Return 304 if cache hit
        │
        ├─→ Route Handler
        │   │
        │   ├─→ QueryAnalyzer.profileQuery()
        │   │   └─→ MongoDB query with latency tracking
        │   │
        │   ├─→ CursorPagination.paginate()
        │   │   └─→ Efficient pagination with cursor
        │   │
        │   └─→ Business Logic
        │
        ├─→ EventPersistence.publish() (if wallet update)
        │   └─→ Write to Redis Streams
        │
        ├─→ Response Preparation
        │   └─→ Set ETag header
        │   └─→ Set Cache-Control headers
        │   └─→ Set API-Version header
        │
        └─→ SloMetricsMiddleware (on res.finish)
            └─→ Record latency, error rate, SLO compliance
            └─→ Send trace to Jaeger
            └─→ Update Prometheus metrics
            
Response → Client
    │
    └─→ Correlation ID in X-Request-ID header
    └─→ ETag for caching
    └─→ API version info
    └─→ Deprecation warnings (if v1 endpoint)
```

### 2. Real-time WebSocket with Event Replay

```
Client Connects to Backend
    │
    └─→ Socket.IO Handshake
        │
        ├─→ Tracing: Mark connection start
        │
        ├─→ JWT Decode (from httpOnly cookie)
        │   └─→ socket.data.userId = decoded.userId
        │
        └─→ Send system message
           (Connected to Mallcoin realtime network)

Client emits: subscribe:wallet (address)
    │
    └─→ Validate address format
    │
    ├─→ Check ownership (JWT userId matches wallet)
    │
    ├─→ EventPersistence.replayMissedEvents()
    │   │
    │   └─→ Redis Streams XRANGE
    │       │
    │       └─→ Fetch events since client's lastEventId
    │           │
    │           └─→ Send missed events to client
    │               (Clients catch up on reconnection!)
    │
    └─→ socket.join(`wallet:${address}`)
        │
        └─→ Now subscribed to wallet balance updates

When blockchain updates wallet balance:
    │
    ├─→ EventPersistence.publish('wallet.updated', {...})
    │   │
    │   └─→ Redis XADD (append to stream)
    │
    ├─→ io.to(`wallet:${address}`).emit('wallet:update', data)
    │   │
    │   └─→ Redis Streams consumer processes event
    │   │
    │   └─→ Broadcasts to all subscribed clients
    │
    └─→ Client receives update in real-time
        (With event durability if connection drops!)
```

### 3. Feature Flag Evaluation

```
Request includes feature flag check:
    │
    ├─→ FeatureFlagsMiddleware
    │   │
    │   └─→ req.features.isEnabled('payment.v2')
    │
    ├─→ Check Redis cache first (60s TTL)
    │   │
    │   └─→ If cache hit → return immediately
    │
    └─→ If cache miss:
        │
        ├─→ Get flag config from Redis
        │   │
        │   └─→ Flag type: PERCENTAGE, USER_LIST, etc.
        │
        ├─→ Evaluate flag based on type:
        │   │
        │   ├─→ BOOLEAN: return enabled
        │   │
        │   ├─→ PERCENTAGE: Hash userId→percentage bucket
        │   │   │
        │   │   └─→ Consistent bucketing (same user→same bucket)
        │   │
        │   ├─→ USER_LIST: Check if userId in list
        │   │
        │   └─→ RULE_BASED: Evaluate conditions (region, etc)
        │
        └─→ Cache result in Redis (60s)
            │
            └─→ Return to route handler

Route decides:
    if (payment.v2 enabled) {
        use new payment pipeline
    } else {
        use legacy payment pipeline
    }

Result: Gradual rollout without code deployment!
```

### 4. Secret Rotation Flow

```
Day 30 (Scheduled):
    │
    └─→ SecretRotationManager.rotate('jwt')
        │
        ├─→ Generate new secret: crypto.randomBytes(32)
        │
        ├─→ Store in memory with version info
        │   │
        │   └─→ secrets['jwt'] = [
        │       {version: 1, value: "old_secret", isActive: false, expiresAt: ...},
        │       {version: 2, value: "new_secret", isActive: true, expiresAt: ...}
        │     ]
        │
        ├─→ Mark old secret as isActive=false
        │   │
        │   └─→ Old tokens still valid for grace period!
        │       (Existing sessions don't break)
        │
        ├─→ Update environment (if needed)
        │
        ├─→ Log rotation to audit trail
        │   │
        │   └─→ Who: System | When: timestamp | What: JWT rotated
        │
        └─→ Cleanup expired secrets after retention period

JWT Validation:
    │
    ├─→ Try new secret (version 2) FIRST
    │   │
    │   └─→ If valid → authenticate
    │
    └─→ Fallback to old secret (version 1) for grace period
        │
        └─→ If valid → authenticate (but log as legacy)
            └─→ User should refresh token on next login

Result: Zero-downtime key rotation!
```

---

## Data Persistence Architecture

### MongoDB Indexing Strategy

```
Users Collection:
├─ email_blind: 1 (UNIQUE) ─→ Fast login lookups
├─ phone_blind: 1 (UNIQUE) ─→ Phone recovery
├─ walletAddress_blind: 1 (UNIQUE) ─→ Wallet links
├─ status: 1, createdAt: -1 ─→ Admin filters
└─ role: 1 ─→ Permission checks

Transactions Collection:
├─ txHash: 1 (UNIQUE) ─→ Block chain sync
├─ fromAddress: 1, createdAt: -1 ─→ User outgoing history
├─ toAddress: 1, createdAt: -1 ─→ User incoming history
├─ status: 1, createdAt: -1 ─→ Pending/confirmed
├─ userId: 1, createdAt: -1 ─→ User transactions
└─ createdAt: -1 (TTL: 24h) ─→ Auto-cleanup logs

Market Collection:
├─ sellerId: 1, status: 1 ─→ Seller listings
├─ category: 1, price: 1 ─→ Browse + filter
├─ name: TEXT, description: TEXT ─→ Full-text search
└─ createdAt: -1 ─→ Recent listings

Orders Collection:
├─ userId: 1, createdAt: -1 ─→ Order history
├─ status: 1, createdAt: -1 ─→ Order tracking
├─ paymentStatus: 1, updatedAt: -1 ─→ Pending payments
└─ orderId: 1 (UNIQUE) ─→ Order lookup
```

### Redis Data Structure

```
Streams (Event Durability):
├─ mallchain:events ─→ ALL events in order
│  ├─ type: wallet.updated
│  ├─ data: {address, balance}
│  ├─ timestamp: unix_ms
│  └─ metadata: {source: 'api'}
│
├─ Consumer Groups:
│  └─ mallchain:backend ─→ Processes events
│     ├─ consumer-{pid} ─→ This backend instance
│     ├─ pending: {eventId: {data}} ─→ Unacknowledged
│     └─ lastId: "1696... " ─→ Last processed

Cache (ETag Versions):
├─ ff:{flagName} ─→ Feature flag config
│  └─ {type: 'percentage', enabled: true, percentage: 50}
│
├─ cache:{key} ─→ Application cache
│  └─ TTL based on content type

Rate Limiting:
└─ rl:{bucket}:{userId} ─→ Tokens remaining
   └─ Expires: {timestamp}
```

---

## Performance Optimization Layer

### Caching Strategy

```
                Public Data (1 hour cache)
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
/api/market    /api/explorer   /api/prices
  products        blocks          feeds

Client Request
    │
    ├─→ Check If-None-Match (ETag)
    │   │
    │   ├─→ If match → 304 Not Modified ✓ (no data transfer!)
    │   │
    │   └─→ If no match → Load from DB
    │
    └─→ Set ETag: W/"sha256-hash"
    └─→ Set Cache-Control: public, max-age=3600


                User Data (5 min cache)
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
/api/wallet    /api/user      /api/badges
  details      profile         earned

Must include auth token
    │
    └─→ Cache ONLY if authenticated + own data
    └─→ Set Cache-Control: private, max-age=300


            Real-time Data (1 min cache)
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
/api/blockchain /api/staking   /api/prices
  status         rewards        current

Low TTL, high refresh rate
    │
    └─→ Minimal caching, mostly live data
```

### Query Optimization

```
Query Performance Monitoring:

Before Request:
    │
    ├─→ Start timer

During Query:
    │
    ├─→ queryAnalyzer.profileQuery()
    │   │
    │   ├─→ Execute: User.findOne({email_blind: hash})
    │   │
    │   └─→ Track latency: 15ms ✓ (indexed)

After Query:
    │
    └─→ If latency > 100ms:
        ├─→ Log slow query
        ├─→ Record in Prometheus
        ├─→ Analyze missing indexes
        └─→ Recommend: db.users.createIndex({status: 1, createdAt: -1})

Result: Proactive index optimization!
```

---

## Deployment Architecture

### Kubernetes Blue-Green Deployment

```
Git Push (deployment-manifests repo)
    │
    └─→ ArgoCD detects change
        │
        ├─→ Compare desired (Git) vs actual (Cluster)
        │
        ├─→ Create new Deployment pods (Blue)
        │   │
        │   ├─→ New version: 1.0.1
        │   ├─→ Health checks: PASSING
        │   └─→ Ready to serve: YES
        │
        ├─→ Gradually shift traffic (RollingUpdate)
        │   │
        │   ├─→ max_surge: 1 (allow 3 pods during rollout)
        │   ├─→ max_unavailable: 0 (no downtime)
        │   │
        │   └─→ Replace pods gradually:
        │       ├─→ Pod 1 (v1.0.0) → Pod 1 (v1.0.1) ✓
        │       ├─→ Pod 2 (v1.0.0) → Pod 2 (v1.0.1) ✓
        │       └─→ Pod 3 (v1.0.0) → Pod 3 (v1.0.1) ✓
        │
        ├─→ Monitor SLO metrics
        │   │
        │   ├─→ Error rate: 0.05% ✓ (< 0.1%)
        │   ├─→ P99 latency: 450ms ✓ (< 1000ms)
        │   └─→ Availability: 99.98% ✓ (>= 99.5%)
        │
        └─→ If metrics degrade:
            │
            ├─→ Automatic rollback (if set)
            │   └─→ kubectl rollout undo
            │
            └─→ Incident notification
                └─→ Slack alert: "Deployment failed SLOs"

Result: Zero-downtime deployment with automatic rollback!
```

### Pod Disruption Budget

```
During Maintenance:
    │
    ├─→ Node draining begins
    │
    ├─→ PodDisruptionBudget checks:
    │   │
    │   └─→ Can safely evict pod?
    │       │
    │       ├─→ Current replicas: 3
    │       ├─→ Min available (PDB): 1
    │       ├─→ Safe to evict: 2 pods ✓
    │
    ├─→ Evict pod 1 (within PDB limit)
    │   │
    │   └─→ Graceful termination (30s grace)
    │
    ├─→ Evict pod 2 (still 1 running)
    │
    └─→ Cannot evict pod 3 (would violate PDB)
        │
        └─→ Wait until new pod scheduled first

Result: Always maintaining service availability!
```

---

## Monitoring & Alerting Flow

```
Prometheus Scrapes Metrics Every 15s
    │
    ├─→ /metrics endpoint
    │   │
    │   ├─→ api_request_latency_seconds (histogram)
    │   ├─→ api_error_rate_percent (gauge)
    │   ├─→ service_availability_percent (gauge)
    │   ├─→ database_slow_queries_total (counter)
    │   ├─→ events_published_total (counter)
    │   └─→ feature_flag_evaluations_total (counter)
    │
    ├─→ AlertManager evaluates rules
    │   │
    │   ├─→ If api_error_rate > 1%: Warning ⚠️
    │   │   └─→ Page on-call
    │   │
    │   ├─→ If availability < 99%: Critical 🚨
    │   │   └─→ Page on-call + escalate
    │   │
    │   └─→ If P99 latency > 2s: Warning ⚠️
    │       └─→ Send to Slack
    │
    └─→ Grafana queries Prometheus
        │
        ├─→ SLO Dashboard displays:
        │   ├─→ Availability gauge (current %)
        │   ├─→ Error rate line chart (over time)
        │   ├─→ Latency percentiles (p50, p95, p99)
        │   ├─→ Request rate (requests/sec)
        │   └─→ SLO compliance (green/red)
        │
        └─→ Operators monitor dashboard
            │
            └─→ Alerts trigger automated responses
                ├─→ Create incident (PagerDuty)
                ├─→ Notify team (Slack)
                ├─→ Auto-scale (if CPU high)
                └─→ Trigger runbook
```

---

## Security Architecture

### Request Signing & Validation

```
Client: Sensitive Operation (e.g., withdraw $100)
    │
    ├─→ Build payload:
    │   {
    │     method: "POST",
    │     path: "/api/withdraw",
    │     timestamp: 1696...,
    │     keyVersion: "1",
    │     body: {amount: 100, address: "..."}
    │   }
    │
    ├─→ Calculate HMAC:
    │   signature = HMAC-SHA256(payload, secret)
    │
    ├─→ Send Request:
    │   {
    │     headers: {
    │       "x-signature": "<signature>",
    │       "x-timestamp": "<timestamp>",
    │       "x-key-version": "1"
    │     },
    │     body: {amount: 100, ...}
    │   }
    │
    └─→ Backend receives

Server: Validate Request
    │
    ├─→ Check timestamp is recent (< 5 min old)
    │   │
    │   └─→ If old → reject (prevent replay!) 🛡️
    │
    ├─→ Get secret for key version
    │   │
    │   └─→ Supports key rotation!
    │
    ├─→ Calculate expected signature:
    │   expected = HMAC-SHA256(payload, secret)
    │
    ├─→ Compare safely:
    │   crypto.timingSafeEqual(received, expected)
    │   │
    │   └─→ Prevents timing attacks! 🛡️
    │
    └─→ If valid:
        ├─→ Process withdrawal
        └─→ Signature info in audit log

Result: Tamper-proof requests, no replay attacks!
```

---

## Summary: Complete Data Flow

```
Client                Frontend               Backend               Services
   │                    │                       │                      │
   └──────HTTP────→ React App              Socket.IO Handshake      Jaeger
   │                    │                       │                      │
   │◄──────JSON────── UI State       Request + Correlation ID        │
   │                    │                       │                      │
   │                    │                  Auth + Versioning          │
   │                    │                       │                      │
   │                    │                  Feature Flags               │
   │                    │                       │                      │
   │                    │◄─── Trace Span ──────┤                      │
   │                    │                       │                      │
   │                    │                  Query Profiler              │
   │                    │                       │                      │
   │                    │                  MongoDB Index ─→ MongoDB   │
   │                    │                       │                      │
   │                    │                  Redis Streams ─→ Redis     │
   │                    │                       │                      │
   │                    │                  Metrics ────────→ Prometheus
   │                    │                       │                      │
   │                    │◄─ Response ────────┤ ETag + Cache          │
   │                    │                       │                      │
   │◄────JSON with────── Cache ────────────────┤                      │
   │    ETag + Headers                          │                      │
   │                                           │                      │
   │                                           └──→ Event Replay      │
   │                                              & Persistence       │
```

This architecture provides:
✅ Complete observability (tracing, metrics, logs)
✅ Performance optimization (caching, indexes, pagination)
✅ Security hardening (signing, rotation, auth)
✅ Reliability (event persistence, deployments)
✅ Scalability (auto-scaling, load balancing)
