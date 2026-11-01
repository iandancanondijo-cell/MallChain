/* eslint-env node */
/* global require, module */
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');
const { liquidityActivityTotal } = require('../utils/metrics');

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

// purchase/source are Mongoose docs whose .phone is ciphertext at rest.
// LiquidityPoolActivity's own pre('save') encrypts whatever phone it's handed,
// so passing ciphertext through would double-encrypt it and leave a phone_blind
// that never matches a GDPR lookup. Decrypt via the doc's own model static
// before recording; fall back to the raw value for plain override objects.
function plaintextPhone(doc) {
  if (!doc) return doc;
  const Ctor = doc.constructor;
  if (Ctor && typeof Ctor.decryptPhone === 'function') return Ctor.decryptPhone(doc).phone;
  return doc.phone;
}

async function recordLiquidityActivity(entry) {
  const payload = compactObject({
    flow: entry.flow,
    // See the RESERVE SEMANTICS comment in models/LiquidityPoolActivity.js:
    // reserve-moving flows (buy/withdraw/reconciliation settlements) pass
    // affectsReserves: true; informational flows (reward/transfer/faucet/
    // refund/mallpoints_purchase) leave it false so pool reserve accounting
    // is never confused by ledger rows that don't move fiat.
    affectsReserves: entry.affectsReserves ?? false,
    userId: entry.userId,
    stage: entry.stage,
    status: entry.status || 'info',
    poolId: entry.poolId,
    quoteId: entry.quoteId,
    paymentId: entry.paymentId,
    withdrawalId: entry.withdrawalId,
    saleId: entry.saleId,
    payoutRef: entry.payoutRef,
    walletAddress: entry.walletAddress,
    phone: entry.phone,
    currency: entry.currency || 'KES',
    amountMlcns: entry.amountMlcns ?? 0,
    fiatAmount: entry.fiatAmount ?? 0,
    lpTokens: entry.lpTokens ?? 0,
    creditTxHash: entry.creditTxHash,
    liquidityTxHash: entry.liquidityTxHash,
    sellTxHash: entry.sellTxHash,
    burnTxHash: entry.burnTxHash,
    provider: entry.provider,
    providerMode: entry.providerMode,
    note: entry.note,
    reason: entry.reason,
    metadata: entry.metadata,
    recordedAt: entry.recordedAt || new Date(),
  });

  const created = await LiquidityPoolActivity.create(payload);
  liquidityActivityTotal.inc({ flow: payload.flow, stage: payload.stage, status: payload.status });
  return created;
}

async function recordBuyLiquidityActivity(stage, purchase, overrides = {}) {
  return recordLiquidityActivity({
    flow: 'buy',
    // A credited buy adds fiat-backed liquidity to the pool.
    affectsReserves: overrides.affectsReserves ?? true,
    stage,
    status: overrides.status || 'info',
    poolId: overrides.poolId ?? purchase?.liquidityPoolId,
    quoteId: overrides.quoteId ?? purchase?.quoteId,
    paymentId:
      overrides.paymentId ??
      purchase?.paymentId ??
      purchase?.paymentIds?.[purchase.paymentIds.length - 1],
    walletAddress: overrides.walletAddress ?? purchase?.walletAddress,
    phone: overrides.phone ?? plaintextPhone(purchase),
    currency: overrides.currency ?? purchase?.currency ?? 'KES',
    amountMlcns: overrides.amountMlcns ?? purchase?.amount,
    fiatAmount: overrides.fiatAmount ?? purchase?.fiatAmount,
    lpTokens: overrides.lpTokens ?? purchase?.lpTokens,
    creditTxHash: overrides.creditTxHash ?? purchase?.txHash,
    liquidityTxHash: overrides.liquidityTxHash,
    provider: 'safaricom_mpesa',
    providerMode: overrides.providerMode,
    note: overrides.note,
    reason: overrides.reason,
    metadata: overrides.metadata,
  });
}

async function recordWithdrawLiquidityActivity(stage, source, overrides = {}) {
  return recordLiquidityActivity({
    flow: 'withdraw',
    // A settled withdrawal subtracts fiat-backed liquidity from the pool.
    affectsReserves: overrides.affectsReserves ?? true,
    stage,
    status: overrides.status || 'info',
    poolId: overrides.poolId,
    withdrawalId: overrides.withdrawalId ?? source?.withdrawalId,
    saleId: overrides.saleId ?? source?.saleId,
    payoutRef: overrides.payoutRef ?? source?.payoutRef,
    walletAddress: overrides.walletAddress ?? source?.walletAddress ?? source?.sellerAddress,
    phone: overrides.phone ?? plaintextPhone(source) ?? source?.sellerPhone,
    currency: overrides.currency ?? source?.currency ?? 'KES',
    amountMlcns: overrides.amountMlcns ?? source?.amountMlcns ?? source?.amount,
    fiatAmount: overrides.fiatAmount ?? source?.amountKes ?? source?.pesaAmount,
    sellTxHash: overrides.sellTxHash ?? source?.sellTxHash ?? source?.txHash,
    burnTxHash: overrides.burnTxHash ?? source?.burnTxHash,
    provider: 'safaricom_mpesa',
    providerMode: overrides.providerMode,
    note: overrides.note,
    reason: overrides.reason,
    metadata: overrides.metadata,
  });
}

// ---------------------------------------------------------------------------
// Informational ledger wrappers — every value movement that does NOT change
// pool reserves (see RESERVE SEMANTICS in models/LiquidityPoolActivity.js).
// These exist so the activity ledger shows every movement; all pass
// affectsReserves: false and all callers must treat them as non-fatal
// best-effort writes (`.catch(log)` — a ledger miss never breaks the
// user-facing flow).
// ---------------------------------------------------------------------------

// MLPTS bought with real M-Pesa fiat. The fiat lands but Mallpoints
// purchases live in Redis (10-min TTL), so they never appear in the
// credited-MallcoinPurchase reserve aggregation — recorded as informational.
async function recordMallpointsPurchaseActivity(stage, purchase, overrides = {}) {
  return recordLiquidityActivity({
    flow: 'mallpoints_purchase',
    affectsReserves: false,
    stage,
    status: overrides.status || 'success',
    quoteId: overrides.quoteId ?? purchase?.quoteId,
    paymentId: overrides.paymentId ?? purchase?.paymentId,
    walletAddress: overrides.walletAddress ?? purchase?.address,
    phone: overrides.phone ?? plaintextPhone(purchase),
    currency: overrides.currency ?? 'KES',
    fiatAmount: overrides.fiatAmount ?? purchase?.amountKes ?? purchase?.amountKES,
    provider: 'safaricom_mpesa',
    note: overrides.note,
    metadata: {
      asset: 'MLPTS',
      mallpointsAmount: purchase?.mallpointsAmount,
      ...(overrides.metadata || {}),
    },
  });
}

// MLPTS accrual/debit: mining & task rewards, admin credit/deduct, referral
// payouts, creator-space, EDU rewards — everything that flows through the
// GATE-61 syncMallPointAccount chokepoint. amountMlpts is signed (positive =
// credit, negative = debit).
async function recordRewardActivity(entry = {}) {
  return recordLiquidityActivity({
    flow: 'reward',
    affectsReserves: false,
    stage: entry.stage || 'mlpts_balance_sync',
    status: entry.status || 'success',
    userId: entry.userId,
    walletAddress: entry.walletAddress,
    currency: entry.currency || 'MLPTS',
    note: entry.note,
    reason: entry.reason,
    metadata: {
      mlptsAmount: entry.amountMlpts,
      refId: entry.refId,
      ...(entry.metadata || {}),
    },
  });
}

// P2P MLCNS transfer confirmed on chain (send flow). Informational: it moves
// MLCNS between wallets but no fiat enters or leaves the pool.
async function recordTransferActivity(entry = {}) {
  return recordLiquidityActivity({
    flow: 'transfer',
    affectsReserves: false,
    stage: entry.stage || 'p2p_transfer_confirmed',
    status: entry.status || 'success',
    userId: entry.userId,
    walletAddress: entry.from ?? entry.walletAddress,
    amountMlcns: entry.amountMlcns ?? entry.amount,
    creditTxHash: entry.txHash ?? entry.creditTxHash,
    note: entry.note,
    metadata: {
      recipient: entry.to,
      denom: entry.denom || 'MLCNS',
      ...(entry.metadata || {}),
    },
  });
}

// Faucet MLCNS grant (dev/test funding). Informational: no fiat involved.
async function recordFaucetActivity(entry = {}) {
  return recordLiquidityActivity({
    flow: 'faucet',
    affectsReserves: false,
    stage: entry.stage || 'faucet_credited',
    status: entry.status || 'success',
    userId: entry.userId,
    walletAddress: entry.address ?? entry.walletAddress,
    amountMlcns: entry.amountMlcns ?? entry.amount,
    creditTxHash: entry.txHash ?? entry.creditTxHash,
    note: entry.note,
    metadata: entry.metadata,
  });
}

// A failed withdrawal that was settled by refunding the user (admin resolve
// path). Informational: the sell never settled, so pool reserves were never
// debited and there is nothing to credit back in reserve terms.
async function recordRefundActivity(stage, source, overrides = {}) {
  return recordLiquidityActivity({
    flow: 'refund',
    affectsReserves: false,
    stage,
    status: overrides.status || 'success',
    withdrawalId: overrides.withdrawalId ?? source?.withdrawalId,
    saleId: overrides.saleId ?? source?.saleId,
    payoutRef: overrides.payoutRef ?? source?.payoutRef,
    walletAddress: overrides.walletAddress ?? source?.walletAddress,
    // NB: never pass source.phone here — at this point it is already
    // encrypted at rest and would double-encrypt (see plaintextPhone above).
    // Refund rows key on withdrawalId instead.
    currency: overrides.currency ?? source?.currency ?? 'KES',
    amountMlcns: overrides.amountMlcns ?? source?.amountMlcns,
    fiatAmount: overrides.fiatAmount ?? source?.amountKes,
    provider: overrides.provider ?? source?.payoutProvider,
    note: overrides.note ?? source?.notes,
    reason: overrides.reason,
    metadata: overrides.metadata,
  });
}

module.exports = {
  recordLiquidityActivity,
  recordBuyLiquidityActivity,
  recordWithdrawLiquidityActivity,
  recordMallpointsPurchaseActivity,
  recordRewardActivity,
  recordTransferActivity,
  recordFaucetActivity,
  recordRefundActivity,
};
