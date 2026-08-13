/* eslint-env node */
/* global require, module */
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

async function recordLiquidityActivity(entry) {
  const payload = compactObject({
    flow: entry.flow,
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

  return LiquidityPoolActivity.create(payload);
}

async function recordBuyLiquidityActivity(stage, purchase, overrides = {}) {
  return recordLiquidityActivity({
    flow: 'buy',
    stage,
    status: overrides.status || 'info',
    poolId: overrides.poolId ?? purchase?.liquidityPoolId,
    quoteId: overrides.quoteId ?? purchase?.quoteId,
    paymentId:
      overrides.paymentId ??
      purchase?.paymentId ??
      purchase?.paymentIds?.[purchase.paymentIds.length - 1],
    walletAddress: overrides.walletAddress ?? purchase?.walletAddress,
    phone: overrides.phone ?? purchase?.phone,
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
    stage,
    status: overrides.status || 'info',
    poolId: overrides.poolId,
    withdrawalId: overrides.withdrawalId ?? source?.withdrawalId,
    saleId: overrides.saleId ?? source?.saleId,
    payoutRef: overrides.payoutRef ?? source?.payoutRef,
    walletAddress: overrides.walletAddress ?? source?.walletAddress ?? source?.sellerAddress,
    phone: overrides.phone ?? source?.phone ?? source?.sellerPhone,
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

module.exports = {
  recordLiquidityActivity,
  recordBuyLiquidityActivity,
  recordWithdrawLiquidityActivity,
};
