require('dotenv').config();
const db = require('./db');

const schema = `
-- Blocks Table
CREATE TABLE IF NOT EXISTS blocks (
    height BIGINT PRIMARY KEY,
    hash TEXT UNIQUE NOT NULL,
    proposer TEXT,
    tx_count INT DEFAULT 0,
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
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

-- Validators Table
CREATE TABLE IF NOT EXISTS validators (
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

-- Treasury Snapshots Table
CREATE TABLE IF NOT EXISTS treasury_snapshots (
    id SERIAL PRIMARY KEY,
    total_supply BIGINT,
    circulating_supply BIGINT,
    burned_supply BIGINT,
    staked_supply BIGINT,
    treasury_balance BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Staking Events Table
CREATE TABLE IF NOT EXISTS staking_events (
    id SERIAL PRIMARY KEY,
    delegator TEXT,
    validator TEXT,
    amount BIGINT,
    action TEXT,
    block_height BIGINT,
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Governance Events Table
CREATE TABLE IF NOT EXISTS governance_events (
    id SERIAL PRIMARY KEY,
    proposal_id INT,
    title TEXT,
    status TEXT,
    voting_start_block INT,
    voting_end_block INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Validator Metrics Table
CREATE TABLE IF NOT EXISTS validator_metrics (
    id SERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    uptime DOUBLE PRECISION,
    missed_blocks BIGINT,
    produced_blocks BIGINT,
    rewards_earned BIGINT,
    slash_count INT,
    block_height BIGINT,
    timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (address) REFERENCES validators(address)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_sender ON transactions(sender);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions(receiver);
CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_validators_voting_power ON validators(voting_power DESC);
CREATE INDEX IF NOT EXISTS idx_staking_events_delegator ON staking_events(delegator);
CREATE INDEX IF NOT EXISTS idx_staking_events_validator ON staking_events(validator);
CREATE INDEX IF NOT EXISTS idx_validator_metrics_address ON validator_metrics(address);
CREATE INDEX IF NOT EXISTS idx_validator_metrics_timestamp ON validator_metrics(timestamp DESC);
`;

async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    await db.query(schema);
    console.log('✓ Database schema initialized successfully');
    process.exit(0);
  } catch (err) {
    console.error('✗ Failed to initialize database:', err);
    process.exit(1);
  }
}

initializeDatabase();
