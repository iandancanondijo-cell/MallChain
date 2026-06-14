const axios = require('axios')
const { getTransactionQueue } = require('../mallwallet/queue/transactionQueue')

const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317'

const Tx = require('../models/transaction');

function validateRelayPayload(body) {
  if (!body || typeof body !== 'object') return 'payload must be a JSON object';
  const { creator, to, amount, signature, public_key } = body;
  if (!creator || typeof creator !== 'string') return 'creator is required and must be a string';
  if (!to || typeof to !== 'string') return 'to is required and must be a string';
  if (amount === undefined || amount === null) return 'amount is required';
  if (typeof amount !== 'number' && typeof amount !== 'string') return 'amount must be a number or numeric string';
  if (!signature || typeof signature !== 'string') return 'signature is required and must be a string';
  if (!public_key || typeof public_key !== 'string') return 'public_key is required and must be a string';
  return null;
}

function validateCreatePayload(body) {
  if (!body || typeof body !== 'object') return 'payload must be a JSON object';
  const { from, amount, signedTx } = body;
  if (!from || typeof from !== 'string') return 'from is required and must be a string';
  if (amount === undefined || amount === null) return 'amount is required';
  if (typeof amount !== 'number' && typeof amount !== 'string') return 'amount must be a number or numeric string';
  if (!signedTx) return 'signedTx is required';
  return null;
}

exports.relay = async (req, res) => {
  // Accept signed tx JSON and forward to chain REST (gateway) endpoint
  // Expected body: { creator, to, amount, signature, public_key }
  const validationError = validateRelayPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: 'invalid_payload', detail: validationError });
  }

  try {
    const signed = req.body
    const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/transfer`
    const r = await axios.post(url, signed)
    res.json({ forwarded: true, resp: r.data })
  } catch (e) {
    console.error('relay error', e.message || e)
    res.status(502).json({ error: 'relay_failed', detail: e.message })
  }
}

exports.list = async (req, res) => {
  const items = await Tx.find().sort({ createdAt: -1 }).limit(200);
  res.json(items);
};

exports.create = async (req, res) => {
  const validationError = validateCreatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: 'invalid_payload', detail: validationError });
  }

  const { from, to, amount, type, metadata, signedTx } = req.body;
  const tx = await Tx.create({
    from,
    to,
    amount,
    type,
    metadata,
    status: 'queued',
    updatedAt: Date.now()
  });

  const queue = getTransactionQueue()
  await queue.add('tx-relay', {
    txId: tx._id.toString(),
    signedTx,
    from,
    to,
    amount,
    type,
    metadata
  }, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });

  res.status(202).json({ id: tx._id, status: 'queued' });
};

exports.get = async (req, res) => {
  const t = await Tx.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
};
