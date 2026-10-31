const MallcoinPurchase = require('../models/MallcoinPurchase');
const logger = require('../utils/logger');
const { config } = require('../config');
const { recordBuyLiquidityActivity } = require('./liquidityActivityService');
const { emitMlcnsPurchaseFailed, userIdForAddress } = require('./activityEvents');

const TERMINAL_STATUSES = ['confirmed', 'failed', 'processing', 'credited'];

// Safaricom reports every non-zero ResultCode with its own ResultDesc text.
// Collapsing all of them into "User cancelled" told buyers the wrong thing —
// a mistyped/unsupported phone number never shows a prompt at all, yet read as
// if they had cancelled it themselves.
const FAILURE_HINTS = [
  // 2029 "Failed due to an unresolved reason type" arrives ~2 seconds after the
  // push and carries no Amount/MSISDN in stkpushquery: Safaricom never routed it
  // to the handset. Blaming the buyer hid a merchant-side provisioning fault.
  // "Invalid Access Laptop MSISDN" is the same fault reported synchronously.
  [/unresolved reason type|invalid merchant|merchant credential|access laptop|business short code/i, 'Our payment line was not reachable — the prompt could not be delivered. No money has left your account; please try again later or contact support.'],
  [/cancel/i, 'The payment prompt was cancelled on the phone.'],
  [/timeout|expired|time.?out/i, 'The M-Pesa prompt expired before a PIN was entered.'],
  [/insufficient|balance/i, 'Not enough M-Pesa balance for this payment.'],
  [/wrong number|invalid (mobile|phone|account)|not a registered|does not exist/i, 'That phone number is not registered for M-Pesa — check it and try again.'],
  [/pin|secret/i, 'The M-Pesa PIN was entered incorrectly.'],
  [/disabled|frozen|servicing/i, 'This phone number cannot take M-Pesa requests right now.'],
];

function describeFailure(resultDesc) {
  const text = String(resultDesc || '').trim();
  if (!text) return 'Payment did not complete — no prompt was confirmed on your phone.';
  const hint = FAILURE_HINTS.find(([re]) => re.test(text))?.[1];
  return hint ? `${hint} (Safaricom: ${text})` : `Payment did not complete (Safaricom: ${text})`;
}

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
    resultDesc: callback.ResultDesc || '',
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
  const { paymentId, resultCode, resultDesc, callbackMetadata } = getMpesaCallbackData(data);
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
    purchase.reason = describeFailure(resultDesc);

    // Email the wallet holder that their purchase didn't go through.
    // Fire-and-forget: a notification failure must never affect callback
    // acknowledgement to Safaricom.
    userIdForAddress(purchase.walletAddress)
      .then((uid) => uid && emitMlcnsPurchaseFailed(uid, {
        user_safe_reason: purchase.reason,
        payment_status: 'declined',
      }))
      .catch(() => {});
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

module.exports = { getMpesaCallbackData, processMpesaCallback, describeFailure };
