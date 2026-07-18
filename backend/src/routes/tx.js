const express = require('express');
const router = express.Router();
const txCtrl = require('../controllers/txController');
const auth = require('../middleware/auth');

// ---- Transactions history for frontend ----
// MUST be before /:id wildcard or it gets caught by it
// GET /api/tx/history?address=...&status=all|confirmed|pending|failed&page=1&limit=20
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

    const url = `${base}/cosmos/tx/v1beta1/txs`;

    // Fetch sent and received txs separately then merge
    const axios = require('axios');

    async function fetchTxsByEvent(event, paginationLimit) {
      const fullUrl = `${url}?events=${encodeURIComponent(event)}&order_by=ORDER_BY_DESC&pagination.limit=${paginationLimit}`;
      try {
        const r = await axios.get(fullUrl, { timeout: 10000 });
        return r.data.txs || [];
      } catch (e) {
        return [];
      }
    }

    const [sentTxs, receivedTxs] = await Promise.all([
      fetchTxsByEvent(`message.sender='${address}'`, limitNum * 2),
      fetchTxsByEvent(`transfer.recipient='${address}'`, limitNum * 2),
    ]);

    // Merge and deduplicate by hash
    const seen = new Set();
    const allTxs = [...sentTxs, ...receivedTxs].filter(tx => {
      if (seen.has(tx.txhash)) return false;
      seen.add(tx.txhash);
      return true;
    });

    // Sort by height descending
    allTxs.sort((a, b) => Number(b.height || 0) - Number(a.height || 0));

    const txs = allTxs.map((tx) => {
      const msg = tx.body && tx.body.messages && tx.body.messages[0] ? tx.body.messages[0] : {};
      const from = msg.from_address || msg.creator || '';
      const to = msg.to_address || msg.to || '';
      const rawAmount = (msg.amount && msg.amount[0] && msg.amount[0].amount) || msg.amount || '0';
      const txHash = tx.txhash || '';
      const timestamp = tx.timestamp || '';
      const code = tx.code;
      const statusMapped = code === 0 || code === undefined ? 'confirmed' : 'failed';

      return {
        hash: txHash,
        from,
        to,
        amount: rawAmount,
        type: from === address ? 'send' : 'receive',
        status: statusMapped,
        timestamp,
        block: tx.height,
      };
    });

    const filtered = status === 'all' ? txs : txs.filter((t) => t.status === status);

    // Apply manual pagination on the merged + filtered result
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limitNum);

    res.json({
      success: true,
      transactions: paginated,
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

router.get('/', auth, txCtrl.list);
router.get('/:id', auth, txCtrl.get);
router.post('/relay', auth, txCtrl.relay);
router.post('/', auth, txCtrl.create);

module.exports = router;

