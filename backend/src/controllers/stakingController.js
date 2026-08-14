const axios = require('axios');
const { config } = require('../config');
const { getStakingSummary } = require('../services/stakingService');
const CHAIN_REST = config.chain.rest;

exports.summary = async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) return res.status(400).json({ success: false, error: 'address required' });
    const summary = await getStakingSummary(address);
    return res.json({ success: true, summary });
  } catch (e) {
    console.error('staking summary error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};

exports.broadcast = async (req, res) => {
  try {
    const { txBytes, mode } = req.body || {};
    if (!txBytes) {
      return res.status(400).json({ success: false, error: 'tx_bytes_required' });
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
      return res.status(400).json({
        success: false,
        error: txResp?.raw_log || 'tx_failed',
        txResponse: txResp,
      });
    }
    return res.json({
      success: true,
      txHash: txResp?.txhash || txResp?.txHash,
      txResponse: txResp,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
