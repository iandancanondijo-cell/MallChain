/**
 * Claims the treasury wallet's accrued staking rewards into its liquid
 * balance. This is the actual, ongoing, self-sustaining answer to "where
 * does the treasury's stake come from in production": this chain's x/mint
 * module continuously mints new `stake` every block (standard Cosmos SDK
 * inflation — /cosmos/mint/v1beta1/params reports mint_denom="stake"),
 * and x/distribution pays a share of it to every delegator. Once
 * scripts/delegate-treasury.js has bonded some treasury stake to a
 * validator, this job periodically sweeps the rewards that accrue from it
 * back into the treasury's spendable balance — the same balance
 * jobs/operatorStakeWatcher.js draws from to keep the operator wallet
 * funded. Together, the two jobs mean: bootstrap the treasury once
 * (delegate), and from then on stake keeps flowing in on its own.
 *
 * This does NOT eliminate the need for FUND_TREASURY.sh entirely — how
 * much reward income this produces depends on how much is delegated
 * relative to how much the operator spends, a sizing question only real
 * usage data can answer. It does mean the honest long-run answer to
 * "where does production stake come from" is "the chain's own inflation",
 * not "someone has to keep sending money forever."
 *
 * Claiming a reward doesn't lock anything up further (unlike delegating
 * itself), so — unlike delegate-treasury.js — this is safe to run fully
 * unattended.
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const cron = require('node-cron');
const { config } = require('../config');
const logger = require('../utils/logger');
const { treasuryRewardsClaimedTotal, treasuryDelegatedStake } = require('../utils/metrics');
const { pickDefaultValidator, getDelegatorRewards, getDelegation } = require('../utils/staking');

// Below this, claiming would likely cost more in gas than the reward is
// worth — skip and let it keep accruing until it's large enough to be
// worth the transaction fee.
const MIN_CLAIMABLE = BigInt(process.env.TREASURY_REWARDS_MIN_CLAIMABLE || '10000');

async function runTreasuryRewardsSweep() {
  const treasuryMnemonic = process.env.TREASURY_MNEMONIC;
  if (!treasuryMnemonic) {
    logger.warn('treasuryRewardsSweeper', 'TREASURY_MNEMONIC not configured — skipping sweep run');
    return { ok: false, reason: 'treasury-mnemonic-unavailable' };
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(treasuryMnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  const treasuryAddress = account.address;

  let validatorAddress;
  try {
    validatorAddress = await pickDefaultValidator();
  } catch (err) {
    logger.error('treasuryRewardsSweeper', 'could not resolve a validator to check', err, { treasuryAddress });
    return { ok: false, reason: 'validator-lookup-failed' };
  }

  const delegation = await getDelegation(treasuryAddress, validatorAddress).catch((err) => {
    logger.error('treasuryRewardsSweeper', 'delegation query failed', err, { treasuryAddress, validatorAddress });
    return null;
  });

  if (!delegation) {
    // Not an error — the treasury simply hasn't been bootstrapped with a
    // delegation yet (see scripts/delegate-treasury.js). Nothing to sweep.
    treasuryDelegatedStake.set(0);
    logger.info('treasuryRewardsSweeper', 'treasury has no active delegation — nothing to sweep', { treasuryAddress, validatorAddress });
    return { ok: true, swept: false, reason: 'no-delegation' };
  }

  treasuryDelegatedStake.set(Number(delegation.balance.amount));

  let rewards;
  try {
    rewards = await getDelegatorRewards(treasuryAddress);
  } catch (err) {
    logger.error('treasuryRewardsSweeper', 'rewards query failed', err, { treasuryAddress });
    return { ok: false, reason: 'rewards-query-failed' };
  }

  logger.info('treasuryRewardsSweeper', 'checked treasury staking rewards', {
    treasuryAddress,
    validatorAddress,
    delegatedAmount: delegation.balance.amount,
    claimableStake: rewards.stakeAmount,
  });

  if (BigInt(rewards.stakeAmount) < MIN_CLAIMABLE) {
    return { ok: true, swept: false, reason: 'below-minimum', claimable: rewards.stakeAmount };
  }

  try {
    const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
      gasPrice: GasPrice.fromString(config.chain.gasPrice),
    });
    const result = await client.withdrawRewards(treasuryAddress, validatorAddress, 'auto', 'treasuryRewardsSweeper auto-claim');
    if (result.code && Number(result.code) !== 0) {
      throw new Error(result.rawLog || `broadcast failed with code ${result.code}`);
    }
    treasuryRewardsClaimedTotal.inc(rewards.stakeAmount);
    logger.info('treasuryRewardsSweeper', 'claimed treasury staking rewards', {
      treasuryAddress,
      validatorAddress,
      amount: rewards.stakeAmount,
      txHash: result.transactionHash,
    });
    return { ok: true, swept: true, amount: rewards.stakeAmount, txHash: result.transactionHash };
  } catch (err) {
    logger.error('treasuryRewardsSweeper', 'reward claim broadcast failed', err, { treasuryAddress, validatorAddress });
    return { ok: false, reason: 'broadcast-failed' };
  }
}

function start() {
  const schedule = process.env.TREASURY_REWARDS_SWEEP_CRON || '0 */6 * * *'; // every 6 hours
  cron.schedule(schedule, () => {
    runTreasuryRewardsSweep().catch((err) => logger.error('treasuryRewardsSweeper', 'sweep run threw', err));
  });
  logger.info('treasuryRewardsSweeper', 'started', { schedule, minClaimable: MIN_CLAIMABLE.toString() });
}

module.exports = { runTreasuryRewardsSweep, start };
