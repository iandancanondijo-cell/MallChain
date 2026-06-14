const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

const STATUS_MAP = {
  PROPOSAL_STATUS_UNSPECIFIED: 'unknown',
  PROPOSAL_STATUS_DEPOSIT_PERIOD: 'deposit',
  PROPOSAL_STATUS_VOTING_PERIOD: 'active',
  PROPOSAL_STATUS_PASSED: 'passed',
  PROPOSAL_STATUS_REJECTED: 'rejected',
  PROPOSAL_STATUS_FAILED: 'failed',
};

function mapStatus(status) {
  return STATUS_MAP[status] || String(status || 'unknown').toLowerCase();
}

function tallyToNumbers(tally = {}) {
  const yes = BigInt(tally.yes || tally.yes_count || '0');
  const no = BigInt(tally.no || tally.no_count || '0');
  const abstain = BigInt(tally.abstain || tally.abstain_count || '0');
  const veto = BigInt(tally.no_with_veto || tally.no_with_veto_count || '0');
  const total = yes + no + abstain + veto;
  return {
    yes: yes.toString(),
    no: no.toString(),
    abstain: abstain.toString(),
    veto: veto.toString(),
    total: total.toString(),
    yesPct: total > 0n ? Number((yes * 10000n) / total) / 100 : 0,
    noPct: total > 0n ? Number((no * 10000n) / total) / 100 : 0,
    abstainPct: total > 0n ? Number((abstain * 10000n) / total) / 100 : 0,
    vetoPct: total > 0n ? Number((veto * 10000n) / total) / 100 : 0,
  };
}

function normalizeProposal(p) {
  if (!p) return null;
  const messages = p.messages || [];
  const content = p.content || messages[0] || {};
  const title =
    content.title ||
    p.title ||
    messages[0]?.content?.title ||
    `Proposal #${p.id}`;
  const summary =
    content.summary ||
    content.description ||
    p.summary ||
    p.metadata ||
  '';
  const tally = tallyToNumbers(p.final_tally_result || p.tally || {});
  return {
    id: String(p.id),
    status: mapStatus(p.status),
    statusRaw: p.status,
    title,
    summary,
    submitTime: p.submit_time || p.submitTime,
    votingStartTime: p.voting_start_time || p.voting_start_time,
    votingEndTime: p.voting_end_time || p.votingEndTime,
    depositEndTime: p.deposit_end_time || p.depositEndTime,
    totalDeposit: p.total_deposit || p.totalDeposit || [],
    tally,
  };
}

async function fetchTally(id) {
  for (const path of [`v1`, `v1beta1`]) {
    try {
      const url = `${CHAIN_REST}/cosmos/gov/${path}/proposals/${id}/tally`;
      const { data } = await axios.get(url, { timeout: 5000 });
      const tr = data?.tally || data?.tally_result || data;
      return tallyToNumbers(tr);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchUserVote(proposalId, voter) {
  for (const path of [`v1`, `v1beta1`]) {
    try {
      const url = `${CHAIN_REST}/cosmos/gov/${path}/proposals/${proposalId}/votes/${voter}`;
      const { data } = await axios.get(url, { timeout: 5000 });
      const vote = data.vote || data;
      return {
        option: vote.options?.[0]?.option || vote.option,
        voted: true,
      };
    } catch (e) {
      if (e.response?.status === 404) return { voted: false };
    }
  }
  return { voted: false };
}

async function fetchParams() {
  try {
    const { data } = await axios.get(`${CHAIN_REST}/cosmos/gov/v1/params/voting`, { timeout: 5000 });
    return data.voting_params || data.params || null;
  } catch {
    return null;
  }
}

module.exports = {
  normalizeProposal,
  fetchTally,
  fetchUserVote,
  fetchParams,
  tallyToNumbers,
  mapStatus,
};
