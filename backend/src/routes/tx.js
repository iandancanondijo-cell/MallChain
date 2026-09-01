const express = require('express');
const router = express.Router();
const txCtrl = require('../controllers/txController');
const auth = require('../middleware/auth');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize, validateQuery, schemas } = require('../middleware/inputValidation');
const Joi = require('joi');

// Task 8.6: Input validation for transaction query parameters
const historyQuerySchema = Joi.object({
  address: Joi.string()
    .pattern(/^mall1[a-z0-9]{38,58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid Mallchain address format',
    }),
  status: Joi.string()
    .valid('all', 'confirmed', 'pending', 'failed')
    .default('all'),
  // This endpoint only ever derives 'send'/'receive' from a generic bank
  // transfer event (see the from === address ternary below) — it has no
  // way to see swap/stake/reward/etc, so 'all' is the only other valid value.
  type: Joi.string()
    .valid('all', 'send', 'receive')
    .default('all'),
  search: Joi.string().trim().max(128).allow('').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  page: Joi.string()
    .pattern(/^\d+$/)
    .default('1'),
  limit: Joi.string()
    .pattern(/^\d+$/)
    .default('20'),
});

// ---- Transactions history for frontend ----
// MUST be before /:id wildcard or it gets caught by it
// GET /api/tx/history?address=...&status=all|confirmed|pending|failed&page=1&limit=20
router.get('/history', 
  validateQuery(historyQuerySchema),
  async (req, res) => {
  try {
    const {
      address,
      status = 'all',
      type = 'all',
      search = '',
      startDate,
      endDate,
      page = '1',
      limit = '20',
    } = req.validatedQuery;

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

    // All filters are applied to the full merged set *before* pagination —
    // total/page counts must reflect the filtered result, not the raw feed,
    // or "page 1 of N" and Next/Previous would be paging through the wrong set.
    const startMs = startDate ? new Date(startDate).getTime() : null;
    const endMs = endDate ? new Date(endDate).getTime() : null;
    const searchLower = search.toLowerCase();

    const filtered = txs.filter((t) => {
      if (status !== 'all' && t.status !== status) return false;
      if (type !== 'all' && t.type !== type) return false;
      if (startMs !== null || endMs !== null) {
        const ts = new Date(t.timestamp).getTime();
        if (Number.isNaN(ts)) return false;
        if (startMs !== null && ts < startMs) return false;
        if (endMs !== null && ts > endMs) return false;
      }
      if (searchLower) {
        const haystack = `${t.hash} ${t.from} ${t.to}`.toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });

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

// Task 8.6: Apply input validation to all GET requests with parameters
const getSchema = Joi.object({
  id: Joi.string()
    .alphanum()
    .max(64)
    .optional()
    .messages({
      'string.alphanum': 'ID must contain only alphanumeric characters',
    }),
});

router.get('/', auth, preventNoSQLInjection, txCtrl.list);
router.get('/:id', auth, preventNoSQLInjection, txCtrl.get);
// signature/public_key are base64 — sanitizeInputs strips '/', a valid
// base64 character, which would silently corrupt either field.
router.post('/relay',
  auth,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  txCtrl.relay
);
router.post('/', 
  auth,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  txCtrl.create
);

module.exports = router;

