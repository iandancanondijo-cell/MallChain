const axios = require('axios');
const { config } = require('../config');
const {
  normalizeProposal,
  fetchTally,
  fetchUserVote,
  fetchParams,
} = require('../services/governanceService');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

async function fetchProposalsAnyVersion(status) {
  const statusQuery = status ? `?proposal_status=${status}` : '';
  const endpoints = [
    `${CHAIN_REST}/cosmos/gov/v1/proposals${statusQuery}`,
    `${CHAIN_REST}/cosmos/gov/v1beta1/proposals${statusQuery}`,
  ];
  for (const url of endpoints) {
    try {
      const r = await axios.get(url, { timeout: 6000 });
      if (r.data?.proposals?.length || r.data?.proposal) {
        return {
          proposals: r.data.proposals || [r.data.proposal],
          pagination: r.data.pagination || {},
          source: url.includes('v1beta1') ? 'v1beta1' : 'v1',
        };
      }
    } catch {
      /* next */
    }
  }
  return { proposals: [], pagination: {}, source: 'unavailable' };
}

exports.listProposals = async (req, res) => {
  try {
    const { status, voter } = req.query;
    const { proposals, pagination, source } = await fetchProposalsAnyVersion(status);

    const normalized = await Promise.all(
      proposals.map(async (p) => {
        const n = normalizeProposal(p);
        if (!n) return null;
        const liveTally = await fetchTally(p.id);
        if (liveTally) n.tally = liveTally;
        if (voter) {
          n.userVote = await fetchUserVote(p.id, voter);
        }
        return n;
      })
    );

    const active = normalized.filter((p) => p?.status === 'active').length;

    res.json({
      success: true,
      proposals: normalized.filter(Boolean),
      pagination,
      source,
      stats: {
        total: normalized.filter(Boolean).length,
        active,
      },
    });
  } catch (e) {
    console.error('governance proposals error:', e.message);
    res.json({ success: true, proposals: [], pagination: {}, source: 'fallback', stats: { total: 0, active: 0 } });
  }
};

exports.getProposal = async (req, res) => {
  try {
    const urls = [
      `${CHAIN_REST}/cosmos/gov/v1/proposals/${req.params.id}`,
      `${CHAIN_REST}/cosmos/gov/v1beta1/proposals/${req.params.id}`,
    ];
    let resp = null;
    for (const url of urls) {
      resp = await axios.get(url, { timeout: 5000 }).catch(() => null);
      if (resp) break;
    }
    if (!resp) return res.status(404).json({ success: false, error: 'proposal_not_found' });

    const proposal = normalizeProposal(resp.data?.proposal || resp.data);
    const tally = await fetchTally(req.params.id);
    if (proposal && tally) proposal.tally = tally;

    const voter = req.query.voter;
    if (voter && proposal) {
      proposal.userVote = await fetchUserVote(req.params.id, voter);
    }

    const params = await fetchParams();

    return res.json({ success: true, proposal, params });
  } catch (e) {
    console.error('governance proposal error:', e.message);
    res.status(404).json({ success: false, error: 'proposal_not_found' });
  }
};

exports.getUserVote = async (req, res) => {
  try {
    const { id, voter } = req.params;
    const userVote = await fetchUserVote(id, voter);
    return res.json({ success: true, userVote });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

exports.vote = async (req, res) => {
  try {
    const { txBytes, mode } = req.body || {};
    if (!txBytes) {
      return res.status(400).json({
        success: false,
        error: 'tx_bytes_required',
        hint: 'Sign MsgVote on the client and POST { txBytes: base64 }',
      });
    }

    const broadcastUrl = `${CHAIN_REST}/cosmos/tx/v1beta1/txs`;
    const payload = { tx_bytes: txBytes, mode: mode || 'BROADCAST_MODE_SYNC' };
    const r = await axios.post(broadcastUrl, payload, { timeout: 10000 });
    const txResp = r.data?.tx_response || r.data;
    const code = txResp?.code ?? 0;
    if (code !== 0) {
      return res.status(400).json({
        success: false,
        error: txResp?.raw_log || 'vote_failed',
        txResponse: txResp,
      });
    }
    return res.json({
      success: true,
      txHash: txResp?.txhash || txResp?.txHash,
      txResponse: txResp,
    });
  } catch (e) {
    console.error('governance vote broadcast error:', e.message);
    return res.status(500).json({ success: false, error: 'broadcast_failed', detail: e.message });
  }
};

exports.broadcast = exports.vote;
