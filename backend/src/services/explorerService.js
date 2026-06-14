const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const RPC = config.chain.rpc.replace(/\/$/, '');

function formatTimes(isoString) {
  if (!isoString) {
    return { iso: null, unix: null, utc: null, local: null };
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return { iso: isoString, unix: null, utc: null, local: null };
  }
  return {
    iso: date.toISOString(),
    unix: Math.floor(date.getTime() / 1000),
    utc: date.toUTCString(),
    local: date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZoneName: 'short',
    }),
  };
}

function decodeHash(b64OrHex) {
  if (!b64OrHex) return null;
  if (/^[0-9A-Fa-f]+$/.test(b64OrHex) && b64OrHex.length === 64) {
    return b64OrHex.toUpperCase();
  }
  try {
    return Buffer.from(b64OrHex, 'base64').toString('hex').toUpperCase();
  } catch {
    return b64OrHex;
  }
}

/**
 * Normalize Cosmos REST block into explorer-friendly shape.
 * Canonical block time is header.time (BFT time for this height).
 */
function normalizeRestBlock(data) {
  const block = data?.block;
  const blockId = data?.block_id;
  const header = block?.header || {};
  const height = header.height || '0';
  const time = formatTimes(header.time);

  const txs = block?.data?.txs || [];
  const lastCommit = block?.last_commit || {};

  return {
    height: Number(height),
    hash: decodeHash(blockId?.hash),
    chainId: header.chain_id,
    blockTime: time,
    proposer: header.proposer_address,
    txCount: txs.length,
    transactions: txs.map((tx, i) => ({
      index: i,
      rawLength: typeof tx === 'string' ? tx.length : 0,
    })),
    lastCommit: {
      note: 'Commits included in this block header are for the previous height.',
      height: Number(lastCommit.height || 0),
      round: lastCommit.round ?? 0,
      blockHash: decodeHash(lastCommit.block_id?.hash),
      signatureCount: (lastCommit.signatures || []).length,
    },
    header: {
      appHash: header.app_hash,
      dataHash: header.data_hash,
      validatorsHash: header.validators_hash,
    },
  };
}

/**
 * Normalize Cosmos REST tx response.
 */
function normalizeRestTx(data) {
  const tx = data?.tx_response || data;
  const time = formatTimes(tx.timestamp || tx.tx_response?.timestamp);

  return {
    txHash: (tx.txhash || tx.hash || '').toUpperCase(),
    height: Number(tx.height || 0),
    time,
    code: tx.code ?? 0,
    success: (tx.code ?? 0) === 0,
    gasUsed: tx.gas_used,
    gasWanted: tx.gas_wanted,
    codespace: tx.codespace || '',
    memo: tx.tx?.body?.memo || tx.body?.memo || '',
    messageCount: (tx.tx?.body?.messages || tx.body?.messages || []).length,
    rawLog: tx.raw_log || '',
  };
}

async function fetchBlockFromRest(height) {
  const url =
    height === 'latest'
      ? `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`
      : `${CHAIN_REST}/cosmos/base/tendermint/v1beta1/blocks/${height}`;
  const response = await axios.get(url, { timeout: 10000 });
  return normalizeRestBlock(response.data);
}

async function fetchBlockFromRpc(height) {
  const path =
    height === 'latest' ? `${RPC}/block` : `${RPC}/block?height=${height}`;
  const response = await axios.get(path, { timeout: 10000 });
  const result = response.data?.result;
  if (!result?.block) {
    throw new Error('block_not_found');
  }
  const header = result.block.header;
  const time = formatTimes(header.time);
  const txs = result.block.data?.txs || [];
  const lastCommit = result.block.last_commit || {};

  return {
    height: Number(header.height),
    hash: result.block_id?.hash || null,
    chainId: header.chain_id,
    blockTime: time,
    proposer: header.proposer_address,
    txCount: txs.length,
    transactions: txs.map((tx, i) => ({
      index: i,
      rawLength: typeof tx === 'string' ? tx.length : 0,
    })),
    lastCommit: {
      note: 'Commits included in this block header are for the previous height.',
      height: Number(lastCommit.height || 0),
      round: lastCommit.round ?? 0,
      blockHash: lastCommit.block_id?.hash || null,
      signatureCount: (lastCommit.signatures || []).length,
    },
    header: {
      appHash: header.app_hash,
      dataHash: header.data_hash,
    },
    source: 'rpc',
  };
}

async function getBlock(heightParam) {
  const height =
    heightParam === 'latest' ? 'latest' : String(parseInt(heightParam, 10));
  if (height !== 'latest' && (!height || height === 'NaN' || Number(height) < 0)) {
    const err = new Error('invalid_block_height');
    err.status = 400;
    throw err;
  }

  try {
    const block = await fetchBlockFromRest(height);
    return { success: true, block, source: 'rest' };
  } catch (restErr) {
    try {
      const block = await fetchBlockFromRpc(height);
      return { success: true, block, source: 'rpc' };
    } catch (rpcErr) {
      const err = new Error('block_not_found');
      err.status = 404;
      err.details = rpcErr.message || restErr.message;
      throw err;
    }
  }
}

async function getTransaction(hashParam) {
  const hash = String(hashParam || '')
    .replace(/^0x/i, '')
    .toUpperCase();
  if (!hash || hash.length < 8) {
    const err = new Error('invalid_tx_hash');
    err.status = 400;
    throw err;
  }

  try {
    const url = `${CHAIN_REST}/cosmos/tx/v1beta1/txs/${hash}`;
    const response = await axios.get(url, { timeout: 10000 });
    return {
      success: true,
      transaction: normalizeRestTx(response.data),
      source: 'rest',
    };
  } catch (restErr) {
    if (restErr.response?.status === 404) {
      const err = new Error('transaction_not_found');
      err.status = 404;
      throw err;
    }
    try {
      const response = await axios.get(`${RPC}/tx?hash=0x${hash}`, {
        timeout: 10000,
      });
      const result = response.data?.result;
      if (!result) {
        const err = new Error('transaction_not_found');
        err.status = 404;
        throw err;
      }
      const time = formatTimes(result.timestamp);
      return {
        success: true,
        transaction: {
          txHash: hash,
          height: Number(result.height || 0),
          time,
          code: result.tx_result?.code ?? 0,
          success: (result.tx_result?.code ?? 0) === 0,
          gasUsed: result.tx_result?.gas_used,
          gasWanted: result.tx_result?.gas_wanted,
          codespace: result.tx_result?.codespace || '',
          memo: '',
          messageCount: 0,
          rawLog: result.tx_result?.log || '',
        },
        source: 'rpc',
      };
    } catch (rpcErr) {
      const err = new Error('transaction_not_found');
      err.status = 404;
      err.details = rpcErr.message || restErr.message;
      throw err;
    }
  }
}

async function getLatest() {
  const statusRes = await axios.get(`${RPC}/status`, { timeout: 8000 });
  const sync = statusRes.data?.result?.sync_info || {};
  const time = formatTimes(sync.latest_block_time);

  let block = null;
  try {
    const result = await getBlock('latest');
    block = result.block;
  } catch {
    // status-only fallback
  }

  return {
    success: true,
    latestBlock: Number(sync.latest_block_height || 0),
    latestHash: sync.latest_block_hash,
    latestBlockTime: time,
    catchingUp: Boolean(sync.catching_up),
    chainId: sync.chain_id || config.chain.id,
    block,
  };
}

module.exports = {
  getBlock,
  getTransaction,
  getLatest,
  formatTimes,
};
