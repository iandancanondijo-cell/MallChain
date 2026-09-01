const axios = require('axios');
const { config } = require('../config');
const { fromBaseUnits } = require('./mallcoinService');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

async function getJson(url) {
  const { data } = await axios.get(url, { timeout: 8000 });
  return data;
}

// H1: Staking data unavailable sentinel — thrown by getStakingSummary() when
// chain REST is unreachable, gRPC-gateway returns non-2xx, or the response
// body doesn't parse. Controller layer catches this and returns HTTP 503
// with {success:false, error:{code:"STAKING_DATA_UNAVAILABLE"}} so the UI
// can render an explicit "Staking data unavailable" not-ready card instead
// of silently zeroing totals (which the audit flagged as misleading to end
// users).
function stakingDataUnavailable(cause) {
  const err = new Error('Staking data unavailable — chain REST or gRPC-gateway is down');
  err.code = 'STAKING_DATA_UNAVAILABLE';
  err.status = 503;
  if (cause) err.underlying = cause.message || String(cause);
  return err;
}

/**
 * Aggregated staking view for an address, backed by the chain's custom MLCNS
 * reward-pool staking (x/mlcoin StakingRecords) — not standard Cosmos
 * validator delegation, which this chain doesn't use for end-user staking.
 */
async function getStakingSummary(address) {
  const url = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/staking/${encodeURIComponent(address)}`;
  let data;
  try {
    data = await getJson(url);
  } catch (e) {
    // Network / HTTP-level failure: fail loud with explicit not-ready code.
    throw stakingDataUnavailable(e);
  }
  if (!data || typeof data !== 'object') {
    throw stakingDataUnavailable(new Error('unexpected response shape'));
  }
  const entries = data.staking_records || data.stakingRecords || [];

  const toRecord = (entry) => {
    const r = entry.info || entry.Info || {};
    return {
      stakeId: entry.stake_id ?? entry.stakeId,
      stakedAmount: fromBaseUnits(r.staked_amount ?? r.stakedAmount),
      stakeDate: Number(r.stake_date ?? r.stakeDate ?? 0),
      rewardsEarned: fromBaseUnits(r.rewards_earned ?? r.rewardsEarned),
      isActive: Boolean(r.is_active ?? r.isActive),
      unlockHeight: Number(r.unlock_height ?? r.unlockHeight ?? 0),
    };
  };

  const parsed = entries.map(toRecord);
  const active = parsed.filter((r) => r.isActive);
  const history = parsed.filter((r) => !r.isActive);

  const totalStaked = active.reduce((s, r) => s + r.stakedAmount, 0);
  const totalRewardsClaimed = history.reduce((s, r) => s + r.rewardsEarned, 0);

  return {
    address,
    displayDenom: 'MLCNS',
    totalStaked,
    totalRewardsClaimed,
    active,
    history,
  };
}

module.exports = {
  getStakingSummary,
};
