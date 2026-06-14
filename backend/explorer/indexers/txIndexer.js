const axios = require('axios');
const crypto = require('crypto');
const db = require('../db');

const RPC = process.env.RPC_URL || 'http://localhost:26657';

function computeTxHash(base64Tx) {
  if (!base64Tx) return null;
  try {
    return crypto.createHash('sha256').update(Buffer.from(base64Tx, 'base64')).digest('hex');
  } catch (err) {
    console.warn('Unable to compute tx hash:', err.message);
    return null;
  }
}

async function indexTransactions(height) {
  try {
    const blockResponse = await axios.get(`${RPC}/block?height=${height}`);
    const block = blockResponse.data.result.block;

    if (!block || !block.data || !block.data.txs || block.data.txs.length === 0) {
      console.log(`No transactions in block ${height}`);
      return true;
    }

    const txResultsResponse = await axios.get(`${RPC}/block_results?height=${height}`);
    const txResults = txResultsResponse.data.result.txs_results || [];

    for (let i = 0; i < block.data.txs.length; i++) {
      const rawTx = block.data.txs[i];
      const txResult = txResults[i] || {};
      const txHash = computeTxHash(rawTx) || `${height}-${i}`;

      try {
        await db.query(
          `
          INSERT INTO transactions (
            hash,
            block_height,
            sender,
            receiver,
            amount,
            fee,
            status,
            timestamp
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (hash) DO NOTHING
          `,
          [
            txHash,
            height,
            null,
            null,
            null,
            txResult.gas_used || 0,
            txResult.code === 0 ? 'success' : 'failed',
            new Date(block.header.time)
          ]
        );
      } catch (err) {
        console.error(`Error indexing transaction ${i} at height ${height}:`, err.message);
      }
    }

    console.log(`✓ Indexed ${block.data.txs.length} transactions from block ${height}`);
    return true;
  } catch (err) {
    console.error(`✗ Error indexing transactions for block ${height}:`, err.message);
    return false;
  }
}

module.exports = indexTransactions;
