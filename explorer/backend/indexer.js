require('dotenv').config();
const axios = require('axios');
const indexBlock = require('./indexers/blockIndexer');
const indexTransactions = require('./indexers/txIndexer');
const indexValidators = require('./indexers/validatorIndexer');
const { trackValidatorMetrics } = require('./indexers/validatorMetricsTracker');
const db = require('./db');

const RPC = process.env.RPC_URL || 'http://localhost:26657';
const EXPLORER_EMIT_API_URL = process.env.EXPLORER_EMIT_API_URL || 'http://localhost:5000/internal/emit';

async function emitExplorerEvent(endpoint, payload) {
  try {
    await axios.post(`${EXPLORER_EMIT_API_URL}/${endpoint}`, payload, {
      timeout: 3000,
    });
    return true;
  } catch (err) {
    console.warn(`Unable to emit explorer event ${endpoint}:`, err.message || err);
    return false;
  }
}

async function getLatestBlockHeight() {
  try {
    const response = await axios.get(`${RPC}/status`);
    return parseInt(response.data.result.sync_info.latest_block_height);
  } catch (err) {
    console.error('Error fetching latest block height:', err.message);
    return null;
  }
}

async function getLastIndexedHeight() {
  try {
    const result = await db.query(
      'SELECT MAX(height) as max_height FROM blocks'
    );
    const maxHeight = result.rows[0].max_height;
    return maxHeight ? parseInt(maxHeight) + 1 : 1;
  } catch (err) {
    console.error('Error fetching last indexed height:', err.message);
    return 1;
  }
}

async function start() {
  console.log('🚀 Starting Mallchain Indexer...');
  console.log(`📡 RPC URL: ${RPC}`);
  console.log(`📡 Explorer emit endpoint: ${EXPLORER_EMIT_API_URL}`);

  let startHeight = await getLastIndexedHeight();
  console.log(`📍 Starting from block ${startHeight}`);

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 10;

  while (true) {
    try {
      const latestHeight = await getLatestBlockHeight();
      
      if (!latestHeight) {
        console.warn('⚠️  Could not fetch latest block height');
        await new Promise(resolve => setTimeout(resolve, 5000));
        consecutiveErrors++;
        continue;
      }

      if (startHeight > latestHeight) {
        console.log('⏳ Waiting for new blocks...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      const blockIndexed = await indexBlock(startHeight);
      const txIndexed = await indexTransactions(startHeight);

      if (blockIndexed) {
        await emitExplorerEvent('new_block', { height: startHeight });
      }

      if (txIndexed) {
        await emitExplorerEvent('new_transactions', { blockHeight: startHeight });
      }

      if (startHeight % 20 === 0) {
        const validatorsUpdated = await indexValidators();
        if (validatorsUpdated) {
          await trackValidatorMetrics(startHeight);
          await emitExplorerEvent('validator_update', { blockHeight: startHeight });
        }
      }

      startHeight++;
      consecutiveErrors = 0;

    } catch (err) {
      console.error('❌ Indexing error:', err.message);
      consecutiveErrors++;

      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`❌ Too many consecutive errors (${maxConsecutiveErrors}). Exiting.`);
        process.exit(1);
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📛 Shutting down indexer...');
  await db.end();
  process.exit(0);
});

start().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
