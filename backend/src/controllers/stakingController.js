const axios = require('axios');
const { config } = require('../config');
const { getStakingSummary } = require('../services/stakingService');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const CHAIN_REST = config.chain.rest;

exports.summary = asyncHandler(async (req, res) => {
  const { address } = req.params;
  if (!address) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'address required', 400);
  }
  try {
    const summary = await getStakingSummary(address);
    return res.json({ success: true, summary });
  } catch (err) {
    if (err && err.code === 'STAKING_DATA_UNAVAILABLE') {
      // H1: Never silently zero — surface a 503 not-ready response so the
      // frontend distinguishes "address has zero active staked MLCNS" from
      // "chain REST is down". The errorHandler.js fallback is a 500 without
      // the explicit error code — bypass it here so the UI card is precise.
      return res.status(err.status || 503).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          address,
        },
      });
    }
    throw err;
  }
});

exports.broadcast = asyncHandler(async (req, res) => {
  const { txBytes, mode } = req.body || {};
  if (!txBytes) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'tx_bytes_required', 400);
  }
  const broadcastUrl = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`;
  const r = await axios.post(
    broadcastUrl,
    { tx_bytes: txBytes, mode: mode || 'BROADCAST_MODE_SYNC' },
    { timeout: 10000 }
  );
  const txResp = r.data?.tx_response || r.data;
  const code = txResp?.code ?? 0;
  if (code !== 0) {
    throw new AppError(ErrorCodes.INVALID_TRANSACTION, txResp?.raw_log || 'tx_failed', 400, { txResponse: txResp });
  }
  return res.json({
    success: true,
    txHash: txResp?.txhash || txResp?.txHash,
    txResponse: txResp,
  });
});
