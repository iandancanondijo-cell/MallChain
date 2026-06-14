const axios = require('axios');

const RPC = process.env.COSMOS_RPC || process.env.CHAIN_RPC || 'http://localhost:26657';

let latestHeight = 0;
let isPolling = false;

/**
 * Poll for new blocks on the blockchain
 */
async function pollBlocks() {
  if (isPolling) return;
  isPolling = true;

  try {
    const status = await axios.get(`${RPC}/status`, { timeout: 5000 });

    const currentHeight = Number(
      status.data.result.sync_info.latest_block_height
    );

    if (currentHeight > latestHeight) {
      for (let h = latestHeight + 1; h <= currentHeight; h++) {
        await processBlock(h);
      }

      latestHeight = currentHeight;
    }
  } catch (error) {
    console.error('Block poll error:', error.message);
  } finally {
    isPolling = false;
  }
}

/**
 * Process a single block and extract transactions
 */
async function processBlock(height) {
  try {
    const blockRes = await axios.get(
      `${RPC}/block?height=${height}`,
      { timeout: 5000 }
    );

    const block = blockRes.data.result;
    const blockHash = block.block_id.hash;
    const numTxs = block.block.data.txs ? block.block.data.txs.length : 0;

    // Emit block:new event
    if (global.io) {
      global.io.emit('block:new', {
        height,
        hash: blockHash,
        timestamp: block.block.header.time,
        txCount: numTxs
      });

      console.log(`📦 New block #${height} with ${numTxs} transactions`);
    }

    // Process transactions in the block
    if (numTxs > 0) {
      await processTxsInBlock(height, block.block.data.txs);
    }
  } catch (error) {
    console.error(`Error processing block ${height}:`, error.message);
  }
}

/**
 * Process transactions in a block
 */
async function processTxsInBlock(height, txs) {
  try {
    // Get transaction results
    const blockResultsRes = await axios.get(
      `${RPC}/block_results?height=${height}`,
      { timeout: 5000 }
    );

    const results = blockResultsRes.data.result.txs_results || [];

    txs.forEach((txData, idx) => {
      const result = results[idx];

      if (global.io) {
        global.io.emit('tx:confirmed', {
          height,
          index: idx,
          code: result.code,
          log: result.log,
          timestamp: new Date().toISOString()
        });
      }
    });
  } catch (error) {
    console.error('Error processing txs in block:', error.message);
  }
}

/**
 * Start the blockchain event listener
 */
function startBlockListener() {
  console.log('🚀 Starting blockchain event listener...');
  
  // Initial poll
  pollBlocks();
  
  // Poll every 3 seconds
  const interval = setInterval(pollBlocks, 3000);

  return () => clearInterval(interval);
}

module.exports = {
  startBlockListener,
  pollBlocks,
  processBlock
};
