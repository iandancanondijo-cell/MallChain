/* eslint-env node */
/* global require, module, process */
const axios = require('axios');
const { Buffer } = require('buffer');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const SAFARICOM_API = process.env.SAFARICOM_API || 'https://sandbox.safaricom.co.ke';
const SAFARICOM_KEY = process.env.SAFARICOM_KEY || '';
const SAFARICOM_SECRET = process.env.SAFARICOM_SECRET || '';
const B2C_INITIATOR_NAME = process.env.B2C_INITIATOR_NAME || 'testapi';
const BUSINESS_SHORT_CODE = process.env.BUSINESS_SHORT_CODE || '600000';
const SECURITY_CREDENTIAL = process.env.SECURITY_CREDENTIAL || '';
const COMMAND_ID = process.env.COMMAND_ID || 'BusinessPayment';
const PAYOUT_CALLBACK_URL = process.env.PAYOUT_CALLBACK_URL || 'http://localhost:4000/api/buy/payout/callback';
const DEFAULT_PESA_PRICE_KES = Number(process.env.MLCNS_BASE_PRICE_KES || 0.6);

async function getSafaricomToken() {
  if (!SAFARICOM_KEY || !SAFARICOM_SECRET) {
    return null;
  }

  try {
    const auth = Buffer.from(`${SAFARICOM_KEY}:${SAFARICOM_SECRET}`).toString('base64');
    const tokenRes = await axios.get(
      `${SAFARICOM_API.replace(/\/$/, '')}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, timeout: 5000 }
    );

    const token = tokenRes.data?.access_token;
    if (!token) throw new Error('No access token from Safaricom');
    return token;
  } catch (err) {
    console.error('Failed to get Safaricom token:', err.message || err);
    return null;
  }
}

async function initiateB2CPayout({ sellerPhone, mlcnsAmount, saleId }) {
  const fallback = async () => ({
    ok: true,
    payoutRef: 'B2C' + Date.now(),
    status: 'initiated',
    mocked: true,
  });

  // Calculate pesa amount from MLCNS
  const pesaAmount = Math.round(mlcnsAmount * DEFAULT_PESA_PRICE_KES * 100);
  if (!pesaAmount || pesaAmount <= 0) {
    return { ok: false, error: 'Invalid pesa amount' };
  }

  try {
    const token = await getSafaricomToken();
    if (!token) return fallback();

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
      raw: resp,
    };
  } catch (err) {
    console.warn('B2C payout initiation failed:', err.message || err);
    return fallback();
  }
}

async function handlePayoutCallback(callbackData) {
  const B2CPayout = require('../models/B2CPayout');
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
  }

  payout.payoutAttemptedAt = new Date();
  await payout.save();

  return { ResultCode: 0 };
}

module.exports = {
  initiateB2CPayout,
  handlePayoutCallback,
};
