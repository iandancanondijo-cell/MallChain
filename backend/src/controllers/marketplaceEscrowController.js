/**
 * Escrow REST relay for the on-chain x/marketplace module, so an external
 * e-commerce platform can settle purchases via Mallchain escrow instead of
 * building its own Cosmos SDK client. Same architecture as
 * stakingController.js / governanceController.js: the caller signs
 * MsgCreateEscrow/MsgReleaseFunds/MsgRefundBuyer/MsgOpenDispute client-side
 * and POSTs the signed txBytes here; this just broadcasts.
 *
 * IMPORTANT — discovered while building this: `x/marketplace` (the escrow
 * module) is present in this repo's Go source but is NOT registered in
 * app.go's module manager, and its Msg/Query server interfaces in
 * x/marketplace/types/msgs.go are hand-written stand-ins that don't
 * implement the real cosmos-sdk proto.Message / grpc.ServiceRegistrar
 * contracts. Concretely: there is currently no on-chain handler for these
 * messages and no REST/gRPC query surface for escrow state. These routes
 * are wired and ready, but broadcasting will fail (or silently no-op)
 * until the chain team finishes registering the module in app.go and
 * regenerates real protobuf types from proto/marketplace/marketplace/v1/.
 * Flagged to the user; not something fixable from this Node.js backend.
 */
const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

exports.broadcast = async (req, res) => {
  try {
    const { txBytes, mode } = req.body || {};
    if (!txBytes) {
      return res.status(400).json({
        success: false,
        error: 'tx_bytes_required',
        hint: 'Sign MsgCreateEscrow/MsgReleaseFunds/MsgRefundBuyer/MsgOpenDispute on the client and POST { txBytes: base64 }',
      });
    }

    const response = await axios.post(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, {
      tx_bytes: txBytes,
      mode: mode || 'BROADCAST_MODE_SYNC',
    });

    const txResponse = response.data?.tx_response;
    if (txResponse && txResponse.code !== 0) {
      return res.status(400).json({ success: false, error: txResponse.raw_log, txResponse });
    }

    return res.json({ success: true, txHash: txResponse?.txhash, txResponse });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.response?.data?.message || e.message });
  }
};

// Follows the same custom-module REST convention as mlcoin/mallpoints
// (see stakingService.js's `/tmp/marketplace/mlcoin/v1/...`). Will 404 /
// error until the module is actually registered on-chain (see note above).
exports.getEscrow = async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await axios.get(`${CHAIN_REST}/tmp/marketplace/marketplace/v1/escrow/${encodeURIComponent(id)}`, { timeout: 8000 });
    return res.json({ success: true, escrow: data.escrow || data });
  } catch (e) {
    return res.status(e.response?.status || 503).json({ success: false, error: e.response?.data?.message || e.message });
  }
};

exports.listEscrows = async (req, res) => {
  try {
    const { buyer, seller } = req.query;
    const { data } = await axios.get(`${CHAIN_REST}/tmp/marketplace/marketplace/v1/escrow`, { timeout: 8000 });
    let escrows = data.escrows || [];
    if (buyer) escrows = escrows.filter((e) => e.buyer === buyer);
    if (seller) escrows = escrows.filter((e) => e.seller === seller);
    return res.json({ success: true, escrows });
  } catch (e) {
    return res.status(e.response?.status || 503).json({ success: false, error: e.response?.data?.message || e.message });
  }
};
