const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const BASE_DENOM = config.chain.baseDenom || 'stake';
const DECIMALS = 6;

function fromBaseUnits(amount) {
  return Number(amount || 0) / 10 ** DECIMALS;
}

function sumCoins(coins = []) {
  return coins.reduce((acc, c) => {
    if ((c.denom || c.Denom) === BASE_DENOM) {
      return acc + fromBaseUnits(c.amount || c.Amount);
    }
    return acc;
  }, 0);
}

async function getJson(url) {
  const { data } = await axios.get(url, { timeout: 8000 });
  return data;
}

/**
 * Aggregated staking view for a delegator address.
 */
async function getStakingSummary(address) {
  const delegationsUrl = `${CHAIN_REST}/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}`;
  const rewardsUrl = `${CHAIN_REST}/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(address)}/rewards`;
  const unbondingUrl = `${CHAIN_REST}/cosmos/staking/v1beta1/delegators/${encodeURIComponent(address)}/unbonding_delegations`;
  const balanceUrl = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;

  const [delegationsData, rewardsData, unbondingData, balanceData] = await Promise.all([
    getJson(delegationsUrl).catch(() => ({ delegation_responses: [] })),
    getJson(rewardsUrl).catch(() => ({ rewards: [], total: [] })),
    getJson(unbondingUrl).catch(() => ({ unbonding_responses: [] })),
    getJson(balanceUrl).catch(() => ({ balances: [] })),
  ]);

  const delegations = (delegationsData.delegation_responses || []).map((d) => ({
    validatorAddress: d.delegation?.validator_address,
    shares: d.delegation?.shares,
    amount: d.balance?.amount,
    denom: d.balance?.denom || BASE_DENOM,
    amountDisplay: fromBaseUnits(d.balance?.amount),
  }));

  const totalStaked = delegations.reduce((s, d) => s + d.amountDisplay, 0);

  const rewardsByValidator = (rewardsData.rewards || []).map((r) => ({
    validatorAddress: r.validator_address,
    rewardDisplay: sumCoins(r.reward || []),
  }));

  const pendingRewards =
  sumCoins(rewardsData.total || []) ||
  rewardsByValidator.reduce((s, r) => s + r.rewardDisplay, 0);

  const unbonding = (unbondingData.unbonding_responses || []).flatMap((u) =>
    (u.entries || []).map((e) => ({
      validatorAddress: u.validator_address,
      amountDisplay: fromBaseUnits(e.balance),
      completionTime: e.completion_time,
    }))
  );

  const unbondingTotal = unbonding.reduce((s, u) => s + u.amountDisplay, 0);

  const liquidBalance = (balanceData.balances || [])
    .filter((b) => b.denom === BASE_DENOM)
    .reduce((s, b) => s + fromBaseUnits(b.amount), 0);

  const votingPower = totalStaked;

  return {
    address,
    baseDenom: BASE_DENOM,
    displayDenom: config.chain.displayDenom || 'MAL',
    liquidBalance,
    totalStaked,
    pendingRewards,
    unbondingTotal,
    votingPower,
    delegations,
    rewardsByValidator,
    unbonding,
  };
}

module.exports = {
  getStakingSummary,
  fromBaseUnits,
};
