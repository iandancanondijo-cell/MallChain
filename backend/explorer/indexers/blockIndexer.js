const axios = require('axios');
const db = require('../db');

const RPC = process.env.RPC_URL || 'http://localhost:26657';

async function indexBlock(height) {
  try {
    // Fetch block data from RPC
    const blockResponse = await axios.get(`${RPC}/block?height=${height}`);
    const blockData = blockResponse.data.result;
    
    if (!blockData) {
      console.log(`No block data for height ${height}`);
      return;
    }

    const block = blockData.block;
    const blockId = blockData.block_id;

    // Insert block into database
    await db.query(
      `
      INSERT INTO blocks (
        height,
        hash,
        proposer,
        tx_count,
        timestamp
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (height) DO NOTHING
      `,
      [
        height,
        blockId.hash,
        block.header.proposer_address,
        block.data.txs ? block.data.txs.length : 0,
        new Date(block.header.time)
      ]
    );

    console.log(`✓ Indexed block ${height}`);
    return true;
  } catch (err) {
    console.error(`✗ Error indexing block ${height}:`, err.message);
    return false;
  }
}

module.exports = indexBlock;
