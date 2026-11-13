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

/**
 * A `marketplaced` binary that predates a query answers the gateway with
 * HTTP 200 and a grpc status body instead of throwing — e.g. the Escrows
 * list on the node this repo currently runs comes back as
 * `{"code":12,"message":"Not Implemented"}`. Reading that as data yields an
 * empty list, which the storefront then shows as "you have no escrows":
 * a silent wrong answer where an honest 503 is owed.
 */
function isGrpcStatusBody(payload) {
  return Boolean(payload)
    && typeof payload === 'object'
    && payload.escrow == null
    && payload.escrows == null
    && Number.isFinite(payload.code)
    && typeof payload.message === 'string';
}

function unavailable(res, message) {
  return res.status(503).json({
    success: false,
    error: message || 'node did not answer the escrow query',
    hint: 'The running marketplaced binary does not implement this x/marketplace query; rebuild and restart the node from the current tree.',
  });
}

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
    if (isGrpcStatusBody(data)) return unavailable(res, data.message);
    return res.json({ success: true, escrow: data.escrow || data });
  } catch (e) {
    const chainMessage = e.response?.data?.message || e.message;
    // The chain's gRPC-gateway maps "not found" the same as any other
    // internal error — HTTP 500, codespace-agnostic — so a nonexistent
    // escrow id comes back indistinguishable from a real chain fault
    // unless we read the message. Only escrow lookups hit this (listing
    // never 404s), so a plain substring check is enough here.
    const isNotFound = /not found/i.test(chainMessage);
    return res.status(isNotFound ? 404 : (e.response?.status || 503)).json({ success: false, error: chainMessage });
  }
};

exports.listEscrows = async (req, res) => {
  try {
    const { buyer, seller } = req.query;
    const { data } = await axios.get(`${CHAIN_REST}/marketplace/marketplace/v1/escrow`, { timeout: 8000 });
    if (isGrpcStatusBody(data)) return unavailable(res, data.message);
    let escrows = data.escrows || [];
    if (buyer) escrows = escrows.filter((e) => e.buyer === buyer);
    if (seller) escrows = escrows.filter((e) => e.seller === seller);
    return res.json({ success: true, escrows });
  } catch (e) {
    return res.status(e.response?.status || 503).json({ success: false, error: e.response?.data?.message || e.message });
  }
};
