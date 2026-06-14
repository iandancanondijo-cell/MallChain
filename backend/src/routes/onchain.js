const express = require('express');
const router = express.Router();
const axios = require('axios');

const CHAIN_RPC = process.env.CHAIN_RPC || 'http://localhost:26657';
const CHAIN_REST = process.env.CHAIN_REST || 'http://localhost:1317';

/**
 * GET /api/onchain/market/price
 * Fetch current market price from blockchain
 */
router.get('/market/price', async (req, res) => {
  try {
    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`;
    const response = await axios.get(url, { timeout: 3000 });
    const data = response.data || {};
    const mp = data.market_price || {};

    // On-chain prices are scaled by 100 (e.g., 39 = 0.39 KES)
    const buyPrice = Number(mp.buy_price) / 100;
    const sellPrice = Number(mp.sell_price) / 100;
    const midPrice = (buyPrice + sellPrice) / 2;

    return res.json({
      success: true,
      market_price: {
        buy_price: buyPrice,
        sell_price: sellPrice,
        mid: midPrice,
        total_buy_volume: Number(mp.total_buy_volume || 0),
        total_sell_volume: Number(mp.total_sell_volume || 0)
      },
      source: 'blockchain'
    });
  } catch (e) {
    console.error('[OnChain Market Price]', e.message);
    // Fallback prices
    return res.json({
      success: true,
      market_price: {
        buy_price: 0.40,
        sell_price: 0.38,
        mid: 0.39,
        total_buy_volume: 0,
        total_sell_volume: 0
      },
      source: 'fallback',
      error: e.message
    });
  }
});

/**
 * GET /api/onchain/trades/:address
 * Fetch trade history for an address
 */
router.get('/trades/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Address required' });
    }

    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/trades/${address}`;
    const response = await axios.get(url, { timeout: 3000 });
    const data = response.data || {};

    return res.json({
      success: true,
      trades: data.trades || [],
      address
    });
  } catch (e) {
    console.error('[OnChain Trade History]', e.message);
    return res.json({
      success: true,
      trades: [],
      address: req.params.address,
      error: e.message
    });
  }
});

/**
 * GET /api/onchain/wallet/:address/balance
 * Fetch wallet balance from blockchain
 */
router.get('/wallet/:address/balance', async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Address required' });
    }

    const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/bank/v1beta1/balances/${address}`;
    const response = await axios.get(url, { timeout: 3000 });
    const data = response.data || {};

    let mlcBalance = 0;
    const balances = data.balances || [];
    const mlcBalObj = balances.find(b => b.denom === 'mlc');
    if (mlcBalObj) {
      mlcBalance = Number(mlcBalObj.amount);
    }

    return res.json({
      success: true,
      address,
      balance: mlcBalance,
      denom: 'mlc',
      source: 'blockchain'
    });
  } catch (e) {
    console.error('[OnChain Wallet Balance]', e.message);
    return res.json({
      success: true,
      address: req.params.address,
      balance: 0,
      denom: 'mlc',
      source: 'fallback',
      error: e.message
    });
  }
});

/**
 * POST /api/onchain/broadcast
 * Broadcast a signed transaction to the chain
 * Body: { tx: base64_encoded_signed_transaction }
 */
router.post('/broadcast', async (req, res) => {
  try {
    const { tx } = req.body;
    if (!tx) {
      return res.status(400).json({ error: 'Signed transaction required' });
    }

    // Broadcast via REST SDK endpoint
    const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`;
    const response = await axios.post(url, {
      tx_bytes: tx,
      mode: 'BROADCAST_MODE_SYNC' // or BROADCAST_MODE_BLOCK for confirmation
    }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data || {};

    return res.json({
      success: true,
      tx_response: data.tx_response || {},
      txHash: data.tx_response?.txhash || '',
      code: data.tx_response?.code,
      rawLog: data.tx_response?.raw_log
    });
  } catch (e) {
    console.error('[OnChain Broadcast]', e.message);
    return res.status(400).json({
      success: false,
      error: e.message,
      details: e.response?.data
    });
  }
});

/**
 * GET /api/onchain/tx/:txHash
 * Query transaction status by hash
 */
router.get('/tx/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required' });
    }

    const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs/${txHash}`;
    const response = await axios.get(url, { timeout: 3000 });
    const data = response.data || {};

    return res.json({
      success: true,
      tx_response: data.tx_response || {},
      code: data.tx_response?.code,
      status: data.tx_response?.code === 0 ? 'success' : 'failed'
    });
  } catch (e) {
    console.error('[OnChain Tx Query]', e.message);
    return res.status(400).json({
      success: false,
      error: e.message
    });
  }
});

module.exports = router;
