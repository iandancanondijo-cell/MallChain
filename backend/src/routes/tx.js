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
    const { config } = require('../config');
    const chainRpc = config.chain.rpc || 'http://127.0.0.1:26657';

    const axios = require('axios');

    // Discovery must go through the raw CometBFT RPC, not the SDK REST list
    // endpoint: on this node /cosmos/tx/v1beta1/txs rejects EVERY events query
    // with "query cannot be empty", while tx_search on :26657 works. The
    // address is safe to interpolate — the Joi pattern above allows only
    // [a-z0-9], so it cannot break out of the quoted query value.
    async function searchTxs(query, perPage) {
      try {
        const r = await axios.get(`${chainRpc.replace(/\/$/, '')}/tx_search`, {
          params: { query: `"${query}"`, per_page: Math.min(perPage, 100), order_by: '"desc"' },
          timeout: 10000,
        });
        return r.data?.result?.txs || [];
      } catch {
        return [];
      }
    }

    // message.sender catches txs the wallet signed (sends, staking, converts).
    // mlcoin_transfer.to catches MLCNS credits the wallet never signed —
    // M-Pesa purchases and faucet payments are operator-signed, and MLCNS is
    // an internal x/mlcoin ledger token that never emits bank transfer events,
    // so without it inbound Mallcoins were invisible in history.
    const [sentTxs, receivedMlcoinTxs, receivedBankTxs] = await Promise.all([
      searchTxs(`message.sender='${address}'`, limitNum * 2),
      searchTxs(`mlcoin_transfer.to='${address}'`, limitNum * 2),
      searchTxs(`transfer.recipient='${address}'`, limitNum * 2),
    ]);

    // Merge and deduplicate by hash
    const seen = new Set();
    const allTxs = [...sentTxs, ...receivedMlcoinTxs, ...receivedBankTxs].filter(tx => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });

    // Sort by height descending
    allTxs.sort((a, b) => Number(b.height || 0) - Number(a.height || 0));

    // tx_search returns raw base64 proto bodies, so decode via the REST
    // tx-by-hash endpoint (which works, unlike its list sibling) to get the
    // message fields. Only the first message is surfaced, matching the old
    // single-message mapping this route has always exposed.
    const decoded = await Promise.all(
      allTxs.map(async (hit) => {
        try {
          const r = await axios.get(
            `${chainRest.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs/${hit.hash}`,
            { timeout: 10000 }
          );
          const resp = r.data?.tx_response || {};
          const msg = r.data?.tx?.body?.messages?.[0] || {};
          // Skip bank-module sends (e.g. the faucet's "stake"-denom gas
          // top-up that accompanies every MLCNS credit): this endpoint feeds
          // the Mallcoin history UI, which renders every amount as MLCNS/1e6,
          // so a 100-stake gas refill would show as a phantom 100 MALL receive.
          if (typeof msg['@type'] === 'string' && msg['@type'].includes('cosmos.bank.')) {
            return null;
          }
          const rawAmount = (Array.isArray(msg.amount) && msg.amount[0]?.amount) || (typeof msg.amount === 'string' ? msg.amount : '0');
          return {
            hash: resp.txhash || hit.hash,
            from: msg.from_address || msg.creator || '',
            to: msg.to_address || msg.to || '',
            amount: rawAmount,
            type: (msg.from_address || msg.creator || '') === address ? 'send' : 'receive',
            status: (resp.code ?? 0) === 0 ? 'confirmed' : 'failed',
            timestamp: resp.timestamp || hit.timestamp || '',
            block: resp.height || hit.height || 0,
          };
        } catch {
          return null;
        }
      })
    );
    const txs = decoded.filter(Boolean);

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

