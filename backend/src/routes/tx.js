const express = require('express');
const router = express.Router();
const txCtrl = require('../controllers/txController');
const auth = require('../middleware/auth');

router.get('/', auth, txCtrl.list);
router.get('/:id', auth, txCtrl.get);
// Relay signed txs (authenticated endpoint)
router.post('/relay', auth, txCtrl.relay);

// Authenticated create
router.post('/', auth, txCtrl.create);

// ---- Transactions history for frontend ----
// GET /api/tx/history?address=...&status=all|confirmed|pending|failed&page=1&limit=20
// This wraps on-chain history from /api/history/:address and normalizes the shape.
router.get('/history', async (req, res) => {
  try {
    const {
      address,
      status = 'all',
      page = '1',
      limit = '20',
    } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'address_required',
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const offset = (pageNum - 1) * limitNum;

    const chainRest = process.env.CHAIN_REST || process.env.MALL_CHAIN_REST || 'http://127.0.0.1:1317';
    const base = chainRest.replace(/\/$/, '');

    // Reuse backend on-chain query semantics similar to routes/history.js
    const url = `${base}/cosmos/tx/v1beta1/txs`;
    const events = [
      `message.sender='${address}'`,
      `transfer.recipient='${address}'`,
    ].join('&events=');

    const fullUrl = `${url}?events=${events}&order_by=ORDER_BY_DESC&pagination.offset=${offset}&pagination.limit=${limitNum}`;

    const axios = require('axios');
    const r = await axios.get(fullUrl, { timeout: 10000 });

    const latestBlockUrl = `${base}/cosmos/base/tendermint/v1beta1/blocks/latest`;
    const latestRes = await axios.get(latestBlockUrl, { timeout: 5000 }).catch(() => null);
    const latestHeight = Number(latestRes?.data?.block?.header?.height || 0);

    const txs = (r.data.txs || []).map((tx) => {
      const msg = tx.body && tx.body.messages && tx.body.messages[0] ? tx.body.messages[0] : {};
      const from = msg.from_address || msg.creator || '';
      const to = msg.to_address || msg.to || '';
      const amount = (msg.amount && msg.amount[0] && msg.amount[0].amount) || msg.amount || '';
      const txHash = tx.txhash || '';
      const timestamp = tx.timestamp || '';

      // Map Cosmos tx code to status when available; fallback to pending.
      const code = tx.code;
      const statusMapped = code === 0 || code === undefined ? 'confirmed' : 'failed';
      const pending = code === undefined;

      return {
        hash: txHash,
        from,
        to,
        amount,
        type: from === address ? 'send' : 'receive',
        status: pending ? 'pending' : statusMapped,
        timestamp,
        block: tx.height,
      };
    });

    const filtered = status === 'all' ? txs : txs.filter((t) => t.status === status);

    // Best-effort total: if pagination.total exists in response, use it; else approximate.
    const total = Number(r.data?.pagination?.total ?? filtered.length);

    res.json({
      success: true,
      transactions: filtered,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'history_fetch_failed',
      details: e && e.message ? e.message : String(e),
    });
  }
});

module.exports = router;

