/**
 * Shared staking/rewards helpers, used by both scripts/delegate-treasury.js
 * (a one-off CLI action) and jobs/treasuryRewardsSweeper.js (a recurring
 * backend job) — lives under src/ rather than scripts/lib/ so a job can
 * depend on it without a job-under-src reaching back into scripts/, which
 * would invert this codebase's actual dependency direction (scripts and
 * jobs both depend on src/, not the other way around).
 *
 * The core idea: this chain's x/mint module continuously creates new
 * `stake` every block (standard Cosmos SDK inflation — see
 * /cosmos/mint/v1beta1/params, mint_denom="stake") and x/distribution pays
 * it out to whoever has stake bonded (delegated) to a validator. That is
 * the chain's real, ongoing, self-sustaining source of `stake` in
 * production — not a wallet someone has to remember to refill by hand
 * forever. Bonding some of the treasury's stake to a validator, then
 * periodically sweeping the rewards it earns back into its liquid balance,
 * turns "where does stake come from" from an open question into a
 * mechanism that already exists on this chain and just needed wiring up.
 */
const { config } = require('../config');

function restBase() {
  return config.chain.rest.replace(/\/$/, '');
}

async function getBondedValidators() {
  const response = await fetch(`${restBase()}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`);
  if (!response.ok) throw new Error(`Validator query failed with status ${response.status}`);
  const data = await response.json();
  return data.validators || [];
}

/**
 * Picks a validator to delegate to when none is specified. On a
 * single-validator devnet this is unambiguous. On a real multi-validator
 * production chain, passing --validator explicitly is strongly preferred —
 * this default just picks the first bonded validator returned, which is
 * NOT a meaningful selection criterion (not by commission, uptime, or
 * decentralization) and exists only so the tooling isn't blocked on that
 * choice being made first.
 */
async function pickDefaultValidator() {
  const validators = await getBondedValidators();
  if (validators.length === 0) throw new Error('No bonded validators found on this chain.');
  return validators[0].operator_address;
}

async function getDelegatorRewards(delegatorAddress) {
  const response = await fetch(`${restBase()}/cosmos/distribution/v1beta1/delegators/${delegatorAddress}/rewards`);
  if (!response.ok) throw new Error(`Rewards query failed with status ${response.status}`);
  const data = await response.json();
  // Reward amounts come back as decimal strings (e.g. "1234.5678000000000000
  // stake") since rewards accrue fractionally between blocks — Math.floor
  // via parseFloat is fine for a "how much is claimable" read, real
  // precision is handled on-chain by the withdraw tx itself.
  const stakeReward = (data.total || []).find((c) => c.denom === 'stake');
  return {
    raw: data,
    stakeAmount: stakeReward ? Math.floor(parseFloat(stakeReward.amount)) : 0,
  };
}

async function getDelegation(delegatorAddress, validatorAddress) {
  const response = await fetch(`${restBase()}/cosmos/staking/v1beta1/validators/${validatorAddress}/delegations/${delegatorAddress}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Delegation query failed with status ${response.status}`);
  const data = await response.json();
  return data.delegation_response || null;
}

module.exports = { getBondedValidators, pickDefaultValidator, getDelegatorRewards, getDelegation };
