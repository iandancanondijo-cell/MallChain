/**
 * Hourly liquidity-pool reconciliation: sweeps purchases whose credit
 * landed but whose liquidity bookkeeping failed (or stalled in an older
 * code version) and settles them against the credited-purchase ledger —
 * see services/reconciliationService.js. Until now runReconciliationJob()
 * was only invocable via POST /api/admin/reconciliation/run, so a missed
 * manual run left discrepancies open indefinitely. Scheduling it hourly
 * makes the pool self-healing: every discrepancy is detected and resolved
 * (or explicitly parked in pending_manual with a fresh attempt) within one
 * hour, without an operator having to remember to poke the endpoint.
 */
const cron = require('node-cron');
const { runReconciliationJob } = require('../services/reconciliationService');
const logger = require('../utils/logger');

/**
 * One reconciliation pass, returning the run summary
 * ({ detected, processed, checked, resolved, unresolved }) so callers —
 * the cron tick below and manual admin triggers alike — can log or assert
 * on counts.
 */
async function runLiquidityReconciliation() {
  const summary = await runReconciliationJob();
  logger.info('liquidityReconciliation', 'reconciliation run complete', {
    checked: summary.checked ?? summary.processed,
    resolved: summary.resolved,
    unresolved: summary.unresolved,
    detected: summary.detected,
  });
  return summary;
}

function start() {
  // Env guard: DISABLE_CRON=1 keeps every scheduled background job off
  // (tests, one-shot containers, local dev against shared infra). Other
  // jobs guard on missing config (badgeSnapshot skips without
  // OPERATOR_MNEMONIC) or take a per-job schedule override (see
  // OPERATOR_STAKE_WATCH_CRON / TREASURY_REWARDS_SWEEP_CRON); this job
  // supports both patterns.
  if (process.env.DISABLE_CRON === '1') {
    logger.info('liquidityReconciliation', 'DISABLE_CRON=1 — hourly reconciliation not scheduled');
    return;
  }
  const schedule = process.env.LIQUIDITY_RECON_CRON || '0 * * * *'; // hourly
  cron.schedule(schedule, () => {
    runLiquidityReconciliation().catch((err) =>
      logger.error('liquidityReconciliation', 'reconciliation run threw', err)
    );
  });
  logger.info('liquidityReconciliation', 'started', { schedule });
}

module.exports = { runLiquidityReconciliation, start };
