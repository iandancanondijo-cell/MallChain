/* eslint-env node */
/* global require, module, process */
const axios = require('axios');
const { Buffer } = require('buffer');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const { config } = require('../config');
const { createBlockchainBreaker } = require('../utils/circuitBreaker');
const { paymentFailuresTotal } = require('../utils/metrics');
const { getMarketPrice } = require('./mallcoinService');
const console = new Console(stdout, stderr);

const {
  apiBaseUrl: SAFARICOM_API,
  consumerKey: SAFARICOM_KEY,
  consumerSecret: SAFARICOM_SECRET,
  b2cInitiatorName: B2C_INITIATOR_NAME,
  businessShortCode: BUSINESS_SHORT_CODE,
  securityCredential: SECURITY_CREDENTIAL,
  commandId: COMMAND_ID,
  payoutCallbackUrl: PAYOUT_CALLBACK_URL,
} = config.payment.safaricom;
// Fallback only, matching mallcoinService's on-chain MarketPrice default
// (SellPrice: 58 => KES 0.58) — used if the chain is unreachable.
const DEFAULT_PESA_PRICE_KES = Number(process.env.MLCNS_SELL_PRICE_KES || 0.58);
const safaricomBreaker = createBlockchainBreaker();

function getProviderMode() {
  return SAFARICOM_KEY && SAFARICOM_SECRET ? 'live' : 'unconfigured';
}

async function getSafaricomToken() {
  if (!SAFARICOM_KEY || !SAFARICOM_SECRET) {
    return null;
  }

  try {
    const auth = Buffer.from(`${SAFARICOM_KEY}:${SAFARICOM_SECRET}`).toString('base64');
    const tokenRes = await safaricomBreaker.execute(async () => {
      return await axios.get(
        `${SAFARICOM_API.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` }, timeout: 5000 }
      );
    });

    const token = tokenRes.data?.access_token;
    if (!token) throw new Error('No access token from Safaricom');
    return token;
  } catch (err) {
    console.error('Failed to get Safaricom token:', err.message || err);
    return null;
  }
}

async function initiateB2CPayout({ sellerPhone, mlcnsAmount, saleId }) {
  // Use the live on-chain sell price so payouts track dynamic pricing
  // instead of a stale fixed rate; fall back to the default if the chain
  // is unreachable (getMarketPrice already handles that internally).
  const { sellPriceKes } = await getMarketPrice();
  const effectiveSellPriceKes = sellPriceKes || DEFAULT_PESA_PRICE_KES;

  // Calculate pesa amount from MLCNS
  const pesaAmount = Math.round(mlcnsAmount * effectiveSellPriceKes * 100);
  if (!pesaAmount || pesaAmount <= 0) {
    return { ok: false, error: 'Invalid pesa amount' };
  }

  if (!SAFARICOM_KEY || !SAFARICOM_SECRET || !SECURITY_CREDENTIAL || !BUSINESS_SHORT_CODE) {
    return { ok: false, error: 'Safaricom payout is not configured yet', providerMode: 'unconfigured' };
  }

  try {
    const token = await getSafaricomToken();
    if (!token) {
      paymentFailuresTotal.inc({ reason: 'b2c_token_unavailable' });
      return { ok: false, error: 'Safaricom token could not be generated', providerMode: 'unconfigured' };
    }

    // Prepare B2C request
    const b2cPayload = {
      InitiatorName: B2C_INITIATOR_NAME,
      SecurityCredential: SECURITY_CREDENTIAL,
      CommandID: COMMAND_ID,
      Amount: pesaAmount / 100, // convert back to KES
      PartyA: BUSINESS_SHORT_CODE,
      PartyB: sellerPhone,
      Remarks: `Mallcoin redemption ${saleId}`,
      QueueTimeOutURL: PAYOUT_CALLBACK_URL,
      ResultURL: PAYOUT_CALLBACK_URL,
    };

    const b2cRes = await axios.post(
      `${SAFARICOM_API.replace(/\/$/, '')}/mpesa/b2c/v1/paymentrequest`,
      b2cPayload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );

    const resp = b2cRes.data || {};
    const payoutRef = resp.ConversationID || resp.conversationID || 'B2C' + Date.now();

    return {
      ok: true,
      payoutRef,
      status: 'initiated',
      pesaAmount: pesaAmount / 100,
      providerMode: 'live',
      raw: resp,
    };
  } catch (err) {
    console.warn('B2C payout initiation failed:', err.message || err);
    paymentFailuresTotal.inc({ reason: 'b2c_initiation_error' });
    return { ok: false, error: err.message || 'Payout initiation failed', providerMode: 'live' };
  }
}

async function handlePayoutCallback(callbackData) {
  const B2CPayout = require('../models/B2CPayout');
  const MallcoinSale = require('../models/MallcoinSale');
  const WithdrawalRequest = require('../models/WithdrawalRequest');
  const { recordWithdrawLiquidityActivity } = require('./liquidityActivityService');
  const result = callbackData?.Result || {};

  if (!result.ConversationID && !result.conversationID) {
    return { ResultCode: 1 };
  }

  const payoutRef = result.ConversationID || result.conversationID;
  const resultCode = result.ResultCode || 0;
  const resultDesc = result.ResultDesc || '';

  const payout = await B2CPayout.findOne({ payoutRef });
  if (!payout) {
    return { ResultCode: 0 };
  }

  if (resultCode === 0) {
    payout.payoutStatus = 'succeeded';
    payout.payoutResult = result;
  } else {
    payout.payoutStatus = 'failed';
    payout.payoutError = resultDesc;
    paymentFailuresTotal.inc({ reason: 'b2c_callback_failed' });
  }

  payout.payoutAttemptedAt = new Date();
  await payout.save();

  if (payout.saleId) {
    const sale = await MallcoinSale.findOne({ saleId: payout.saleId });
    if (sale) {
      sale.status = resultCode === 0 ? 'completed' : 'failed';
      if (resultCode !== 0) {
        sale.reason = resultDesc || 'Cash-out payout failed.';
      }
      await sale.save();
    }
  }

  const withdrawal = await WithdrawalRequest.findOne({
    $or: [{ payoutRef }, { saleId: payout.saleId }, { withdrawalId: payout.saleId }],
  });
  if (withdrawal) {
    withdrawal.status = resultCode === 0 ? 'completed' : 'failed';
    withdrawal.payoutRef = payoutRef;
    withdrawal.notes =
      resultCode === 0
        ? 'Safaricom payout completed successfully.'
        : resultDesc || 'Safaricom payout failed.';
    await withdrawal.save();

    await recordWithdrawLiquidityActivity(
      resultCode === 0 ? 'payout_completed' : 'payout_failed',
      withdrawal,
      {
        status: resultCode === 0 ? 'success' : 'failed',
        payoutRef,
        providerMode: getProviderMode(),
        reason: resultCode === 0 ? undefined : withdrawal.notes,
        metadata: { callbackResult: result },
      }
    );
  } else {
    await recordWithdrawLiquidityActivity(
      resultCode === 0 ? 'payout_completed' : 'payout_failed',
      payout,
      {
        status: resultCode === 0 ? 'success' : 'failed',
        payoutRef,
        providerMode: getProviderMode(),
        reason: resultCode === 0 ? undefined : resultDesc,
        metadata: { callbackResult: result },
      }
    );
  }

  return { ResultCode: 0 };
}

module.exports = {
  initiateB2CPayout,
  handlePayoutCallback,
  getProviderMode,
};
