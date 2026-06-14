# Mallchain Explorer Quick Start Guide

This guide will get you up and running with the Mallchain Explorer in 15 minutes.

## Prerequisites Check

```bash
# Check Node.js version (must be 16+)
node --version

# Check npm version
npm --version

# Check PostgreSQL is installed
psql --version

# Check Mallchain RPC is running
curl http://localhost:26657/status
```

## Step-by-Step Installation

### 1. Setup PostgreSQL Database (5 minutes)

**On Linux/macOS:**
```bash
# Start PostgreSQL
sudo systemctl start postgresql  # Linux
# or
brew services start postgresql  # macOS

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE mallscan;
CREATE USER mallscan WITH PASSWORD 'mallscan';
ALTER ROLE mallscan SET client_encoding TO 'utf8';
ALTER ROLE mallscan SET default_transaction_isolation TO 'read committed';
GRANT ALL PRIVILEGES ON DATABASE mallscan TO mallscan;
\q
EOF
```

**On Windows:**
- Download PostgreSQL installer from https://www.postgresql.org/download/windows/
- Run installer and set password for postgres user
- Start PostgreSQL service from Windows Services

### 2. Setup Explorer Backend (5 minutes)

```bash
# Navigate to explorer backend
cd explorer/backend

# Copy environment template
cp .env.example .env

# Install dependencies
npm install

# Initialize database schema
npm run init-db

# Expected output:
# Initializing database schema...
# ✓ Database schema initialized successfully
```

### 3. Start the Indexer

```bash
# In explorer/backend directory
npm run indexer
```

You should see:
```
🚀 Starting Mallchain Indexer...
📡 RPC URL: http://localhost:26657
📍 Starting from block 1
✓ Indexed block 1
✓ Indexed 0 transactions from block 1
✓ Indexed 21 validators
...
```

**Leave this terminal running.**

### 4. Start the Explorer API (New Terminal)

```bash
# In explorer/backend directory
npm run api
```

You should see:
```
🚀 Explorer API server running on port 5000
```

**Leave this terminal running.**

### 5. Configure Frontend (New Terminal)

```bash
# From project root
cd frontend

# Add socket.io-client if not already installed
npm install socket.io-client

# Start development server
npm run dev
```

### 6. Access the Explorer

Open your browser and navigate to: **http://localhost:5173**

## Testing the Explorer

### Test Block Explorer
1. Navigate to `/explorer/blocks`
2. You should see indexed blocks in the table
3. Click on any block to view details

### Test Validators
1. Navigate to `/explorer/validators`
2. You should see a list of active validators
3. Click on a validator to see uptime chart

### Test Statistics Dashboard
1. Navigate to `/explorer/stats`
2. You should see real-time chain statistics
3. Charts should show block trends and transaction data

### Test Search
1. Use the search bar to find:
   - Block height: `1`, `2`, `100`
   - Transaction hash: (from transaction list)
   - Validator address: (from validator list)

## Verify Installation

### Check Database Connection
```bash
# From explorer/backend
psql -U mallscan -d mallscan -c "SELECT COUNT(*) as blocks FROM blocks;"
```

Expected output:
```
 blocks
--------
   1000
(1 row)
```

### Check API Status
```bash
curl http://localhost:5000/health
```

Expected output:
```json
{"status":"ok","service":"explorer-api"}
```

### Check Indexer Progress
```bash
curl http://localhost:5000/api/explorer/stats
```

## Troubleshooting

### Indexer won't start
```
Error: connect ECONNREFUSED 127.0.0.1:26657
```
- Ensure Mallchain RPC is running on localhost:26657
- Check: `curl http://localhost:26657/status`

### Database error during init-db
```
Error: database "mallscan" does not exist
```
- Run the PostgreSQL setup commands again
- Verify PostgreSQL is running

### API won't start
```
Error: listen EADDRINUSE :::5000
```
- Port 5000 is already in use
- Change `EXPLORER_API_PORT` in `.env`
- Or kill process: `lsof -ti:5000 | xargs kill -9`

### Frontend shows "API connection refused"
- Ensure Explorer API is running on port 5000
- Check `FRONTEND_URL` matches your setup
- Check browser console for CORS errors

## Running Everything at Once

Once everything is working, you can use this single command:

```bash
# From explorer/backend
npm run all
```

This runs both the indexer and API concurrently (requires `concurrently` package).

## What's Indexed

The explorer indexes:
- ✓ All blocks with metadata
- ✓ All transactions with status
- ✓ All validators with voting power
- ✓ Validator uptime and slashing info
- ✓ Staking events
- ✓ Governance proposals
- ✓ Treasury snapshots

## Database Size Expectations

- 1,000 blocks: ~5 MB
- 10,000 blocks: ~50 MB
- 100,000 blocks: ~500 MB
- 1,000,000 blocks: ~5 GB

Monitor with: `du -sh /var/lib/postgresql/`

## Next Steps

After verification:

1. **Production Deployment**
   - Use Docker for containerization
   - Use Nginx as reverse proxy
   - Configure SSL/TLS certificates

2. **Performance Tuning**
   - Add Redis for caching
   - Optimize PostgreSQL with `postgresql.conf`
   - Implement read replicas for analytics

3. **Feature Expansion**
   - Add GraphQL API
   - Build mobile app
   - Add AI analytics
   - Integrate with exchanges

## Common Questions

**Q: How much storage do I need?**
A: ~5GB for 1 million blocks. Most chains have 1-10 million blocks initially.

**Q: Can I restart the indexer safely?**
A: Yes. It tracks the last indexed block and resumes from there.

**Q: How do I backup the explorer data?**
A: Use PostgreSQL dump:
```bash
pg_dump mallscan > backup.sql
```

**Q: Can multiple indexers run?**
A: No, use a single indexer with database locks to prevent conflicts.

**Q: How do I add authentication?**
A: Implement JWT middleware in Express routes.

## Support

- Check README.md for detailed documentation
- Review logs in terminal windows
- Check browser console (F12) for frontend errors
- Check PostgreSQL logs: `tail -f /var/log/postgresql/postgresql.log`

## Success Indicator

You know everything is working when:
1. ✓ Indexer shows "✓ Indexed block X"
2. ✓ API returns data from `/api/explorer/stats`
3. ✓ Frontend loads at `http://localhost:5173`
4. ✓ Search finds blocks and validators
5. ✓ Validators list updates periodically
