const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const Contract = require('../models/Contract');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

// GET /api/contracts - List user's contracts
router.get('/', auth, async (req, res) => {
  try {
    const contracts = await Contract.find({ userId: req.user._id }).sort({ deployedAt: -1 }).lean();
    res.json(ok(contracts));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/deploy - Deploy new contract (simulated — no real wasm upload pipeline)
router.post('/deploy', auth, async (req, res) => {
  try {
    const { name, type, code, description } = req.body;
    if (!name || !type || !code) {
      return res.status(400).json(fail('name, type, and code are required'));
    }

    const contract = await Contract.create({
      userId: req.user._id,
      name,
      type,
      code,
      description: description || '',
      address: '0x' + require('crypto').randomBytes(20).toString('hex'),
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

// POST /api/contracts/:id/interact - Execute contract function (simulated)
router.post('/:id/interact', auth, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (String(contract.userId) !== String(req.user._id)) {
      return res.status(403).json(fail('Access denied'));
    }

    const { method, params } = req.body;
    if (!method) {
      return res.status(400).json(fail('method is required'));
    }

    contract.txs += 1;
    await contract.save();
    const txHash = '0x' + require('crypto').randomBytes(32).toString('hex');

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
