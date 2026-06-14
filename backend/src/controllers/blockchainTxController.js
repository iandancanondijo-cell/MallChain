const axios = require('axios');

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317';
const Tx = require('../models/transaction');

/**
 * Get all transactions from blockchain
 * Query params: page, limit, order_by
 */
exports.getAllBlockchainTxs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const orderBy = req.query.order_by || 'desc'; // asc or desc

    console.log(`[BLOCKCHAIN] Fetching transactions: page=${page}, limit=${limit}`);

    // Query blockchain for transactions
    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?pagination.offset=${(page - 1) * limit}&pagination.limit=${limit}&order_by=${orderBy}`;
    
    const response = await axios.get(url, { timeout: 5000 }).catch(() => null);
    if (!response) {
      return res.json({
        transactions: [],
        pagination: { total: 0, page, limit, pages: 0 }
      });
    }

    const { txs, pagination } = response.data;

    // Process transactions
    const processedTxs = (txs || []).map(tx => ({
      txHash: tx.txhash,
      height: tx.height,
      timestamp: tx.timestamp,
      gas_used: tx.gas_used,
      gas_wanted: tx.gas_wanted,
      code: tx.code, // 0 = success
      memo: tx.memo,
      messages: tx.body?.messages || [],
      signers: tx.signatures?.map(s => s.public_key) || []
    }));

    res.json({
      transactions: processedTxs,
      pagination: {
        total: pagination?.total || 0,
        page,
        limit,
        pages: Math.ceil((pagination?.total || 0) / limit)
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
 * Query params: address, page, limit
 */
exports.getAddressBlockchainTxs = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    console.log(`[BLOCKCHAIN] Fetching txs for address: ${address.slice(0, 15)}...`);

    // Query by sender (events: message.sender)
    // This uses the Tendermint query syntax
    const query = encodeURIComponent(`message.sender='${address}'`);
    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs?events=${query}&pagination.offset=${(page - 1) * limit}&pagination.limit=${limit}`;

    const response = await axios.get(url);
    const { txs, pagination } = response.data;

    const processedTxs = (txs || []).map(tx => {
      // Try to extract transfer info from messages
      const transfers = [];
      (tx.body?.messages || []).forEach(msg => {
        if (msg['@type']?.includes('MsgSend') || msg['@type']?.includes('Transfer')) {
          transfers.push({
            from: msg.from_address || msg.sender,
            to: msg.to_address || msg.recipient,
            amount: msg.amount
          });
        }
      });

      return {
        txHash: tx.txhash,
        height: tx.height,
        timestamp: tx.timestamp,
        gas_used: tx.gas_used,
        code: tx.code,
        transfers,
        messages: tx.body?.messages || []
      };
    });

    res.json({
      address,
      transactions: processedTxs,
      pagination: {
        total: pagination?.total || 0,
        page,
        limit,
        pages: Math.ceil((pagination?.total || 0) / limit)
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

    const url = `${CHAIN_REST}/cosmos/bank/v1/balances/${address}`;
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

    const url = `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks?`;
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
