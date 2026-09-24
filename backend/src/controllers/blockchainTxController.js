const axios = require('axios');

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317';
const CHAIN_RPC = process.env.CHAIN_RPC || 'http://127.0.0.1:26657';
const Tx = require('../models/transaction');

/**
 * Get all transactions from blockchain
 * Uses RPC tx_search which is more reliable than REST for Cosmos SDK v0.38+
 * Query params: page, limit, order_by
 */
exports.getAllBlockchainTxs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const orderBy = req.query.order_by || 'desc';

    console.log(`[BLOCKCHAIN] Fetching transactions: page=${page}, limit=${limit}`);

    // Use RPC tx_search instead of REST (more reliable for Cosmos SDK v0.38+)
    const perPage = limit;
    const rpcPage = orderBy === 'desc' ? page : page; // RPC doesn't support order_by directly
    const url = `${CHAIN_RPC}/tx_search?query="tx.height>0"&per_page=${perPage}&page=${rpcPage}`;

    const response = await axios.get(url, { timeout: 8000 }).catch(() => null);
    if (!response) {
      return res.json({
        transactions: [],
        pagination: { total: 0, page, limit, pages: 0 }
      });
    }

    const { total_count, txs } = response.data.result || {};

    // Process transactions from RPC format
    const processedTxs = (txs || []).map(tx => {
      const txResult = tx.tx_result || {};
      const txData = tx.tx || {};

      // Try to decode transaction messages
      let messages = [];
      let memo = '';
      try {
        // tx.data is base64 encoded Tx protobuf
        // For now, extract what we can from the raw data
        messages = txData.body?.messages || [];
        memo = txData.body?.memo || '';
      } catch (e) {
        // Ignore decode errors
      }

      return {
        txHash: tx.hash || '',
        height: parseInt(tx.height) || 0,
        timestamp: txResult.timestamp || new Date().toISOString(),
        gas_used: parseInt(txResult.gas_used) || 0,
        gas_wanted: parseInt(txResult.gas_wanted) || 0,
        code: parseInt(txResult.code) || 0,
        memo,
        messages,
        success: parseInt(txResult.code) === 0
      };
    });

    // Sort by height if needed (RPC returns in block order)
    if (orderBy === 'desc') {
      processedTxs.sort((a, b) => b.height - a.height);
    }

    res.json({
      transactions: processedTxs,
      pagination: {
        total: parseInt(total_count) || 0,
        page,
        limit,
        pages: Math.ceil((parseInt(total_count) || 0) / limit)
      }
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Error fetching transactions:', e.message);
    res.json({
      transactions: [],
      pagination: { total: 0, page: 1, limit: 50, pages: 0 }
    });
  }
};

/**
 * Get blockchain transaction by hash
 */
exports.getBlockchainTx = async (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) return res.status(400).json({ error: 'hash required' });

    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs/${hash}`;
    const response = await axios.get(url);
    const tx = response.data;

    res.json({
      txHash: tx.txhash,
      height: tx.height,
      timestamp: tx.timestamp,
      gas_used: tx.gas_used,
      gas_wanted: tx.gas_wanted,
      code: tx.code,
      codespace: tx.codespace,
      memo: tx.memo,
      messages: tx.body?.messages || [],
      signatures: tx.signatures || [],
      raw: tx
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Error fetching tx:', e.message);
    if (e.response?.status === 404) {
      return res.status(404).json({ error: 'transaction_not_found' });
    }
    // Return empty tx on error instead of 500
    res.json({
      txHash: '',
      height: 0,
      timestamp: '',
      gas_used: 0,
      gas_wanted: 0,
      code: -1,
      codespace: '',
      memo: '',
      messages: [],
      signatures: [],
      raw: {}
    });
  }
};

/**
 * Get blockchain transactions for a specific address
 * Uses RPC tx_search with proper event filters for Cosmos SDK v0.38+
 * Query params: address, page, limit
 */
exports.getAddressBlockchainTxs = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    console.log(`[BLOCKCHAIN] Fetching txs for address: ${address.slice(0, 15)}...`);

    // CometBFT tx_search doesn't support OR queries, so we query sender and recipient separately
    // and merge/deduplicate the results
    const senderQuery = `transfer.sender='${address}'`;
    const recipientQuery = `transfer.recipient='${address}'`;

    const [senderRes, recipientRes] = await Promise.all([
      axios.get(`${CHAIN_RPC}/tx_search?query="${senderQuery}"&per_page=${limit}&page=${page}`, { timeout: 8000 }).catch(() => null),
      axios.get(`${CHAIN_RPC}/tx_search?query="${recipientQuery}"&per_page=${limit}&page=${page}`, { timeout: 8000 }).catch(() => null)
    ]);

    if (!senderRes && !recipientRes) {
      return res.json({
        address,
        transactions: [],
        pagination: { total: 0, page, limit, pages: 0 }
      });
    }

    // Merge and deduplicate by tx hash
    const senderTxs = senderRes?.data?.result?.txs || [];
    const recipientTxs = recipientRes?.data?.result?.txs || [];
    const senderTotal = parseInt(senderRes?.data?.result?.total_count) || 0;
    const recipientTotal = parseInt(recipientRes?.data?.result?.total_count) || 0;

    const txMap = new Map();
    [...senderTxs, ...recipientTxs].forEach(tx => {
      if (!txMap.has(tx.hash)) {
        txMap.set(tx.hash, tx);
      }
    });

    const mergedTxs = Array.from(txMap.values());
    const totalCount = senderTotal + recipientTotal; // Approximate (may double-count)

    const processedTxs = mergedTxs.map(tx => {
      const txResult = tx.tx_result || {};
      const txData = tx.tx || {};

      // Extract transfer events
      const transfers = [];
      const events = txResult.events || [];
      for (const event of events) {
        if (event.type === 'transfer') {
          const attrs = {};
          for (const attr of event.attributes || []) {
            attrs[attr.key] = attr.value;
          }
          if (attrs.sender && attrs.recipient) {
            transfers.push({
              from: attrs.sender,
              to: attrs.recipient,
              amount: attrs.amount
            });
          }
        }
      }

      return {
        txHash: tx.hash || '',
        height: parseInt(tx.height) || 0,
        timestamp: txResult.timestamp || new Date().toISOString(),
        gas_used: parseInt(txResult.gas_used) || 0,
        gas_wanted: parseInt(txResult.gas_wanted) || 0,
        code: parseInt(txResult.code) || 0,
        success: parseInt(txResult.code) === 0,
        transfers,
        messages: txData.body?.messages || []
      };
    });

    res.json({
      address,
      transactions: processedTxs,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Error fetching address txs:', e.message);
    const address = req.query.address || '';
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.json({
      address,
      transactions: [],
      pagination: { total: 0, page, limit, pages: 0 }
    });
  }
};

/**
 * Get blockchain balance for an address
 */
exports.getAddressBalance = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });

    const url = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`;
    const response = await axios.get(url);
    const { balances } = response.data;

    res.json({
      address,
      balances: balances || [],
      total: balances?.reduce((sum, b) => sum + (parseInt(b.amount) || 0), 0) || 0
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Error fetching balance:', e.message);
    if (e.response?.status === 404) {
      return res.json({ address, balances: [] });
    }
    res.status(500).json({ error: 'failed_to_fetch_balance', detail: e.message });
  }
};

/**
 * Get recent blocks
 * Query params: page, limit
 */
exports.getRecentBlocks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    // Was calling /blocks? (no block identifier) — not a real Cosmos SDK
    // REST route, and the chain gateway correctly 501s it, which then
    // surfaced here as a 500. /blocks/latest is the real "current block"
    // endpoint; confirmed directly against the chain before changing this.
    const url = `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`;
    const response = await axios.get(url);
    const { block, block_id } = response.data;

    if (!block) {
      return res.json({
        blocks: [],
        error: 'no_blocks_found'
      });
    }

    res.json({
      block: {
        height: block.header.height,
        timestamp: block.header.time,
        proposer: block.header.proposer_address,
        txCount: block.data?.txs?.length || 0,
        validatorHash: block.header.validators_hash,
        nextValidatorHash: block.header.next_validators_hash,
        consensusHash: block.header.consensus_hash
      },
      txCount: block.data?.txs?.length || 0
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Error fetching blocks:', e.message);
    res.status(500).json({ error: 'failed_to_fetch_blocks', detail: e.message });
  }
};

/**
 * Sync blockchain transactions with database
 * This finds blockchain txs that aren't yet in the database and adds them
 */
exports.syncBlockchainTxs = async (req, res) => {
  try {
    console.log('[BLOCKCHAIN] Starting sync...');
    
    // Fetch recent blockchain transactions
    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?pagination.limit=100&order_by=desc`;
    const response = await axios.get(url);
    const blockchainTxs = response.data.txs || [];

    let synced = 0;
    let skipped = 0;

    // Check each blockchain tx
    for (const bTx of blockchainTxs) {
      const existingTx = await Tx.findOne({ txHash: bTx.txhash });
      
      if (!existingTx) {
        // Extract transfer info if available
        const transfers = [];
        (bTx.body?.messages || []).forEach(msg => {
          if (msg['@type']?.includes('Transfer')) {
            transfers.push({
              from: msg.sender || msg.from_address,
              to: msg.recipient || msg.to_address,
              amount: msg.amount
            });
          }
        });

        // Create new record from blockchain tx
        if (transfers.length > 0) {
          const transfer = transfers[0];
          await Tx.create({
            from: transfer.from,
            to: transfer.to,
            amount: transfer.amount?.amount || 0,
            txHash: bTx.txhash,
            status: bTx.code === 0 ? 'confirmed' : 'failed',
            blockHeight: bTx.height,
            gasUsed: bTx.gas_used,
            timestamp: new Date(bTx.timestamp).getTime(),
            confirmedAt: new Date(bTx.timestamp),
            type: 'transfer',
            metadata: { synced_from_blockchain: true }
          });
          synced++;
        }
      } else {
        skipped++;
      }
    }

    console.log(`[BLOCKCHAIN] Sync complete: ${synced} new, ${skipped} existing`);
    
    res.json({
      status: 'sync_complete',
      synced,
      skipped,
      total: blockchainTxs.length
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Sync error:', e.message);
    res.status(500).json({ error: 'sync_failed', detail: e.message });
  }
};

/**
 * Get blockchain stats
 */
exports.getBlockchainStats = async (req, res) => {
  try {
    // Get latest block info
    const blockUrl = `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`;
    const blockRes = await axios.get(blockUrl).catch(() => ({}));

    // Get node status - response has data under default_node_info
    const statusUrl = `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/node_info`;
    const statusRes = await axios.get(statusUrl).catch(() => ({}));

    const latestBlock = blockRes.data?.block;
    const nodeInfo = statusRes.data?.default_node_info;

    res.json({
      chain: nodeInfo?.network || 'unknown',
      latestHeight: latestBlock?.header?.height || 0,
      latestTime: latestBlock?.header?.time || null,
      txCount: latestBlock?.data?.txs?.length || 0,
      moniker: nodeInfo?.moniker || 'unknown'
    });
  } catch (e) {
    console.error('[BLOCKCHAIN] Stats error:', e.message);
    res.json({
      chain: 'unknown',
      latestHeight: 0,
      latestTime: null,
      txCount: 0,
      moniker: 'unknown'
    });
  }
};
