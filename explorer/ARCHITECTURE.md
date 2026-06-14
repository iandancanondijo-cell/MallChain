# Mallchain Explorer - System Architecture

## Overview

The Mallchain Explorer transforms a raw blockchain into a public, observable, queryable platform. It's the critical infrastructure that makes institutional and retail users confident in the network.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BLOCKCHAIN LAYER                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Mallchain Node (Cosmos-SDK)                               │  │
│  │ - Block Production (Tendermint)                           │  │
│  │ - Transaction Processing                                  │  │
│  │ - State Machine                                           │  │
│  │ - RPC Server (Port 26657)                                │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────────────┘
                 │ RPC Calls
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         INDEXER LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Indexer Engine (Node.js)                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Block Indexer                                      │  │  │
│  │  │ - Reads blocks from RPC                           │  │  │
│  │  │ - Extracts: height, hash, proposer, tx_count      │  │  │
│  │  │ - Stores in database                              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Transaction Indexer                               │  │  │
│  │  │ - Reads transaction results                       │  │  │
│  │  │ - Extracts: hash, sender, receiver, amount, fee  │  │  │
│  │  │ - Stores in database                              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Validator Indexer                                 │  │  │
│  │  │ - Polls validator set                             │  │  │
│  │  │ - Tracks: voting_power, uptime, jailed status    │  │  │
│  │  │ - Stores in database (every 20 blocks)           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Validator Metrics Tracker                         │  │  │
│  │  │ - Tracks missed blocks                            │  │  │
│  │  │ - Calculates uptime percentage                    │  │  │
│  │  │ - Monitors slashing events                        │  │  │
│  │  │ - Records historical metrics                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────────────┘
                 │ INSERT/UPDATE
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATABASE LAYER (PostgreSQL)                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Schema                                                      │  │
│  │ ├── blocks (height PK, hash, proposer, tx_count)          │  │
│  │ ├── transactions (hash PK, block_height FK, status)       │  │
│  │ ├── validators (address PK, voting_power, uptime)         │  │
│  │ ├── validator_metrics (id PK, address FK, uptime)         │  │
│  │ ├── staking_events (delegator, validator, amount)         │  │
│  │ ├── governance_events (proposal_id, title, status)        │  │
│  │ └── treasury_snapshots (total_supply, reserves)           │  │
│  │                                                            │  │
│  │ Indexes                                                    │  │
│  │ ├── blocks(timestamp DESC)                               │  │
│  │ ├── validators(voting_power DESC)                        │  │
│  │ ├── transactions(sender, receiver, block_height)         │  │
│  │ └── validator_metrics(address, timestamp DESC)           │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────────────┘
                 │ Query/Subscribe
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPLORER API LAYER (Express)                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ REST API (Port 5000)                                       │  │
│  │ ├── GET /api/explorer/blocks                             │  │
│  │ ├── GET /api/explorer/blocks/:height                     │  │
│  │ ├── GET /api/explorer/tx/:hash                           │  │
│  │ ├── GET /api/explorer/validators                         │  │
│  │ ├── GET /api/explorer/validators/:address               │  │
│  │ ├── GET /api/explorer/stats                             │  │
│  │ └── GET /api/explorer/search/:query                     │  │
│  │                                                            │  │
│  │ WebSocket Server (Socket.io)                             │  │
│  │ ├── subscribe_blocks → new_block                         │  │
│  │ ├── subscribe_transactions → new_transactions           │  │
│  │ └── subscribe_validators → validator_update             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────────────┘
                 │ HTTP + WebSocket
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER (React + Vite)                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Explorer Pages (Port 5173)                                │  │
│  │ ├── Dashboard                                             │  │
│  │ │   ├── Chain statistics                                 │  │
│  │ │   ├── Block trends chart                               │  │
│  │ │   └── Transaction distribution                         │  │
│  │ │                                                          │  │
│  │ ├── Blocks Explorer                                      │  │
│  │ │   ├── Block list (paginated)                           │  │
│  │ │   ├── Block details                                    │  │
│  │ │   └── Block transactions                               │  │
│  │ │                                                          │  │
│  │ ├── Transaction Details                                  │  │
│  │ │   ├── TX status                                        │  │
│  │ │   ├── Sender/receiver info                             │  │
│  │ │   └── Amount and fees                                  │  │
│  │ │                                                          │  │
│  │ ├── Validators Explorer                                  │  │
│  │ │   ├── Validator list                                   │  │
│  │ │   ├── Voting power distribution                        │  │
│  │ │   ├── Uptime charts                                    │  │
│  │ │   └── Detailed metrics                                 │  │
│  │ │                                                          │  │
│  │ ├── Search                                               │  │
│  │ │   ├── Global search bar                                │  │
│  │ │   ├── Real-time suggestions                            │  │
│  │ │   └── Multi-type results                               │  │
│  │ │                                                          │  │
│  │ └── Real-time Updates                                    │  │
│  │     ├── Socket.io connections                           │  │
│  │     ├── Live block streaming                             │  │
│  │     └── Live transaction updates                         │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Block Indexing Flow
```
Blockchain Node
    ↓ (RPC: /block?height=X)
Indexer Fetches Block
    ↓
Extracts Block Data:
  - height, hash, proposer
  - timestamp, tx_count
    ↓
PostgreSQL INSERT
    ↓
Update Latest Block Height
    ↓
Emit via Socket.io: new_block
    ↓
Frontend Updates Live
```

### Validator Tracking Flow
```
Every 20 blocks:
  RPC: /validators
    ↓
Extract Validator Data:
  - address, moniker
  - voting_power, commission
  - jailed status
    ↓
RPC: /signing_info/:address (Optional)
  ↓
Calculate Metrics:
  - uptime = (index_offset - missed_blocks) / index_offset
  - missed_blocks, produced_blocks
  - slash_count
    ↓
PostgreSQL UPDATE validators table
PostgreSQL INSERT validator_metrics
    ↓
Emit: validator_update
    ↓
Frontend Charts Update
```

### Query Flow
```
User queries /api/explorer/stats
    ↓
API Handler:
  1. Query blocks COUNT
  2. Query transactions COUNT
  3. Query validators COUNT
  4. Query MAX(block height)
  5. Query SUM(voting_power)
  6. Query AVG(uptime)
    ↓ (Parallel queries)
PostgreSQL Results
    ↓
Format JSON Response
    ↓
Send to Frontend
    ↓
Display Dashboard
```

## Database Schema Details

### blocks
```sql
height BIGINT PRIMARY KEY      -- Block sequence number
hash TEXT UNIQUE NOT NULL      -- Block hash
proposer TEXT                  -- Proposer address
tx_count INT                   -- Transaction count in block
timestamp TIMESTAMP            -- Block time
created_at TIMESTAMP           -- Index creation time
```

**Indexes:**
- `blocks(timestamp DESC)` - Latest blocks queries
- `blocks(height)` - Primary key index

### transactions
```sql
hash TEXT PRIMARY KEY          -- Transaction hash
block_height BIGINT NOT NULL   -- Block containing TX
sender TEXT                    -- From address
receiver TEXT                  -- To address
amount BIGINT                  -- Amount transferred
fee BIGINT                     -- Transaction fee
status TEXT                    -- success/failed
timestamp TIMESTAMP            -- TX timestamp
created_at TIMESTAMP           -- Index time
```

**Indexes:**
- `transactions(sender)` - Search by sender
- `transactions(receiver)` - Search by receiver
- `transactions(block_height)` - Queries by block

### validators
```sql
address TEXT PRIMARY KEY       -- Validator address
moniker TEXT                   -- Validator name
voting_power BIGINT            -- Current voting power
commission DOUBLE PRECISION    -- Commission rate
uptime DOUBLE PRECISION        -- Current uptime %
jailed BOOLEAN                 -- Jailing status
rewards BIGINT                 -- Accumulated rewards
missed_blocks BIGINT           -- Missed block count
produced_blocks BIGINT         -- Produced block count
slash_count INT                -- Slashing count
updated_at TIMESTAMP           -- Last update
```

**Indexes:**
- `validators(voting_power DESC)` - Ranking queries
- `validators(address)` - Primary key

### validator_metrics
```sql
id SERIAL PRIMARY KEY          -- Metric record ID
address TEXT                   -- Validator address (FK)
uptime DOUBLE PRECISION        -- Uptime percentage
missed_blocks BIGINT           -- Missed blocks at this block
produced_blocks BIGINT         -- Produced blocks
rewards_earned BIGINT          -- Rewards earned
slash_count INT                -- Slashes at this time
block_height BIGINT            -- Block when measured
timestamp TIMESTAMP            -- Measurement time
created_at TIMESTAMP           -- Record creation
```

**Indexes:**
- `validator_metrics(address)` - Historical queries
- `validator_metrics(timestamp DESC)` - Recent metrics
- `validator_metrics(address, timestamp DESC)` - Time series

## Key Performance Characteristics

### Read Performance
- **Blocks list (20 items):** <100ms
- **Validator list (100 items):** <50ms
- **Chain stats (6 queries):** <200ms
- **Search (3 tables):** <150ms

### Write Performance
- **Block indexing:** ~50-100ms per block
- **Transaction batch:** ~200ms per 10 TXs
- **Validator update:** ~50ms

### Storage
- **Per 1,000 blocks:** ~5MB (with transactions)
- **Per validator:** ~2-5KB
- **Per metric record:** ~200 bytes

### Concurrency
- **Max simultaneous indexing:** Single threaded (safe)
- **Max concurrent API users:** 1000+ (with connection pooling)
- **Database pool connections:** 20 (configurable)

## Scalability Considerations

### Current Limits
- RPC polling: 1 block/second = 86,400 blocks/day
- Database: Handles 10+ million blocks efficiently
- API: 1000+ concurrent users

### Future Optimization
- **Read Replicas:** Distribute read queries
- **Sharding:** Partition data by block height ranges
- **Cache Layer:** Redis for hot data
- **GraphQL:** More efficient queries
- **Event Streaming:** Kafka for high throughput

## Security Considerations

1. **Database Access**
   - Firewall database port 5432
   - Use strong passwords
   - Enable SSL/TLS connections

2. **API Security**
   - Rate limiting on search/stats
   - CORS configuration
   - No sensitive data exposure

3. **RPC Trust**
   - Can query multiple RPC endpoints
   - Verify block hashes
   - Fallback to multiple nodes

4. **Data Validation**
   - Validate all incoming blockchain data
   - Check block height sequence
   - Verify transaction status

## Deployment Considerations

### Single Server
- Indexer + API + PostgreSQL on one machine
- Good for: Development, small networks
- Limitations: No redundancy

### Multi-Server
- PostgreSQL on dedicated instance
- Indexer on one server
- API on load-balanced servers
- Replicate database across zones

### Cloud Deployment
- Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
- Containerize indexer and API
- Use Kubernetes for orchestration
- CDN for frontend static files

## Monitoring & Alerting

### Key Metrics
1. **Indexer Health**
   - Blocks behind tip
   - Indexing latency
   - Error rate

2. **API Health**
   - Response time
   - Error rate
   - Active connections

3. **Database Health**
   - Disk usage
   - Query performance
   - Connection count

### Alerting Rules
- Indexer stuck (no new blocks > 5 minutes)
- Database disk > 80%
- API response time > 1 second
- Connection pool exhausted

## Maintenance Tasks

### Daily
- Monitor disk space
- Check for error logs
- Verify RPC connectivity

### Weekly
- Analyze slow queries
- Check database index fragmentation
- Review search patterns

### Monthly
- Vacuum database
- Reindex tables
- Analyze query plans
- Update dependencies

## Future Features

1. **Advanced Analytics**
   - Transaction flow analysis
   - Validator profitability calculations
   - Network topology visualization

2. **Governance Integration**
   - Proposal indexing
   - Vote tracking
   - Parameter changes

3. **Mobile App**
   - Native iOS/Android apps
   - Push notifications
   - Offline caching

4. **Institutional APIs**
   - GraphQL endpoint
   - Historical data exports
   - Custom webhooks

5. **Machine Learning**
   - Validator performance prediction
   - Network anomaly detection
   - Gas price forecasting

## Success Metrics

An effective explorer should have:
- ✅ **Coverage:** 99%+ of blocks indexed
- ✅ **Latency:** <1 second from block creation to visibility
- ✅ **Reliability:** 99.9% uptime
- ✅ **Accuracy:** 100% transaction accuracy
- ✅ **Usability:** <2 second page loads
- ✅ **Completeness:** All validator metrics available

