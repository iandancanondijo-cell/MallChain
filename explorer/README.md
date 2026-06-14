# Mallchain Explorer

A comprehensive blockchain explorer and indexer for the Mallchain network. This system transforms raw blockchain data into an observable, queryable, and analyzable platform.

## Architecture

```
Blockchain (Port 26657)
    ↓
    Indexer (Reads blocks, txs, validators)
    ↓
PostgreSQL Database (Port 5432)
    ↓
Explorer API (Port 5000)
    ↓
Frontend + Real-time Sockets (Port 5173)
```

## System Components

### 1. **Database Layer** (PostgreSQL)
- Stores indexed blockchain data
- Tables: blocks, transactions, validators, treasury_snapshots, staking_events, governance_events, validator_metrics
- Optimized with indexes for fast queries

### 2. **Indexer Engine**
- Continuously reads blocks from RPC
- Extracts transactions and validator data
- Stores in PostgreSQL for fast querying
- Polls every block for real-time data

### 3. **Explorer API** (Express + Socket.io)
- RESTful API for explorer data
- WebSocket support for real-time updates
- Search functionality
- Analytics endpoints

### 4. **Frontend** (React + Vite)
- Block explorer
- Transaction explorer
- Validator explorer
- Chain statistics dashboard
- Real-time updates

## Installation

### Prerequisites
- Node.js 16+
- PostgreSQL 12+
- Mallchain RPC running on `http://localhost:26657`

### Step 1: Install PostgreSQL

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

### Step 2: Create Database

```bash
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE mallscan;
CREATE USER mallscan WITH PASSWORD 'mallscan';
ALTER ROLE mallscan SET client_encoding TO 'utf8';
ALTER ROLE mallscan SET default_transaction_isolation TO 'read committed';
ALTER ROLE mallscan SET default_transaction_deferrable TO on;
ALTER ROLE mallscan SET default_transaction_read_committed TO off;
GRANT ALL PRIVILEGES ON DATABASE mallscan TO mallscan;

\q
```

### Step 3: Install Dependencies

```bash
cd explorer/backend
npm install
```

### Step 4: Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env with your settings:
# DB_USER=mallscan
# DB_PASSWORD=mallscan
# DB_HOST=localhost
# DB_NAME=mallscan
# RPC_URL=http://localhost:26657
# EXPLORER_API_PORT=5000
# FRONTEND_URL=http://localhost:5173
```

### Step 5: Initialize Database Schema

```bash
npm run init-db
```

Expected output:
```
Initializing database schema...
✓ Database schema initialized successfully
```

### Step 6: Start the Indexer

In one terminal:
```bash
npm run indexer
```

Expected output:
```
🚀 Starting Mallchain Indexer...
📡 RPC URL: http://localhost:26657
📍 Starting from block 1
✓ Indexed block 1
✓ Indexed 0 transactions from block 1
✓ Indexed 21 validators
...
```

### Step 7: Start the Explorer API

In another terminal:
```bash
npm run api
```

Expected output:
```
🚀 Explorer API server running on port 5000
```

### Step 8: Frontend Configuration

Update `frontend/.env` or `frontend/vite.config.js`:
```javascript
export default defineConfig({
  // ...
  define: {
    'import.meta.env.VITE_EXPLORER_API_URL': JSON.stringify('http://localhost:5000/api/explorer')
  }
})
```

### Step 9: Start Frontend (from project root)

```bash
cd frontend
npm install socket.io-client
npm run dev
```

## API Endpoints

### Blocks
```
GET /api/explorer/blocks?limit=20&offset=0
GET /api/explorer/blocks/:height
GET /api/explorer/blocks/:height/transactions
```

### Transactions
```
GET /api/explorer/tx/:hash
```

### Validators
```
GET /api/explorer/validators
GET /api/explorer/validators/:address
GET /api/explorer/validators/:address/metrics
```

### Statistics
```
GET /api/explorer/stats
GET /api/explorer/treasury/snapshots
GET /api/explorer/staking/events
```

### Search
```
GET /api/explorer/search/:query
```

## Frontend Pages

1. **Dashboard** (`/explorer/stats`)
   - Chain overview
   - Block trends
   - Transaction statistics
   - Network health

2. **Blocks** (`/explorer/blocks`)
   - Recent blocks
   - Block details
   - Block transactions
   - Pagination

3. **Validators** (`/explorer/validators`)
   - All validators
   - Voting power distribution
   - Uptime charts
   - Validator details

4. **Transactions** (`/explorer/tx/:hash`)
   - Transaction status
   - Sender/receiver details
   - Amount and fees

## Real-Time Features

The explorer uses WebSocket connections for real-time updates:

```javascript
// Frontend
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

// Subscribe to new blocks
socket.emit('subscribe_blocks');
socket.on('new_block', (block) => {
  console.log('New block:', block);
});

// Subscribe to transactions
socket.emit('subscribe_transactions');
socket.on('new_transactions', (txs) => {
  console.log('New transactions:', txs);
});
```

## Database Schema

### Blocks Table
```sql
CREATE TABLE blocks (
    height BIGINT PRIMARY KEY,
    hash TEXT UNIQUE NOT NULL,
    proposer TEXT,
    tx_count INT DEFAULT 0,
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Transactions Table
```sql
CREATE TABLE transactions (
    hash TEXT PRIMARY KEY,
    block_height BIGINT NOT NULL,
    sender TEXT,
    receiver TEXT,
    amount BIGINT,
    fee BIGINT,
    status TEXT,
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (block_height) REFERENCES blocks(height)
);
```

### Validators Table
```sql
CREATE TABLE validators (
    address TEXT PRIMARY KEY,
    moniker TEXT,
    voting_power BIGINT,
    commission DOUBLE PRECISION,
    uptime DOUBLE PRECISION,
    jailed BOOLEAN,
    rewards BIGINT DEFAULT 0,
    missed_blocks BIGINT DEFAULT 0,
    produced_blocks BIGINT DEFAULT 0,
    slash_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running
```bash
sudo systemctl status postgresql  # Linux
brew services list               # macOS
```

### RPC Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:26657
```
**Solution:** Ensure Mallchain node is running on port 26657

### Indexer Getting Stuck
```
⏳ Waiting for new blocks...
```
**Solution:** Node might be out of sync. Check node status with:
```bash
curl http://localhost:26657/status
```

### Database Already Initialized
```
Error: relation "blocks" already exists
```
**Solution:** Drop and recreate database
```bash
psql -U postgres
DROP DATABASE mallscan;
CREATE DATABASE mallscan;
\q
npm run init-db
```

## Performance Optimization

### 1. Index Optimization
The database is pre-configured with indexes for common queries:
- Block height (DESC)
- Validator voting power (DESC)
- Transaction sender/receiver
- Timestamp queries

### 2. Connection Pooling
The database connection uses pooling to handle concurrent requests efficiently.

### 3. Socket.io Subscriptions
Clients only receive updates for data they subscribe to, reducing bandwidth.

### 4. API Response Caching
Consider adding Redis for caching expensive queries:
```bash
npm install redis
```

## Production Deployment

### Environment Variables
Set these in production:
```bash
NODE_ENV=production
DB_USER=prod_user
DB_PASSWORD=secure_password
DB_HOST=db.example.com
RPC_URL=https://rpc.mallchain.com
EXPLORER_API_PORT=5000
FRONTEND_URL=https://explorer.mallchain.com
```

### Docker Deployment
```dockerfile
FROM node:18

WORKDIR /app

COPY explorer/backend/package.json .
RUN npm install --only=production

COPY explorer/backend . .

EXPOSE 5000

CMD ["npm", "start"]
```

### Nginx Configuration
```nginx
server {
    listen 443 ssl;
    server_name explorer.mallchain.com;

    location /api {
        proxy_pass http://localhost:5000;
    }

    location / {
        proxy_pass http://localhost:5173;
    }
}
```

## Monitoring

### Check Indexer Progress
```bash
curl http://localhost:5000/api/explorer/stats
```

### Monitor Database Size
```bash
psql -U mallscan -d mallscan -c "SELECT * FROM pg_stat_user_tables;"
```

### View Active Connections
```bash
psql -U mallscan -d mallscan -c "SELECT * FROM pg_stat_activity;"
```

## Future Enhancements

- [ ] GraphQL API for explorer data
- [ ] Advanced analytics dashboard
- [ ] Validator slashing detection
- [ ] Governance proposal indexing
- [ ] Treasury distribution tracking
- [ ] Mobile app support
- [ ] Multi-language support
- [ ] Dark/Light mode toggle
- [ ] Custom alerts and notifications
- [ ] Export functionality (CSV, JSON)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review database logs: `tail -f /var/log/postgresql/postgresql.log`
3. Check application logs in terminal
4. Open an issue on GitHub

## License

MIT
