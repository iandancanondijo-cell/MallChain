const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { config } = require('../config');
const Contract = require('../models/Contract');
const { preventNoSQLInjection, limitPayloadSize } = require('../middleware/inputValidation');
const { createLimiter } = require('../middleware/rateLimiter');

const CHAIN_REST = config.chain.rest;
const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

// POST /api/contracts/broadcast - Relay a client-signed wasm tx to the chain
router.post('/broadcast',
  auth,
  txLimiter,
  limitPayloadSize(2),
  preventNoSQLInjection,
  async (req, res) => {
    try {
      const { txBytes, mode } = req.body || {};
      if (!txBytes) {
        return res.status(400).json(fail('tx_bytes_required'));
      }
      const broadcastUrl = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`;
      const r = await axios.post(
        broadcastUrl,
        { tx_bytes: txBytes, mode: mode || 'BROADCAST_MODE_SYNC' },
        { timeout: 10000 }
      );
      const txResp = r.data?.tx_response || r.data;
      const code = txResp?.code ?? 0;
      if (code !== 0) {
        return res.status(400).json({ ok: false, error: txResp?.raw_log || 'tx_failed', txResponse: txResp });
      }
      return res.json(ok({
        txHash: txResp?.txhash || txResp?.txHash,
        txResponse: txResp,
      }));
    } catch (e) {
      res.status(500).json(fail(e));
    }
  }
);

// GET /api/contracts - List user's contracts
router.get('/', auth, async (req, res) => {
  try {
    const contracts = await Contract.find({ userId: req.user._id }).sort({ deployedAt: -1 }).lean();
    res.json(ok(contracts));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/deploy - Record a deployed contract. When called with a
// real txHash + on-chain address the record reflects an actual wasm deploy;
// without them a placeholder is generated (legacy simulated path).
router.post('/deploy', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { name, type, code, description, txHash, address: onChainAddress } = req.body;
    if (!name || !type || !code) {
      return res.status(400).json(fail('name, type, and code are required'));
    }

    const contract = await Contract.create({
      userId: req.user._id,
      name,
      type,
      code,
      description: description || '',
      address: onChainAddress || '0x' + require('crypto').randomBytes(20).toString('hex'),
      txHash: txHash || null,
      txs: 0,
      status: 'active',
    });

    res.json(ok(contract));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/contracts/:id - Get contract details
router.get('/:id', auth, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).lean();
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (String(contract.userId) !== String(req.user._id)) {
      return res.status(403).json(fail('Access denied'));
    }
    res.json(ok(contract));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/:id/interact - Execute contract function. When called
// with a real txHash the record reflects an actual on-chain execution; without
// it a placeholder hash is generated (legacy simulated path).
router.post('/:id/interact', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (String(contract.userId) !== String(req.user._id)) {
      return res.status(403).json(fail('Access denied'));
    }

    const { method, params, txHash: realTxHash } = req.body;
    if (!method) {
      return res.status(400).json(fail('method is required'));
    }

    contract.txs += 1;
    await contract.save();
    const txHash = realTxHash || '0x' + require('crypto').randomBytes(32).toString('hex');

    res.json(ok({
      txHash,
      status: 'success',
      result: { method, params, executed: true, timestamp: new Date().toISOString() }
    }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// DELETE /api/contracts/:id - Delete contract
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await Contract.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!result) {
      return res.status(404).json(fail('Contract not found'));
    }
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
