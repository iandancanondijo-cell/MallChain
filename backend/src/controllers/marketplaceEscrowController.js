/**
 * Escrow REST relay for the on-chain x/marketplace module, so an external
 * e-commerce platform can settle purchases via Mallchain escrow instead of
 * building its own Cosmos SDK client. Same architecture as
 * stakingController.js / governanceController.js: the caller signs
 * MsgCreateEscrow/MsgReleaseFunds/MsgRefundBuyer/MsgOpenDispute client-side
 * and POSTs the signed txBytes here; this just broadcasts.
 *
 * x/marketplace is now registered in app.go with real generated protobuf
 * Msg/Query bindings (see proto/marketplace/marketplace/v1/), so these
 * routes are live. The REST gateway paths below match the
 * google.api.http annotations in proto/marketplace/marketplace/v1/query.proto.
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

exports.getEscrow = async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await axios.get(`${CHAIN_REST}/marketplace/marketplace/v1/escrow/${encodeURIComponent(id)}`, { timeout: 8000 });
    return res.json({ success: true, escrow: data.escrow || data });
  } catch (e) {
    return res.status(e.response?.status || 503).json({ success: false, error: e.response?.data?.message || e.message });
  }
};

exports.listEscrows = async (req, res) => {
  try {
    const { buyer, seller } = req.query;
    const { data } = await axios.get(`${CHAIN_REST}/marketplace/marketplace/v1/escrow`, { timeout: 8000 });
    let escrows = data.escrows || [];
    if (buyer) escrows = escrows.filter((e) => e.buyer === buyer);
    if (seller) escrows = escrows.filter((e) => e.seller === seller);
    return res.json({ success: true, escrows });
  } catch (e) {
    return res.status(e.response?.status || 503).json({ success: false, error: e.response?.data?.message || e.message });
  }
};
