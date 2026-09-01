const MallcoinPurchase = require('../models/MallcoinPurchase');
const logger = require('../utils/logger');
const { config } = require('../config');
const { recordBuyLiquidityActivity } = require('./liquidityActivityService');

const TERMINAL_STATUSES = ['confirmed', 'failed', 'processing', 'credited'];

function isStkConfigured() {
  const p = config.payment.safaricom;
  return Boolean(p.consumerKey && p.consumerSecret && p.passkey && p.businessShortCode);
}

function getProviderMode() {
  return isStkConfigured() ? 'live' : 'unconfigured';
}

function getMpesaCallbackData(data) {
  const callback = data?.Body?.stkCallback || {};
  return {
    paymentId: callback.CheckoutRequestID || callback.RequestID || '',
    resultCode: typeof callback.ResultCode !== 'undefined' ? callback.ResultCode : 1,
    callbackMetadata: callback.CallbackMetadata?.Item || [],
  };
}

/**
 * Extracted from routes/buy.js so the DLQ worker (mallwallet/workers/
 * paymentCallbackWorker.js) can replay a failed delivery through the exact
 * same path the live webhook route uses — not a second copy that could drift.
 *
 * Idempotent by design: Safaricom is known to retry a callback whenever it
 * doesn't get back ResultCode 0, and our own DLQ replay can also redeliver
 * the same payload — a purchase already past 'payment_initiated' means this
 * exact result was already applied, so re-running it must be a no-op rather
 * than re-emitting liquidity activity or flipping state a second time.
 */
async function processMpesaCallback(data) {
  const { paymentId, resultCode, callbackMetadata } = getMpesaCallbackData(data);
  if (!paymentId) {
    return { ResultCode: 1 };
  }

  const purchase = await MallcoinPurchase.findOne({
    $or: [
      { paymentId },
      { paymentIds: paymentId }
    ]
  });
  if (!purchase) {
    return { ResultCode: 0 };
  }

  if (TERMINAL_STATUSES.includes(purchase.status)) {
    logger.info('mpesaCallback', 'ignoring duplicate callback delivery — already processed', {
      paymentId,
      status: purchase.status,
    });
    return { ResultCode: 0 };
  }

  if (resultCode === 0) {
    const metadata = {};
    callbackMetadata.forEach(item => {
      metadata[item.Name] = item.Value;
    });

    purchase.status = 'confirmed';
    purchase.mpesaRef = metadata.MpesaReceiptNumber || purchase.mpesaRef;
    purchase.reason = 'Safaricom payment confirmed.';
  } else {
    purchase.status = 'failed';
    purchase.reason = 'User cancelled or payment failed';
  }

  await purchase.save();
  await recordBuyLiquidityActivity(resultCode === 0 ? 'payment_confirmed' : 'payment_failed', purchase, {
    status: resultCode === 0 ? 'success' : 'failed',
    providerMode: getProviderMode(),
    reason: resultCode === 0 ? undefined : purchase.reason,
    note: resultCode === 0 ? 'Safaricom callback confirmed the fiat payment.' : undefined,
    metadata: { callbackData: data },
  });
  return { ResultCode: 0 };
}

module.exports = { getMpesaCallbackData, processMpesaCallback };
