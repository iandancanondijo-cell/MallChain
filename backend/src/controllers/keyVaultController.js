const chainClient = require('../utils/chainClient');
const { config } = require('../config');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');

const CHAIN_REST = config.chain.rest;

// Read-only proxy for x/vault's VaultBlob query — never broadcast or
// written to chain history, so returning the encrypted blob here (for the
// client to decrypt locally) doesn't expose anything beyond what's already
// sitting in public chain state. See proto/marketplace/vault/v1/query.proto.
exports.getBlob = asyncHandler(async (req, res) => {
  const { owner } = req.params;
  if (!owner) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'owner required', 400);
  }
  const url = `${CHAIN_REST.replace(/\/$/, '')}/marketplace/vault/v1/blob/${encodeURIComponent(owner)}`;
  const r = await chainClient.get(url, { timeout: 10000 });
  return res.json({ success: true, blob: r.data });
});

// Broadcasts a client-signed MsgSetupVault/MsgConfirmVault/MsgDisableVault
// (see mallchain-os-v14/src/services/vaultTx.ts). Password/TOTP secret
// never reach this handler — the signed tx bytes only ever contain
// ciphertext the client already produced.
exports.broadcast = asyncHandler(async (req, res) => {
  const { txBytes, mode } = req.body || {};
  if (!txBytes) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'tx_bytes_required', 400);
  }
  const broadcastUrl = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`;
  const r = await chainClient.post(
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
