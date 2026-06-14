/* eslint-env node */
/* global require, module */
const express = require('express');
const router = express.Router();
const liquidityController = require('../controllers/liquidityController');
const mallcoinService = require('../services/mallcoinService');
const { runReconciliationJob } = require('../services/reconciliationService');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

// Trigger a one-off reconcile/report of on-chain pools and emission metrics
router.post('/reconcile', async (req, res) => {
  try {
    const pools = await liquidityController.fetchPoolsFromBlockchain();
    const metrics = await mallcoinService.getActivityMetrics();

    // Basic report comparing pool totals and metrics
    const report = {
      pools: pools.map(p => ({ id: p.id, name: p.name, reserve0: p.reserve0, reserve1: p.reserve1, tvl: p.tvl })),
      metrics,
      generatedAt: new Date().toISOString(),
    };

    return res.json({ ok: true, report });
  } catch (err) {
    console.error('Reconcile failed:', err.message || err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Run liquidity reconciliation job
router.post('/reconciliation/run', async (req, res) => {
  try {
    const result = await runReconciliationJob();
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('Reconciliation job failed:', err.message || err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;
