const chainClient = require('../utils/chainClient');
const { config } = require('../config');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');

const CHAIN_REST = config.chain.rest;

function base() {
  return CHAIN_REST.replace(/\/$/, '');
}

// H2: Wrap chain-REST not_ready sentinel. C5 registered gRPC-gateway descriptors for
// the custom dex module, so endpoints such as /marketplace/dex/v1/pools now
// correctly respond after the fix, but pre-C5 deployments return 404/501. Wrap in a
// structured 503 with Retry-After header so frontend sees not-ready rather than
// INTERNAL_ERROR for expected feature gaps.
function isChainGatewayUnavailable(err) {
  if (!err) return false;
  const status = err.response?.status;
  if (status === 404 || status === 501 || status === 502 || status === 503) return true;
  // Network-level failures (err.response is undefined) also count as unavailable — user-facing not_ready.
  if (!err.response) return true;
  return false;
}

function sendDexNotReady(res, err, endpoint) {
  res.set('Retry-After', '60');
  return res.status(503).json({
    success: false,
    status: 'not_ready',
    error: {
      code: 'DEX_CHAIN_GATEWAY_PENDING',
      message:
        'DEX chain gRPC-gateway descriptors for x/dex are not mounted yet (C5 rollout) — retry shortly',
      endpoint,
      underlying: err?.message || undefined,
    },
  });
}

// GET /api/dex/pools — all liquidity pools (x/dex keeper: CreatePool/AddLiquidity/
// RemoveLiquidity/Swap are fully implemented and unit-tested on-chain; this is
// the first REST surface for any of it).
exports.listPools = asyncHandler(async (req, res) => {
  try {
    const r = await chainClient.get(`${base()}/marketplace/dex/v1/pools`, { timeout: 10000 });
    return res.json({ success: true, ...r.data });
  } catch (err) {
    if (isChainGatewayUnavailable(err)) return sendDexNotReady(res, err, 'listPools');
    throw err;
  }
});

// GET /api/dex/pools/:poolId
exports.getPool = asyncHandler(async (req, res) => {
  const { poolId } = req.params;
  if (!/^\d+$/.test(poolId)) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'poolId must be numeric', 400);
  }
  try {
    const r = await chainClient.get(`${base()}/marketplace/dex/v1/pools/${poolId}`, { timeout: 10000 });
    return res.json({ success: true, ...r.data });
  } catch (err) {
    if (isChainGatewayUnavailable(err)) return sendDexNotReady(res, err, `getPool/${poolId}`);
    throw err;
  }
});

// GET /api/dex/pools/:poolId/liquidity/:address
exports.getPoolLiquidity = asyncHandler(async (req, res) => {
  const { poolId, address } = req.params;
  if (!/^\d+$/.test(poolId)) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'poolId must be numeric', 400);
  }
  try {
    const r = await chainClient.get(`${base()}/marketplace/dex/v1/pools/${poolId}/liquidity/${encodeURIComponent(address)}`, { timeout: 10000 });
    return res.json({ success: true, ...r.data });
  } catch (err) {
    if (isChainGatewayUnavailable(err)) return sendDexNotReady(res, err, `getPoolLiquidity/${poolId}`);
    throw err;
  }
});

// GET /api/dex/pools/:poolId/estimate?denom=umlcn&amount=1000000&tokenOutDenom=umal
exports.estimateSwap = asyncHandler(async (req, res) => {
  const { poolId } = req.params;
  const { denom, amount, tokenOutDenom } = req.query;
  if (!/^\d+$/.test(poolId) || !denom || !amount || !tokenOutDenom) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'denom, amount, and tokenOutDenom are required', 400);
  }
  try {
    const url = `${base()}/marketplace/dex/v1/pools/${poolId}/estimate`;
    const r = await chainClient.get(url, {
      timeout: 10000,
      params: { 'token_in.denom': denom, 'token_in.amount': amount, token_out_denom: tokenOutDenom },
    });
    return res.json({ success: true, ...r.data });
  } catch (err) {
    if (isChainGatewayUnavailable(err)) return sendDexNotReady(res, err, `estimateSwap/${poolId}`);
    throw err;
  }
});

// Generic broadcast relay for client-signed MsgCreatePool/MsgAddLiquidity/
// MsgRemoveLiquidity/MsgSwap (see mallchain-os-v14/src/services/dexTx.ts) —
// same pattern as staking/governance/marketplace/key-vault broadcast relays.
exports.broadcast = asyncHandler(async (req, res) => {
  const { txBytes, mode } = req.body || {};
  if (!txBytes) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'tx_bytes_required', 400);
  }
  const r = await chainClient.post(
    `${base()}/cosmos/tx/v1beta1/txs`,
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
