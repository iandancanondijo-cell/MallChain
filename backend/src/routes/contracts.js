const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing token' });
  try {
    const payload = jwt.verify(auth.slice(7), getJwtSecret());
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

// In-memory storage for contracts (replace with database in production)
const contracts = [];

// GET /api/contracts - List user's contracts
router.get('/', verifyToken, async (req, res) => {
  try {
    const userContracts = contracts.filter(c => c.userId === req.userId);
    res.json(ok(userContracts));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/deploy - Deploy new contract
router.post('/deploy', verifyToken, async (req, res) => {
  try {
    const { name, type, code, description } = req.body;
    if (!name || !type || !code) {
      return res.status(400).json(fail('name, type, and code are required'));
    }

    const contract = {
      id: 'cnt_' + Date.now() + Math.random().toString(36).slice(2, 9),
      userId: req.userId,
      name,
      type,
      code,
      description: description || '',
      address: '0x' + Math.random().toString(16).slice(2, 42).padEnd(40, '0'),
      deployedAt: new Date().toISOString(),
      txs: 0,
      status: 'active'
    };

    contracts.push(contract);
    res.json(ok(contract));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// GET /api/contracts/:id - Get contract details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const contract = contracts.find(c => c.id === req.params.id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (contract.userId !== req.userId) {
      return res.status(403).json(fail('Access denied'));
    }
    res.json(ok(contract));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/:id/interact - Execute contract function
router.post('/:id/interact', verifyToken, async (req, res) => {
  try {
    const contract = contracts.find(c => c.id === req.params.id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (contract.userId !== req.userId) {
      return res.status(403).json(fail('Access denied'));
    }

    const { method, params } = req.body;
    if (!method) {
      return res.status(400).json(fail('method is required'));
    }

    // Simulate contract interaction
    contract.txs += 1;
    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    
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
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const index = contracts.findIndex(c => c.id === req.params.id && c.userId === req.userId);
    if (index === -1) {
      return res.status(404).json(fail('Contract not found'));
    }
    contracts.splice(index, 1);
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

module.exports = router;
