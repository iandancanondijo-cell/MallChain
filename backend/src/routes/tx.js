const express = require('express');
const router = express.Router();
const txCtrl = require('../controllers/txController');
const auth = require('../middleware/auth');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize, validateQuery, schemas } = require('../middleware/inputValidation');
const { classifyMessage, txTypeCatalogue } = require('../services/txTypes');
const Joi = require('joi');

/**
 * RFC3339 (or epoch seconds/milliseconds, which the raw RPC has also been seen
 * to hand back) → epoch milliseconds, 0 when the value is unusable.
 *
 * 0 rather than null or Date.now() because every consumer of this field sorts
 * and buckets by it, and "unknown" has to be a value that stays out of the way
 * instead of one that pretends to be now.
 */
function toEpochMs(timestamp) {
  const numeric = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e11 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(timestamp ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

// A CometBFT transaction hash: 64 hex characters, upper or lower case
// depending on the node build. Distinguishes "give me this chain transaction"
// from "give me this queued-record ObjectId" on the /:id route below.
const CHAIN_HASH_RE = /^[0-9A-Fa-f]{64}$/;

/**
 * Decode one chain transaction into the row shape `/api/tx/history` publishes.
 *
 * tx_search hands back raw base64 proto bodies, so the fields a customer needs
 * come from the REST tx-by-hash endpoint instead (that endpoint works, unlike
 * its list sibling — see the RPC note in the history handler). `address`, when
 * given, is the wallet whose view the row is written from: the same transfer
 * message is a 'send' for its sender and a 'receive' for its recipient, and
 * only the querying address can say which.
 *
 * Returns null for bank-module messages, which are deliberately absent from
 * this surface: the faucet's "stake"-denom gas top-up accompanies every MLCNS
 * credit, and the Mallcoin history UI renders every amount as MLCNS/1e6, so a
 * 100-stake gas refill would otherwise appear as a phantom 100 MALL receive.
 */
async function shapeChainTx({ axios, chainRest, hash, address = '', fallbackHeight = 0, fallbackTimestamp = '' }) {
  const r = await axios.get(`${chainRest.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs/${hash}`, { timeout: 10000 });
  const resp = r.data?.tx_response || {};
  const msg = r.data?.tx?.body?.messages?.[0] || {};
  if (typeof msg['@type'] === 'string' && msg['@type'].includes('cosmos.bank.')) return null;

  const rawAmount = (Array.isArray(msg.amount) && msg.amount[0]?.amount) || (typeof msg.amount === 'string' ? msg.amount : '0');
  const direction = (msg.from_address || msg.creator || '') === address ? 'send' : 'receive';
  const timestamp = resp.timestamp || fallbackTimestamp || '';
  // Only the first message is surfaced, matching the single-message mapping
  // this route has always exposed.
  const { txType, txTypeLabel, msgType } = classifyMessage(msg['@type'], direction);

  return {
    hash: resp.txhash || hash,
    // A chain transaction is addressed by its hash, and §9.1 asked for `id`
    // rather than making every client pick between `_id`/`hash`/`txhash`. Both
    // are the same string here; `id` is what GET /api/tx/:id then accepts.
    id: resp.txhash || hash,
    from: msg.from_address || msg.creator || '',
    to: msg.to_address || msg.to || '',
    amount: rawAmount,
    type: direction,
    status: (resp.code ?? 0) === 0 ? 'confirmed' : 'failed',
    // `timestamp` stays the chain's own RFC3339 string because existing
    // consumers render it; `timestampMs` is what they should sort, filter,
    // export and bucket by. `Number()` of an ISO string is NaN, which is how
    // every chain row once rendered as "the current time" (handoff §3), and a
    // client should not have to know that. 0 means the chain gave no readable
    // time — "unknown", never "now".
    timestamp,
    timestampMs: toEpochMs(timestamp),
    // The published taxonomy (services/txTypes.js, GET /api/tx/types):
    // `txType` is the enum a client switches on, `txTypeLabel` the words for
    // it, and `msgType` the raw protobuf URL so an unclassified message is
    // still identifiable instead of silently 'other'.
    txType,
    txTypeLabel,
    msgType,
    // Codespace/error only when the chain says the tx failed — a success has
    // nothing honest to put here, so it gets undefined rather than ''.
    error: (resp.code ?? 0) === 0 ? undefined : [resp.codespace, resp.raw_log].filter(Boolean).join(': ') || undefined,
    gasUsed: resp.gas_used ? Number(resp.gas_used) : undefined,
    // The REST hands heights back as strings; every consumer compares and
    // renders one, so the number is what the field promises.
    block: Number(resp.height || fallbackHeight || 0) || 0,
  };
}

// Task 8.6: Input validation for transaction query parameters
const TX_TYPE_VALUES = txTypeCatalogue().map((entry) => entry.value);

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
  // 'send'/'receive' are the direction words this route has always answered
  // with; the rest are the published taxonomy values (services/txTypes.js,
  // GET /api/tx/types) that a row's `txType` can now carry, so a client can ask
  // for "only my staking activity" instead of fetching everything and sorting
  // it by message type itself.
  type: Joi.string()
    .valid('all', ...TX_TYPE_VALUES.filter((v) => v !== 'send' && v !== 'receive'), 'send', 'receive')
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

    // Decode each hit into the published row shape (shapeChainTx above).
    const decoded = await Promise.all(
      allTxs.map(async (hit) => {
        try {
          return await shapeChainTx({ axios, chainRest, hash: hit.hash, address, fallbackHeight: hit.height, fallbackTimestamp: hit.timestamp });
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
      if (type !== 'all') {
        // 'send'/'receive' are directions, every other accepted value is a
        // taxonomy kind. A row carries both, so both filters are honoured
        // without a client having to fetch the whole feed and sort it itself.
        const isDirection = type === 'send' || type === 'receive';
        if (isDirection ? t.type !== type : t.txType !== type) return false;
      }
      if (startMs !== null || endMs !== null) {
        if (t.timestampMs === 0) return false; // unreadable time stays out of a ranged query
        if (startMs !== null && t.timestampMs < startMs) return false;
        if (endMs !== null && t.timestampMs > endMs) return false;
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

// The published tx_type taxonomy, so a client can render filters and labels
// from the server's own table instead of matching on message `@type` fragments
// and falling back to a generic label (handoff §3). Must precede the /:id
// wildcard, which is authenticated and would otherwise swallow this path.
// GET /api/tx/types
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    types: txTypeCatalogue(),
    // The two words that have always appeared in `type`, kept separate because
    // they are directions rather than kinds: every row carries one of these in
    // `type` and a taxonomy value in `txType`.
    directions: ['send', 'receive'],
  });
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

// GET /api/tx/:id — :id is either a chain transaction hash or a queued-record
// ObjectId, and the two live in different places.
//
// The hash branch exists because /api/tx/history's rows are addressed by hash:
// with only the Mongo lookup behind this route, opening a chain row in
// Transaction History was a guaranteed 404 (`/api/transactions/:id` rejects a
// 64-hex hash as "Invalid transaction id" because it is not an ObjectId, and
// txController.get passes it to findById and gets null). Pass `address` to
// write the row from that wallet's point of view — without it a transfer reads
// as a send from its sender, which is the honest default.
router.get('/:id', auth, preventNoSQLInjection, async (req, res, next) => {
  if (!CHAIN_HASH_RE.test(String(req.params.id || ''))) return next();

  const address = typeof req.query.address === 'string' ? req.query.address : '';
  if (address && !/^mall1[a-z0-9]{38,58}$/.test(address)) {
    return res.status(400).json({ success: false, error: 'invalid_address' });
  }

  try {
    const axios = require('axios');
    const chainRest = process.env.CHAIN_REST || process.env.MALL_CHAIN_REST || 'http://127.0.0.1:1317';
    const row = await shapeChainTx({ axios, chainRest, hash: req.params.id, address });
    if (!row) return res.status(404).json({ success: false, error: 'transaction_not_found' });
    return res.json({ success: true, transaction: row });
  } catch (e) {
    // A node that cannot be reached is not a transaction that does not exist.
    const status = e?.response ? 404 : 502;
    return res.status(status).json({
      success: false,
      error: status === 404 ? 'transaction_not_found' : 'chain_unreachable',
      details: e && e.message ? e.message : String(e),
    });
  }
});

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

